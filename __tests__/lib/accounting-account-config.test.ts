import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  requireAccountRef,
  checkAccountConfig,
  accountConfigKeys,
} from '@/lib/accounting/account-config'
import { AccountingConfigError } from '@/lib/accounting/types'
import { QuickBooksProvider } from '@/lib/accounting/quickbooks-provider'
import { XeroProvider } from '@/lib/accounting/xero-provider'
import type { BillPayload, InvoicePayload, PaymentPayload } from '@/lib/accounting/types'

// M4 regression: bill payments and expense/revenue lines used to carry hardcoded
// ledger references — QuickBooks BankAccountRef '35' / AccountRef '7', Xero
// '090' / '200' / '400' — ids from the sandbox the integration was written
// against. In a real chart of accounts they address something else entirely, so
// the sync would have posted money to a plausible-looking wrong account.
//
// These lock in the two halves of the fix: the refs come from configuration,
// and an unconfigured ref fails loudly and non-retryably instead of guessing.

const ALL_ACCOUNT_ENVS = [
  'QUICKBOOKS_BANK_ACCOUNT_ID',
  'QUICKBOOKS_EXPENSE_ACCOUNT_ID',
  'XERO_BANK_ACCOUNT_CODE',
  'XERO_EXPENSE_ACCOUNT_CODE',
  'XERO_REVENUE_ACCOUNT_CODE',
]

// The suite must not inherit a developer's real values from .env — clear the
// slate per test and let each one declare exactly what is configured.
const configure = (values: Record<string, string> = {}) => {
  for (const key of ALL_ACCOUNT_ENVS) vi.stubEnv(key, values[key] ?? '')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

const invoice = (over: Partial<InvoicePayload> = {}): InvoicePayload => ({
  invoice_number: 'INV-1',
  contact_name: 'Acme',
  line_items: [{ description: 'Tour', quantity: 1, unit_price: 1000, amount: 1000 }],
  subtotal: 1000,
  tax_rate: 0,
  tax_amount: 0,
  total_amount: 1000,
  currency: 'EUR',
  issue_date: '2026-08-12',
  status: 'sent',
  internalId: 'id-1',
  ...over,
})

const billPayment = (over: Partial<PaymentPayload> = {}): PaymentPayload => ({
  amount: 500,
  date: '2026-08-12',
  currency: 'EUR',
  reference: 'PAY-1',
  bill_external_id: 'ext-bill-1',
  vendor_external_id: 'ext-vendor-9',
  internalId: 'pay-1',
  ...over,
})

/**
 * Replace the provider's HTTP layer and hand back an accessor for what it was
 * asked to send. The accessor throws when nothing was sent, so "the payload
 * never left" is an assertion rather than a silent pass.
 */
const captureRequest = (provider: any, response: unknown) => {
  let captured: { method: string; endpoint: string; body: any } | null = null
  provider.apiRequest = async (method: string, endpoint: string, body: any) => {
    captured = { method, endpoint, body }
    return response
  }
  return () => {
    if (!captured) throw new Error('no request was sent')
    return captured
  }
}

const bill = (over: Partial<BillPayload> = {}): BillPayload => ({
  bill_number: 'EXP-1',
  vendor_name: 'Nile Cruises Ltd',
  line_items: [{ description: 'Cabin', quantity: 1, unit_price: 500, amount: 500 }],
  total_amount: 500,
  tax_amount: 0,
  currency: 'EUR',
  date: '2026-08-12',
  description: 'Cabin',
  internalId: 'exp-1',
  ...over,
})

describe('requireAccountRef', () => {
  it('returns the configured reference', () => {
    configure({ QUICKBOOKS_BANK_ACCOUNT_ID: '42' })
    expect(requireAccountRef('quickbooks', 'bank')).toBe('42')
  })

  it('trims surrounding whitespace (pasted values carry it)', () => {
    configure({ XERO_BANK_ACCOUNT_CODE: '  090 ' })
    expect(requireAccountRef('xero', 'bank')).toBe('090')
  })

  it('treats a whitespace-only value as unset rather than a valid ref', () => {
    configure({ XERO_BANK_ACCOUNT_CODE: '   ' })
    expect(() => requireAccountRef('xero', 'bank')).toThrow(AccountingConfigError)
  })

  it('names the env var to set, so the error is actionable', () => {
    configure()
    expect(() => requireAccountRef('quickbooks', 'expense')).toThrow(
      /QUICKBOOKS_EXPENSE_ACCOUNT_ID/
    )
    expect(() => requireAccountRef('xero', 'revenue')).toThrow(/XERO_REVENUE_ACCOUNT_CODE/)
  })

  it('is non-retryable — no number of retries sets an env var', () => {
    configure()
    try {
      requireAccountRef('xero', 'expense')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AccountingConfigError)
      expect((err as AccountingConfigError).retryable).toBe(false)
    }
  })
})

describe('checkAccountConfig', () => {
  it('reports every missing slot for the provider', () => {
    configure()
    const xero = checkAccountConfig('xero')
    expect(xero.ok).toBe(false)
    expect(xero.missing.map(m => m.slot).sort()).toEqual(['bank', 'expense', 'revenue'])
    expect(xero.missing.every(m => m.env && m.purpose && m.hint)).toBe(true)
  })

  it('reports ok once the provider is fully configured', () => {
    configure({
      XERO_BANK_ACCOUNT_CODE: '090',
      XERO_EXPENSE_ACCOUNT_CODE: '400',
      XERO_REVENUE_ACCOUNT_CODE: '200',
    })
    expect(checkAccountConfig('xero')).toEqual({ ok: true, missing: [] })
  })

  it('scopes to one provider — Xero being set says nothing about QuickBooks', () => {
    configure({
      XERO_BANK_ACCOUNT_CODE: '090',
      XERO_EXPENSE_ACCOUNT_CODE: '400',
      XERO_REVENUE_ACCOUNT_CODE: '200',
    })
    expect(checkAccountConfig('quickbooks').ok).toBe(false)
    expect(checkAccountConfig('quickbooks').missing.map(m => m.slot).sort()).toEqual([
      'bank',
      'expense',
    ])
  })

  it('accountConfigKeys lists every account env var (for docs and health output)', () => {
    expect(accountConfigKeys().sort()).toEqual([...ALL_ACCOUNT_ENVS].sort())
  })
})

describe('QuickBooks payloads use the configured references', () => {
  const qb = new QuickBooksProvider() as any

  it('bill payment draws on the configured bank account, not the old id 35', async () => {
    configure({ QUICKBOOKS_BANK_ACCOUNT_ID: '4711' })
    // The payment payload is built inline, so intercept the request instead of
    // calling QuickBooks: what matters is the account the money leaves from.
    const sent = captureRequest(qb, { BillPayment: { Id: 'bp-1' } })

    await qb.createPayment(billPayment())

    expect(sent().body.CheckPayment.BankAccountRef.value).toBe('4711')
  })

  it('refuses to pay a bill at all when the bank account is unset', async () => {
    configure()
    const sent = captureRequest(qb, { BillPayment: { Id: 'bp-1' } })

    await expect(qb.createPayment(billPayment())).rejects.toBeInstanceOf(AccountingConfigError)
    expect(sent).toThrow() // nothing was sent
  })

  // The other half of M4: VendorRef was handed the Bill's transaction id.
  it('names the vendor in VendorRef, not the bill', async () => {
    configure({ QUICKBOOKS_BANK_ACCOUNT_ID: '4711' })
    const sent = captureRequest(qb, { BillPayment: { Id: 'bp-1' } })

    await qb.createPayment(billPayment())

    const body = sent().body
    expect(body.VendorRef.value).toBe('ext-vendor-9')
    expect(body.VendorRef.value).not.toBe('ext-bill-1')
    // The bill is still linked — as a LinkedTxn, which is where it belongs.
    expect(body.Line[0].LinkedTxn[0]).toEqual({ TxnId: 'ext-bill-1', TxnType: 'Bill' })
  })

  it('refuses to send a bill payment with no vendor id rather than guess', async () => {
    configure({ QUICKBOOKS_BANK_ACCOUNT_ID: '4711' })
    const sent = captureRequest(qb, { BillPayment: { Id: 'bp-1' } })

    await expect(
      qb.createPayment(billPayment({ vendor_external_id: undefined }))
    ).rejects.toThrow(/VendorRef must name a Vendor/)
    expect(sent).toThrow() // nothing was sent
  })

  it('bill lines code to the configured expense account, not the old id 7', () => {
    configure({ QUICKBOOKS_EXPENSE_ACCOUNT_ID: '64' })
    const mapped = qb.mapToQBBill(bill())
    expect(mapped.Line[0].AccountBasedExpenseLineDetail.AccountRef.value).toBe('64')
  })

  it('refuses to build a bill at all when the expense account is unset', () => {
    configure()
    expect(() => qb.mapToQBBill(bill())).toThrow(AccountingConfigError)
  })
})

describe('Xero payloads use the configured references', () => {
  const xero = new XeroProvider() as any

  it('invoice lines code to the configured revenue account, not the demo 200', () => {
    configure({ XERO_REVENUE_ACCOUNT_CODE: '201' })
    const mapped = xero.mapToXeroInvoice(invoice(), 'ACCREC')
    expect(mapped.LineItems[0].AccountCode).toBe('201')
  })

  it('bill lines code to the configured expense account, not the demo 400', () => {
    configure({ XERO_EXPENSE_ACCOUNT_CODE: '429' })
    const mapped = xero.mapToXeroBill(bill())
    expect(mapped.LineItems[0].AccountCode).toBe('429')
  })

  it('an explicit per-line account_code still wins over the configured default', () => {
    configure({ XERO_REVENUE_ACCOUNT_CODE: '201' })
    const mapped = xero.mapToXeroInvoice(
      invoice({
        line_items: [
          { description: 'Tour', quantity: 1, unit_price: 1000, amount: 1000, account_code: '260' },
        ],
      }),
      'ACCREC'
    )
    expect(mapped.LineItems[0].AccountCode).toBe('260')
  })

  it('does not require the env var when every line carries its own code', () => {
    configure()
    const mapped = xero.mapToXeroInvoice(
      invoice({
        line_items: [
          { description: 'Tour', quantity: 1, unit_price: 600, amount: 600, account_code: '260' },
          { description: 'Transfer', quantity: 1, unit_price: 400, amount: 400, account_code: '261' },
        ],
      }),
      'ACCREC'
    )
    expect(mapped.LineItems.map((l: { AccountCode: string }) => l.AccountCode)).toEqual([
      '260',
      '261',
    ])
  })

  it('refuses to build the payload when even one line falls back to an unset account', () => {
    configure()
    expect(() =>
      xero.mapToXeroInvoice(
        invoice({
          line_items: [
            { description: 'Tour', quantity: 1, unit_price: 600, amount: 600, account_code: '260' },
            { description: 'Transfer', quantity: 1, unit_price: 400, amount: 400 },
          ],
        }),
        'ACCREC'
      )
    ).toThrow(AccountingConfigError)
  })

  it('refuses to build a bill when the expense account is unset', () => {
    configure()
    expect(() => xero.mapToXeroBill(bill())).toThrow(AccountingConfigError)
  })

  it('payment draws on the configured bank account, not the demo 090', async () => {
    configure({ XERO_BANK_ACCOUNT_CODE: '091' })
    const sent = captureRequest(xero, { Payments: [{ PaymentID: 'p-1' }] })

    await xero.createPayment(billPayment())

    expect(sent().body.Payments[0].Account.Code).toBe('091')
  })

  it('refuses to pay at all when the bank account is unset', async () => {
    configure()
    const sent = captureRequest(xero, { Payments: [{ PaymentID: 'p-1' }] })

    await expect(xero.createPayment(billPayment())).rejects.toBeInstanceOf(AccountingConfigError)
    expect(sent).toThrow() // nothing was sent
  })
})
