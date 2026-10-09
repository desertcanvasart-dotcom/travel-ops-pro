// Audit of 2026-10-09, round 3 (lower items, travel-ops-pro):
//   - a long invoice PDF never started a new page: totals, balance due and
//     payment instructions ran under the footer or off the A4 sheet;
//   - the itinerary email printed "JPY 450000.00" and the client's name as
//     raw HTML;
//   - recipient language was looked up by email across every org.
import { describe, it, expect } from 'vitest'
import { generateInvoicePDF } from '@/lib/invoice-pdf-generator'
import { generateEmailTemplate } from '@/lib/communication-utils'
import { resolveClientLocaleByEmail } from '@/lib/i18n/recipient-locale'
import { encodeEmailHeader } from '@/lib/http/safe-header'

const text = (pdf: { output: () => string }) => pdf.output()

describe('a long invoice', () => {
  it('breaks across pages and keeps its totals and payment instructions', () => {
    const lines = Array.from({ length: 22 }, (_, i) => ({ description: `Insurance — traveller ${i + 1}`, quantity: 1, unit_price: 100, amount: 100 }))
    const pdf = generateInvoicePDF({
      id: 'i', invoice_number: 'INV-9', invoice_type: 'deposit', deposit_percent: 20, trip_total: 11000,
      client_name: 'Aiko', client_email: 'a@x.jp', line_items: lines, subtotal: 2200, tax_rate: 0, tax_amount: 0,
      discount_amount: 0, total_amount: 2200, currency: 'EUR', amount_paid: 0, balance_due: 2200, status: 'sent',
      issue_date: '2026-10-01', due_date: '2026-10-20', notes: null, payment_terms: 'Deposit to confirm.',
      payment_instructions: 'Bank: Example Bank\nIBAN: XX00 0000 0000 0000',
    } as never)
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1)
    const out = text(pdf)
    expect(out).toContain('traveller 22')
    expect(out).toContain('Payment Instructions')
    expect(out).toContain('IBAN')
  })
})

describe('the itinerary email', () => {
  const html = generateEmailTemplate('Smith & <Co>', 'ITN-1', 'Kyoto <b>tour</b>', '450000', 'JPY', 'en')
  it('prints yen as money', () => {
    expect(html).not.toContain('450000.00')
    expect(html).toContain('450,000')
  })
  it('escapes the client’s and the trip’s text', () => {
    expect(html).toContain('Smith &amp; &lt;Co&gt;')
    expect(html).not.toContain('<b>tour</b>')
  })
})

describe('headers', () => {
  it('a Japanese subject is an encoded-word; ASCII passes through', () => {
    expect(encodeEmailHeader('Hello')).toBe('Hello')
    expect(encodeEmailHeader('ご旅行のご案内')).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/)
  })
})

describe('the recipient’s language', () => {
  it('is read from the sending org’s own client record', async () => {
    const filters: Array<[string, unknown]> = []
    const chain: Record<string, unknown> = {}
    chain.select = () => chain
    chain.eq = (c: string, v: unknown) => { filters.push([c, v]); return chain }
    chain.limit = () => chain
    chain.maybeSingle = async () => ({ data: { preferred_language: 'ja' }, error: null })
    const supabase = { from: () => chain } as never
    expect(await resolveClientLocaleByEmail(supabase, 'a@x.jp', 'org-1')).toBe('ja')
    expect(filters).toContainEqual(['org_id', 'org-1'])
  })
})
