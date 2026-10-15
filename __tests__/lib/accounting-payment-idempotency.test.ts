import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QuickBooksProvider } from '@/lib/accounting/quickbooks-provider'
import { XeroProvider } from '@/lib/accounting/xero-provider'

// H7: a payment created in the books but whose sync-log write then failed was
// created AGAIN on retry. Each payment now carries a key the provider dedupes on.

beforeAll(() => {
  vi.stubEnv('QUICKBOOKS_BANK_ACCOUNT_ID', '35')
  vi.stubEnv('XERO_BANK_ACCOUNT_CODE', '090')
})
afterAll(() => vi.unstubAllEnvs())
afterEach(() => vi.unstubAllGlobals())

function captureFetch(json: unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(json), { status: 200 })
  }))
  return calls
}

describe('QuickBooks', () => {
  it('an invoice payment carries requestid', async () => {
    const calls = captureFetch({ Payment: { Id: '9' } })
    const qb = new QuickBooksProvider()
    qb.setCredentials('t', 'realm')
    await qb.createPayment({ amount: 10, currency: 'EUR', date: '2026-10-15', internalId: 'x', invoice_external_id: '5', idempotency_key: 'ip-abc' })
    expect(calls[0].url).toMatch(/\/payment\?requestid=ip-abc$/)
  })
  it('a bill payment carries requestid', async () => {
    const calls = captureFetch({ BillPayment: { Id: '9' } })
    const qb = new QuickBooksProvider()
    qb.setCredentials('t', 'realm')
    await qb.createPayment({ amount: 10, currency: 'EUR', date: '2026-10-15', internalId: 'x', bill_external_id: '5', vendor_external_id: '7', idempotency_key: 'ep-abc' })
    expect(calls[0].url).toMatch(/\/billpayment\?requestid=ep-abc$/)
  })
  it('no key, no requestid', async () => {
    const calls = captureFetch({ Payment: { Id: '9' } })
    const qb = new QuickBooksProvider()
    qb.setCredentials('t', 'realm')
    await qb.createPayment({ amount: 10, currency: 'EUR', date: '2026-10-15', internalId: 'x', invoice_external_id: '5' })
    expect(calls[0].url).not.toContain('requestid')
  })
})

describe('Xero', () => {
  it('a payment carries Idempotency-Key', async () => {
    const calls = captureFetch({ Payments: [{ PaymentID: 'p' }] })
    const xero = new XeroProvider()
    xero.setCredentials('t', 'tenant')
    await xero.createPayment({ amount: 10, currency: 'EUR', date: '2026-10-15', internalId: 'x', invoice_external_id: '5', idempotency_key: 'ip-abc' })
    expect((calls[0].init.headers as Record<string, string>)['Idempotency-Key']).toBe('ip-abc')
  })
})

describe('sync-service keys each payment', () => {
  const code = readFileSync(join(process.cwd(), 'lib/accounting/sync-service.ts'), 'utf8')
  it('invoice payments by payment id, expense payments by expense id', () => {
    expect(code).toContain('idempotency_key: `ip-${paymentId}`')
    expect(code).toContain('idempotency_key: `ep-${expenseId}`')
  })
})
