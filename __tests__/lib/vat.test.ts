// ============================================
// VAT: the rule, and the marker every client document carries
// ============================================
// Owner's decision (2026-10-13): a recorded VAT amount, 14% unless the company
// sets another rate, and every document says "VAT 14% included: …" or "VAT
// not applied" — never silent. lib/vat.ts is the rule; these pin it, and that
// each document type renders the marker in both states.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_VAT_RATE, normaliseVatRate, vatFor, vatColumns, vatInsertColumns, parseVatApplied,
  readVat, readInvoiceVat, vatOnLiveNet, totalWithVat, vatMarker, vatTextLines, vatInPayment,
  vatInsideGross, tripVatFromQuote, getOrgVatRate, formatVatRate,
} from '@/lib/vat'
import { quotePdfTotalsHtml } from '@/lib/b2b/quote-pdf-totals'
import { generateInvoicePDF } from '@/lib/invoice-pdf-generator'
import { receiptVatLine } from '@/lib/receipt-pdf-generator'
import { contractVatLine } from '@/lib/contract-pdf-generator'
import { generateEmailTemplate } from '@/lib/communication-utils'
import { generateReminderEmail } from '@/lib/invoices/reminder-email'

const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')

describe('the rate', () => {
  it('defaults to 14 and is a percentage', () => {
    expect(DEFAULT_VAT_RATE).toBe(14)
    expect(normaliseVatRate('7.5')).toBe(7.5)
    expect(normaliseVatRate(0)).toBe(0)
    expect(normaliseVatRate(101)).toBeNull()
    expect(normaliseVatRate(-1)).toBeNull()
    expect(normaliseVatRate('')).toBeNull()
    expect(formatVatRate(14)).toBe('14')
    expect(formatVatRate(7.5)).toBe('7.5')
  })

  it('is the company\'s, read safely: unreadable or missing gives 14', async () => {
    const db = (data: unknown, error: unknown = null) => ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }) }),
    })
    expect(await getOrgVatRate(db({ vat_rate: 10 }), 'org-1')).toBe(10)
    expect(await getOrgVatRate(db(null, { message: 'column organizations.vat_rate does not exist' }), 'org-1')).toBe(14)
    expect(await getOrgVatRate(db({ vat_rate: 10 }), null)).toBe(14)
  })
})

describe('vatFor', () => {
  it('is net × rate / 100 in the currency\'s minor unit', () => {
    expect(vatFor(1000, 14, 'EUR')).toBe(140)
    expect(vatFor(1234.56, 14, 'EUR')).toBe(172.84)
  })
  it('JPY: whole yen', () => {
    // 123,457 × 14% = 17,283.98 → ¥17,284
    expect(vatFor(123457, 14, 'JPY')).toBe(17284)
    // 1,003 × 14% = 140.42 → ¥140
    expect(vatFor(1003, 14, 'JPY')).toBe(140)
  })
  it('nothing on a zero or broken net', () => {
    expect(vatFor(0, 14, 'EUR')).toBe(0)
    expect(vatFor('x', 14, 'EUR')).toBe(0)
    expect(vatFor(100, 0, 'EUR')).toBe(0)
  })
})

describe('what a document records', () => {
  it('applied: the rate used and the amount; not applied: null and 0, whatever the setting', () => {
    expect(vatColumns({ applied: true, net: 100000, rate: 14, currency: 'JPY' })).toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 14000 })
    expect(vatColumns({ applied: false, net: 100000, rate: 14, currency: 'JPY' })).toEqual({ vat_applied: false, vat_rate: null, vat_amount: 0 })
  })
  it('an insert writes the columns only when VAT is on (the defaults say off)', () => {
    expect(vatInsertColumns({ vat_applied: false, vat_rate: null, vat_amount: 0 })).toEqual({})
    expect(vatInsertColumns({ vat_applied: true, vat_rate: 14, vat_amount: 1 })).toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 1 })
  })
  it('the flag from a request: real booleans and form values only', () => {
    expect(parseVatApplied(true)).toBe(true)
    expect(parseVatApplied('on')).toBe(true)
    expect(parseVatApplied(false)).toBe(false)
    expect(parseVatApplied(undefined)).toBeUndefined()
    expect(parseVatApplied('maybe')).toBeUndefined()
  })
  it('reading a row: an unflagged row has no VAT, whatever amounts it holds', () => {
    expect(readVat({ vat_applied: false, vat_rate: 14, vat_amount: 5 })).toEqual({ vat_applied: false, vat_rate: null, vat_amount: 0 })
    expect(readVat({ vat_applied: true, vat_rate: '14', vat_amount: '140' })).toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 140 })
    expect(readVat(null).vat_applied).toBe(false)
  })
  it('an invoice\'s VAT is its tax columns; a pre-migration row with tax counts as applied', () => {
    expect(readInvoiceVat({ vat_applied: true, tax_rate: 10, tax_amount: 10000 })).toEqual({ vat_applied: true, vat_rate: 10, vat_amount: 10000 })
    expect(readInvoiceVat({ tax_rate: 10, tax_amount: 10000 })).toMatchObject({ vat_applied: true })
    expect(readInvoiceVat({ vat_applied: false, tax_amount: 0 })).toEqual({ vat_applied: false, vat_rate: null, vat_amount: 0 })
  })
  it('a trip takes the flag and rate from its quote — nothing from a quote without the columns', () => {
    expect(tripVatFromQuote({ vat_applied: true, vat_rate: 14, vat_amount: 1 } as never)).toEqual({ vat_applied: true, vat_rate: 14 })
    expect(tripVatFromQuote({ vat_applied: false })).toEqual({ vat_applied: false, vat_rate: null })
    expect(tripVatFromQuote({ selling_price: 1 } as never)).toEqual({})
  })
  it('a trip\'s VAT follows its live total at the RECORDED rate', () => {
    expect(vatOnLiveNet({ vat_applied: true, vat_rate: 14 }, 200000, 'JPY')).toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 28000 })
    expect(vatOnLiveNet({ vat_applied: false, vat_rate: 14 }, 200000, 'JPY').vat_amount).toBe(0)
  })
  it('total incl. VAT = net + VAT', () => {
    expect(totalWithVat(100000, { vat_applied: true, vat_amount: 14000 }, 'JPY')).toBe(114000)
    expect(totalWithVat(100000, { vat_applied: false, vat_amount: 14000 }, 'JPY')).toBe(100000)
  })
  it('a payment carries its share of the invoice\'s recorded VAT', () => {
    expect(vatInPayment(57000, { vat_applied: true, tax_rate: 14, tax_amount: 14000, total_amount: 114000 }, 'JPY')).toMatchObject({ vat_amount: 7000 })
    expect(vatInPayment(57000, { vat_applied: false, tax_amount: 0, total_amount: 114000 }, 'JPY').vat_applied).toBe(false)
  })
  it('a payment on a trip with VAT: the VAT inside the gross', () => {
    expect(vatInsideGross(114000, { vat_applied: true, vat_rate: 14 }, 'JPY')).toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 14000 })
    expect(vatInsideGross(114000, { vat_applied: false }, 'JPY').vat_applied).toBe(false)
  })
})

describe('the marker', () => {
  const on = { vat_applied: true, vat_rate: 14, vat_amount: 14000 }
  const off = { vat_applied: false, vat_rate: null, vat_amount: 0 }
  it('English', () => {
    expect(vatMarker(on, 'JPY')).toBe('VAT 14% included: ¥14,000')
    expect(vatMarker(off, 'JPY')).toBe('VAT not applied')
  })
  it('Japanese', () => {
    expect(vatMarker(on, 'JPY', 'ja')).toBe('VAT（14%）適用：¥14,000')
    expect(vatMarker(off, 'JPY', 'ja')).toBe('VAT 不適用')
  })
  it('text lines add the total incl. VAT only when VAT is on', () => {
    expect(vatTextLines(on, 100000, 'JPY')).toEqual(['VAT 14% included: ¥14,000', 'Total incl. VAT: ¥114,000'])
    expect(vatTextLines(off, 100000, 'JPY')).toEqual(['VAT not applied'])
    expect(vatTextLines(on, 100000, 'JPY', 'ja')).toEqual(['VAT（14%）適用：¥14,000', 'VAT込み合計：¥114,000'])
  })
  it('the i18n strings say the same in both languages', () => {
    const en = JSON.parse(src('messages/en.json')).vat
    const ja = JSON.parse(src('messages/ja.json')).vat
    expect(en.applied).toBe('VAT {rate}% included: {amount}')
    expect(en.notApplied).toBe('VAT not applied')
    expect(ja.applied).toBe('VAT（{rate}%）適用：{amount}')
    expect(ja.notApplied).toBe('VAT 不適用')
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort())
  })
})

describe('every document renders the marker, in both states', () => {
  it('B2B quote PDF: net, VAT line and total incl. VAT — or the total and "not applied"', () => {
    const on = quotePdfTotalsHtml({ selling_price: 100000, currency: 'JPY', vat_applied: true, vat_rate: 14, vat_amount: 14000 }, 'en', 'Total')
    expect(on).toContain('Net price')
    expect(on).toContain('VAT 14% included: ¥14,000')
    expect(on).toContain('TOTAL INCL. VAT')
    expect(on).toContain('¥114,000')
    const off = quotePdfTotalsHtml({ selling_price: 100000, currency: 'JPY', vat_applied: false }, 'ja', '合計')
    expect(off).toContain('¥100,000')
    expect(off).toContain('VAT 不適用')
    expect(off).not.toContain('VAT込み合計')
    expect(src('app/api/b2b/quotes/[id]/pdf/route.ts')).toContain('quotePdfTotalsHtml(quote, locale, labels.tableTotal)')
  })

  it('invoice PDF', () => {
    const base = {
      id: 'i', invoice_number: 'INV-1', invoice_type: 'standard', client_name: 'Aiko', client_email: '', subtotal: 100000,
      discount_amount: 0, currency: 'EUR', amount_paid: 0, status: 'sent', issue_date: '2026-10-01', due_date: '2026-10-20',
      notes: null, payment_terms: null, payment_instructions: null,
      line_items: [{ description: 'Trip', quantity: 1, unit_price: 1000, amount: 1000 }],
    }
    const on = generateInvoicePDF({ ...base, vat_applied: true, tax_rate: 14, tax_amount: 140, total_amount: 1140, balance_due: 1140 } as never).output()
    expect(on).toContain('VAT 14% included:')
    const off = generateInvoicePDF({ ...base, vat_applied: false, tax_rate: 0, tax_amount: 0, total_amount: 1000, balance_due: 1000 } as never).output()
    expect(off).toContain('VAT not applied')
  })

  it('receipt: this payment\'s share of the invoice\'s VAT', () => {
    expect(receiptVatLine({ amount: 570, currency: 'EUR' }, { invoice_number: 'I', client_name: 'C', total_amount: 1140, currency: 'EUR', vat_applied: true, tax_rate: 14, tax_amount: 140 })).toBe('VAT 14% included: €70.00')
    expect(receiptVatLine({ amount: 570, currency: 'EUR' }, { invoice_number: 'I', client_name: 'C', total_amount: 1000, currency: 'EUR' })).toBe('VAT not applied')
  })

  it('contract', () => {
    expect(contractVatLine({ vat_applied: true, vat_rate: 14 }, 2000, 'EUR')).toBe('VAT 14% included: €280.00')
    expect(contractVatLine(null, 2000, 'EUR')).toBe('VAT not applied')
  })

  it('itinerary email', () => {
    expect(generateEmailTemplate('C', 'ITN-1', 'Nile', '100000', 'JPY', 'en', undefined, { vat_applied: true, vat_rate: 14 })).toContain('VAT 14% included: ¥14,000')
    expect(generateEmailTemplate('C', 'ITN-1', 'Nile', '100000', 'JPY', 'ja', undefined, null)).toContain('VAT 不適用')
  })

  it('invoice reminder email', () => {
    const inv = { invoice_number: 'INV-1', client_name: 'C', issue_date: '2026-10-01', due_date: '2026-10-20', currency: 'JPY', balance_due: 114000, total_amount: 114000 }
    expect(generateReminderEmail({ ...inv, vat_applied: true, tax_rate: 14, tax_amount: 14000 }, 'default', 'en').html).toContain('VAT 14% included: ¥14,000')
    expect(generateReminderEmail({ ...inv, vat_applied: false, tax_amount: 0 }, 'default', 'ja').html).toContain('VAT 不適用')
  })

  it('itinerary PDF, share page, portal, WhatsApp invoice and receipt state it (source)', () => {
    // The trip's extras lines are left out of its VAT since the owner's
    // 2026-10-13 rule, so the PDF now passes the trip with them added up.
    expect(src('lib/pdf-generator.ts')).toContain('const tripVat = { ...itinerary, vat_excluded: tripVatExcluded(days) }')
    expect(src('lib/pdf-generator.ts')).toContain('vatTextLines(vatOnLiveNet(tripVat, totalPrice, currency), totalPrice, currency, locale)')
    expect(src('app/share/[token]/page.tsx')).toContain('{vatMarker(vat, it.currency)}')
    expect(src('app/portal/[token]/page.tsx')).toMatch(/vatMarker\(vatOnLiveNet\(tripVat, payment\.total, payment\.currency\), payment\.currency, 'ja'\)/)
    expect(src('app/api/whatsapp/send-invoice/route.ts')).toContain('vatMarker(readInvoiceVat(invoice), invoice.currency)')
    expect(src('app/api/whatsapp/send-receipt/route.ts')).toContain('vatMarker(receipt.vat')
    expect(src('app/api/whatsapp/send-contract/route.ts')).toContain('vatMarker(vatOnLiveNet(contractData.vat')
  })

  it('the screens show the token, and the forms the toggle (source)', () => {
    for (const p of ['app/b2b/quotes/[id]/page.tsx', 'app/b2c/quotes/[id]/page.tsx', 'app/invoices/[id]/page.tsx', 'app/invoices/invoices-content.tsx']) {
      const s = src(p)
      expect(s, p).toContain('<VatToken')
      expect(s, p).toContain('<VatToggle')
    }
    for (const p of ['app/b2b/quotes/page.tsx', 'app/b2c/quotes/page.tsx', 'app/itineraries/[id]/page.tsx', 'app/bookings/[id]/page.tsx', 'app/documents/receipt/[id]/page.tsx', 'app/documents/invoice/[id]/page.tsx']) {
      expect(src(p), p).toContain('<VatToken')
    }
    expect(src('app/b2b/calculator/[id]/page.tsx')).toContain('vat_applied: vatApplied')
    expect(src('app/b2c/quotes/page.tsx')).toContain('vat_applied: vatApplied')
  })
})

describe('the flag travels from the quote', () => {
  it('convert carries it to the trip; booking carries the booked quote\'s; the invoice inherits the trip\'s', () => {
    const convert = src('app/api/b2b/quotes/[id]/convert/route.ts')
    expect(convert.match(/tripVatFromQuote\(quote\)/g)?.length).toBe(2)
    expect(src('app/api/bookings/from-quote/route.ts')).toContain("update({ status: 'confirmed', ...tripVatFromQuote(quoteVat) })")
    // The invoice side is exercised in __tests__/api/vat-documents.test.ts.
    expect(src('app/api/invoices/route.ts')).toContain('resolveInvoiceVat(undefined, { parent: parentRow, itinerary: tripRow })')
  })
})
