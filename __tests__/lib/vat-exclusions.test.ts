// ============================================
// VAT leaves extras and insurance out of its base
// ============================================
// Owner's decision (2026-10-13): "VAT is to be added on top of the price,
// with the token functionality to include and exclude. No taxes over extras
// or insurance." VAT = (net − extras − insurance) × rate, rounded to the
// currency's unit; the document records the base it taxed (vat_base) when
// something was left out, and its marker says so. These pin the pure rule and
// that every renderer carries the note.
import { describe, it, expect } from 'vitest'
import {
  vatBase, vatColumns, vatUpdateColumns, vatInsertColumns, readVat, readInvoiceVat, vatOnLiveNet, vatInPayment,
  vatInsideGross, vatMarker, vatTextLines, vatExcludesExtras, quoteVatExcluded, tripVatExcluded, tripVatExcludedShare,
  offerVatExcluded, invoiceLinesVatExcluded, invoiceVatExcluded, isVatExemptCategory, loadTripVatExtras, totalWithVat,
} from '@/lib/vat'
import { invoiceNet, invoiceTotals, switchInvoiceVat } from '@/lib/invoices/totals'
import { quotePdfTotalsHtml } from '@/lib/b2b/quote-pdf-totals'
import { generateInvoicePDF } from '@/lib/invoice-pdf-generator'
import { receiptVatLine } from '@/lib/receipt-pdf-generator'
import { contractVatLine } from '@/lib/contract-pdf-generator'
import { generateEmailTemplate } from '@/lib/communication-utils'
import { generateReminderEmail } from '@/lib/invoices/reminder-email'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')

describe('the base', () => {
  it('is the net less extras and insurance, never below zero', () => {
    expect(vatBase(100000, 30000, 'JPY')).toBe(70000)
    expect(vatBase(100000, 0, 'JPY')).toBe(100000)
    expect(vatBase(100, 250, 'EUR')).toBe(0)
    expect(vatBase(100, -5, 'EUR')).toBe(100)
  })

  it('VAT is on the base, in whole yen for JPY', () => {
    // (123,457 − 12,200) × 14% = 15,575.98 → ¥15,576
    expect(vatColumns({ applied: true, net: 123457, rate: 14, currency: 'JPY', excluded: 12200 }))
      .toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 15576, vat_base: 111257 })
    // EUR keeps cents: (1,234.56 − 200) × 14% = 144.8384 → €144.84
    expect(vatColumns({ applied: true, net: 1234.56, rate: 14, currency: 'EUR', excluded: 200 }).vat_amount).toBe(144.84)
  })

  it('nothing left out: no vat_base, exactly the record from before the rule', () => {
    expect(vatColumns({ applied: true, net: 100000, rate: 14, currency: 'JPY', excluded: 0 })).toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 14000 })
    expect(vatColumns({ applied: false, net: 100000, rate: 14, currency: 'JPY', excluded: 5000 })).toEqual({ vat_applied: false, vat_rate: null, vat_amount: 0 })
  })

  it('an insert writes vat_base only when VAT is on and something was left out', () => {
    expect(vatInsertColumns(vatColumns({ applied: true, net: 1000, rate: 14, currency: 'EUR', excluded: 100 }))).toMatchObject({ vat_base: 900, vat_amount: 126 })
    expect(vatInsertColumns(vatColumns({ applied: false, net: 1000, rate: 14, currency: 'EUR', excluded: 100 }))).toEqual({})
  })

  it('an update clears a recorded base that no longer applies, and never names the column otherwise', () => {
    const plain = vatColumns({ applied: false, net: 1000, rate: 14, currency: 'EUR' })
    expect(vatUpdateColumns(plain, { vat_base: 900 })).toEqual({ vat_applied: false, vat_rate: null, vat_amount: 0, vat_base: null })
    expect(vatUpdateColumns(plain, {})).toEqual({ vat_applied: false, vat_rate: null, vat_amount: 0 })
    const withBase = vatColumns({ applied: true, net: 1000, rate: 14, currency: 'EUR', excluded: 100 })
    expect(vatUpdateColumns(withBase, null)).toEqual(withBase)
  })

  it('the categories left out', () => {
    for (const c of ['extra', 'Extras', 'extras_catalogue', 'insurance']) expect(isVatExemptCategory(c), c).toBe(true)
    for (const c of ['accommodation', 'guide', 'supplies', '', null]) expect(isVatExemptCategory(c), String(c)).toBe(false)
  })
})

describe('reading what a document recorded', () => {
  it('a recorded base comes back; a document from before the rule has none', () => {
    expect(readVat({ vat_applied: true, vat_rate: 14, vat_amount: 9800, vat_base: '70000' })).toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 9800, vat_base: 70000 })
    expect(readVat({ vat_applied: true, vat_rate: 14, vat_amount: 14000, vat_base: null })).toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 14000 })
    expect(readVat({ vat_applied: false, vat_base: 1 })).toEqual({ vat_applied: false, vat_rate: null, vat_amount: 0 })
    expect(readInvoiceVat({ vat_applied: true, tax_rate: 14, tax_amount: 9800, vat_base: 70000 })).toMatchObject({ vat_base: 70000 })
    // Its recorded amount is never re-rated by reading it.
    expect(readInvoiceVat({ vat_applied: true, tax_rate: 14, tax_amount: 14000 })).toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 14000 })
  })
})

describe('the marker, in both states, with the note', () => {
  const left = { vat_applied: true, vat_rate: 14, vat_amount: 9800, vat_base: 70000 }
  const whole = { vat_applied: true, vat_rate: 14, vat_amount: 14000 }
  const off = { vat_applied: false, vat_rate: null, vat_amount: 0 }
  it('English', () => {
    expect(vatMarker(left, 'JPY')).toBe('VAT 14% included: ¥9,800 (extras and insurance not taxed)')
    expect(vatMarker(whole, 'JPY')).toBe('VAT 14% included: ¥14,000')
    expect(vatMarker(off, 'JPY')).toBe('VAT not applied')
  })
  it('Japanese', () => {
    expect(vatMarker(left, 'JPY', 'ja')).toBe('VAT（14%）適用：¥9,800（オプション・保険はVAT対象外）')
    expect(vatMarker(off, 'JPY', 'ja')).toBe('VAT 不適用')
  })
  it('the total incl. VAT is the whole net plus the VAT — extras are billed, just not taxed', () => {
    expect(vatTextLines(left, 100000, 'JPY')).toEqual(['VAT 14% included: ¥9,800 (extras and insurance not taxed)', 'Total incl. VAT: ¥109,800'])
    expect(totalWithVat(100000, left, 'JPY')).toBe(109800)
  })
  it('the screen token reads the same i18n string, in en and ja', () => {
    const en = JSON.parse(src('messages/en.json')).vat
    const ja = JSON.parse(src('messages/ja.json')).vat
    expect(en.appliedExcludes).toBe('VAT {rate}% included: {amount} (extras and insurance not taxed)')
    expect(ja.appliedExcludes).toBe('VAT（{rate}%）適用：{amount}（オプション・保険はVAT対象外）')
    expect(src('app/components/Vat.tsx')).toContain("t(vatExcludesExtras(vat) ? 'appliedExcludes' : 'applied'")
    expect(vatExcludesExtras(left)).toBe(true)
    expect(vatExcludesExtras({ ...left, vat_applied: false })).toBe(false)
  })
})

describe('B2B quote: catalogue extras', () => {
  const snapshot = [
    { service_name: 'Hotel', service_category: 'accommodation', rate_source: 'accommodation_rates', line_total: 800 },
    // cost only: takes the quote's margin
    { service_name: 'Fast-track', service_category: 'extra', rate_source: 'extras_catalogue', line_total: 40, extra: { pinned: false, sell_total: null } },
    // pinned: its set price as it is
    { service_name: 'Balloon', service_category: 'extra', rate_source: 'extras_catalogue', line_total: 150, extra: { pinned: true, sell_total: 200 } },
  ]
  it('their share of the selling price: cost × margin, or the set price, then the season premium', () => {
    // 40 × 1.25 + 200 = 250
    expect(quoteVatExcluded({ services_snapshot: snapshot, margin_percent: 25, season_uplift_percent: 0 })).toBe(250)
    // × 1.10 for a 10% high-season premium
    expect(quoteVatExcluded({ services_snapshot: snapshot, margin_percent: 25, season_uplift_percent: 10 })).toBe(275)
  })
  it('a trip line of type extra (a quote made from a trip) and an insurance line count; nothing else does', () => {
    expect(quoteVatExcluded({ services_snapshot: [{ service_category: 'extra', rate_source: 'itinerary', line_total: 100 }, { service_category: 'insurance', line_total: 50 }, { service_category: 'guide', line_total: 999 }], margin_percent: 20 })).toBe(180)
    expect(quoteVatExcluded({ services_snapshot: null })).toBe(0)
  })
})

describe('trip lines', () => {
  const days = [
    { services: [{ service_type: 'accommodation', total_cost: 800, client_price: 1000 }, { service_type: 'extra', total_cost: 80, client_price: 100 }] },
    // no client price yet: the default 25% margin, as the page's total
    { services: [{ service_type: 'extra', total_cost: 40 }] },
  ]
  it('the client price of the extras lines', () => {
    expect(tripVatExcluded(days)).toBe(150)
    expect(tripVatExcludedShare({ vat_excluded: 150, vat_net: 1150 })).toBeCloseTo(150 / 1150)
    expect(tripVatExcludedShare({ vat_excluded: 0, vat_net: 0 })).toBe(0)
  })
  it('a trip\'s VAT is on its live total less its extras, at the recorded rate', () => {
    expect(vatOnLiveNet({ vat_applied: true, vat_rate: 14, vat_excluded: 150 }, 1150, 'EUR')).toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 140, vat_base: 1000 })
    expect(vatOnLiveNet({ vat_applied: false, vat_excluded: 150 }, 1150, 'EUR').vat_amount).toBe(0)
  })
  it('read from the database, never throwing', async () => {
    const tables: Record<string, any[]> = {
      itinerary_days: [{ id: 'd1', itinerary_id: 'it-1' }, { id: 'd2', itinerary_id: 'it-1' }],
      itineraries: [{ id: 'it-1', total_cost: 0, season_uplift_amount: 50 }],
      itinerary_services: [
        { itinerary_day_id: 'd1', service_type: 'accommodation', total_cost: 800, client_price: 1000 },
        { itinerary_day_id: 'd2', service_type: 'extra', total_cost: 80, client_price: 100 },
      ],
    }
    const db = {
      from: (t: string) => {
        let rows = tables[t] ?? []
        const b: any = {
          select: () => b,
          eq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return b },
          in: (c: string, v: unknown[]) => { rows = rows.filter(r => v.includes(r[c])); return b },
          maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
          then: (res: (x: unknown) => unknown) => res({ data: rows, error: null }),
        }
        return b
      },
    }
    expect(await loadTripVatExtras(db, 'it-1')).toEqual({ vat_net: 1150, vat_excluded: 100, excluded_cost: 80 })
    expect(await loadTripVatExtras({ from: () => { throw new Error('boom') } }, 'it-1')).toEqual({ vat_net: 0, vat_excluded: 0, excluded_cost: 0 })
    expect(await loadTripVatExtras(db, null)).toEqual({ vat_net: 0, vat_excluded: 0, excluded_cost: 0 })
  })
})

describe('B2C offer', () => {
  it('the extras\' share of the price is their share of the cost', () => {
    // cost 4,000 of which 400 extras; price 5,000 → 500 not taxed
    expect(offerVatExcluded({ sellingPrice: 5000, cost: 4000, extrasCost: 400, currency: 'EUR' })).toBe(500)
    expect(offerVatExcluded({ sellingPrice: 123457, cost: 100000, extrasCost: 3333, currency: 'JPY' })).toBe(4115)
    expect(offerVatExcluded({ sellingPrice: 5000, cost: 0, extrasCost: 400, currency: 'EUR' })).toBe(0)
  })
})

describe('invoice', () => {
  it('server-added lines are tagged; the caller\'s are not counted', () => {
    expect(invoiceLinesVatExcluded([
      { description: 'Trip', amount: 100000 },
      { description: 'Insurance', amount: 12200, source: 'insurance' },
      { description: 'Balloon', quantity: 2, unit_price: 9000, source: 'extra' },
      { description: 'Odd', amount: 5, source: 'other' },
    ])).toBe(30200)
    expect(invoiceLinesVatExcluded(null)).toBe(0)
  })

  it('left out: the additions, plus the trip\'s extras share of the rest', () => {
    expect(invoiceVatExcluded({ net: 130200, additions: 30200, tripShare: 0, currency: 'JPY' })).toBe(30200)
    // 10% of the trip is extras lines: + 10% of 100,000
    expect(invoiceVatExcluded({ net: 130200, additions: 30200, tripShare: 0.1, currency: 'JPY' })).toBe(40200)
  })

  it('an invoice with insurance and extras records VAT on the remainder only', () => {
    const t = invoiceTotals({ invoiceType: 'standard', netAmount: 130200, vatApplied: true, vatRate: 14, vatExcluded: 30200, currency: 'JPY' })
    expect(t).toEqual({ subtotal: 130200, tax_rate: 14, tax_amount: 14000, discount_amount: 0, total_amount: 144200, vat_applied: true, vat_base: 100000 })
    expect(t.subtotal + t.tax_amount - t.discount_amount).toBe(t.total_amount)
  })

  it('deposit + final still add up, and together tax the trip less its extras', () => {
    // Trip 100,000 (of which 10,000 extras lines), plus insurance 12,200 billed on the final.
    const share = 0.1
    const depNet = 20000
    const dep = invoiceTotals({ invoiceType: 'deposit', netAmount: depNet, vatApplied: true, vatRate: 14, vatExcluded: invoiceVatExcluded({ net: depNet, additions: 0, tripShare: share, currency: 'JPY' }), currency: 'JPY' })
    const finNet = 100000 + 12200 - invoiceNet(dep)
    const fin = invoiceTotals({ invoiceType: 'final', netAmount: finNet, vatApplied: true, vatRate: 14, vatExcluded: invoiceVatExcluded({ net: finNet, additions: 12200, tripShare: share, currency: 'JPY' }), currency: 'JPY' })
    // (100,000 − 10,000) × 14% = 12,600 across the two
    expect(dep.tax_amount + fin.tax_amount).toBe(12600)
    expect(dep.total_amount + fin.total_amount).toBe(112200 + 12600)
  })

  it('switching VAT on later leaves the same tagged lines out; off clears the base', () => {
    const inv = { total_amount: 130200, tax_amount: 0, amount_paid: 0, currency: 'JPY', line_items: [{ amount: 100000 }, { amount: 30200, source: 'insurance' }] }
    expect(switchInvoiceVat(inv, true, 14)).toEqual({ ok: true, updates: { vat_applied: true, tax_rate: 14, tax_amount: 14000, total_amount: 144200, balance_due: 144200, vat_base: 100000 } })
    const off = switchInvoiceVat({ ...inv, total_amount: 144200, tax_amount: 14000, vat_base: 100000 }, false, 0)
    expect(off).toEqual({ ok: true, updates: { vat_applied: false, tax_rate: 0, tax_amount: 0, total_amount: 130200, balance_due: 130200, vat_base: null } })
  })
})

describe('payments', () => {
  it('a receipt\'s share of the invoice VAT carries the invoice\'s note', () => {
    const inv = { vat_applied: true, tax_rate: 14, tax_amount: 14000, total_amount: 144200, vat_base: 100000 }
    expect(vatInPayment(72100, inv, 'JPY')).toMatchObject({ vat_amount: 7000, vat_base: 100000 })
    expect(receiptVatLine({ amount: 72100, currency: 'JPY' }, { invoice_number: 'I', client_name: 'C', currency: 'JPY', ...inv })).toBe('VAT 14% included: ¥7,000 (extras and insurance not taxed)')
  })

  it('a trip payment: VAT inside the gross on the taxed share only', () => {
    // Trip 100,000 of which 30,000 extras: VAT 9,800, total 109,800. Paying it all carries 9,800.
    expect(vatInsideGross(109800, { vat_applied: true, vat_rate: 14, vat_excluded: 30000, vat_net: 100000 }, 'JPY')).toMatchObject({ vat_amount: 9800, vat_base: 70000 })
    // Without extras, as before: 114,000 carries 14,000 and no base.
    expect(vatInsideGross(114000, { vat_applied: true, vat_rate: 14 }, 'JPY')).toEqual({ vat_applied: true, vat_rate: 14, vat_amount: 14000 })
  })
})

describe('every document carries the note', () => {
  it('B2B quote PDF', () => {
    const html = quotePdfTotalsHtml({ selling_price: 100000, currency: 'JPY', vat_applied: true, vat_rate: 14, vat_amount: 9800, vat_base: 70000 }, 'en', 'Total')
    expect(html).toContain('VAT 14% included: ¥9,800 (extras and insurance not taxed)')
    expect(html).toContain('¥109,800')
    const ja = quotePdfTotalsHtml({ selling_price: 100000, currency: 'JPY', vat_applied: true, vat_rate: 14, vat_amount: 9800, vat_base: 70000 }, 'ja', '合計')
    expect(ja).toContain('（オプション・保険はVAT対象外）')
  })

  it('invoice PDF', () => {
    const base = {
      id: 'i', invoice_number: 'INV-1', invoice_type: 'standard', client_name: 'Aiko', client_email: '', subtotal: 130200,
      discount_amount: 0, currency: 'JPY', amount_paid: 0, status: 'sent', issue_date: '2026-10-01', due_date: '2026-10-20',
      notes: null, payment_terms: null, payment_instructions: null,
      line_items: [{ description: 'Trip', quantity: 1, unit_price: 100000, amount: 100000 }, { description: 'Insurance', quantity: 1, unit_price: 30200, amount: 30200, source: 'insurance' }],
    }
    const on = generateInvoicePDF({ ...base, vat_applied: true, tax_rate: 14, tax_amount: 14000, vat_base: 100000, total_amount: 144200, balance_due: 144200 } as never).output()
    // PDF text escapes the parentheses.
    expect(on).toContain('extras and insurance not taxed')
    const plain = generateInvoicePDF({ ...base, vat_applied: true, tax_rate: 14, tax_amount: 18228, total_amount: 148428, balance_due: 148428 } as never).output()
    expect(plain).not.toContain('not taxed')
  })

  it('contract, itinerary email and invoice reminder', () => {
    expect(contractVatLine({ vat_applied: true, vat_rate: 14, vat_excluded: 500 }, 2000, 'EUR')).toBe('VAT 14% included: €210.00 (extras and insurance not taxed)')
    expect(generateEmailTemplate('C', 'ITN-1', 'Nile', '100000', 'JPY', 'en', undefined, { vat_applied: true, vat_rate: 14, vat_excluded: 30000 })).toContain('VAT 14% included: ¥9,800 (extras and insurance not taxed)')
    const inv = { invoice_number: 'INV-1', client_name: 'C', issue_date: '2026-10-01', due_date: '2026-10-20', currency: 'JPY', balance_due: 144200, total_amount: 144200 }
    expect(generateReminderEmail({ ...inv, vat_applied: true, tax_rate: 14, tax_amount: 14000, vat_base: 100000 }, 'default', 'ja').html).toContain('VAT（14%）適用：¥14,000（オプション・保険はVAT対象外）')
  })

  it('the trip screens and server documents pass the trip\'s extras (source)', () => {
    expect(src('app/itineraries/[id]/page.tsx')).toContain('vat_excluded: tripVatExcluded(days as never)')
    expect(src('app/share/[token]/page.tsx')).toContain('vatOnLiveNet({ ...itinerary, vat_excluded: vatExcluded }')
    expect(src('app/portal/[token]/page.tsx')).toContain('loadTripVatExtras(supabase, booking.itinerary_id)')
    expect(src('app/api/bookings/[id]/route.ts')).toContain('loadTripVatExtras(supabaseAdmin, booking.itinerary.id)')
    expect(src('app/api/payments/[id]/route.ts')).toContain('loadTripVatExtras(supabase, trip.id)')
    expect(src('app/api/whatsapp/send-receipt/route.ts')).toContain('loadTripVatExtras(supabase, trip.id)')
    expect(src('app/api/whatsapp/send-contract/route.ts')).toContain('loadTripVatExtras(supabase, itinerary.id)')
    expect(src('app/api/send-email/route.ts')).toContain('loadTripVatExtras(supabase, trip.id)')
    expect(src('app/api/itineraries/[id]/route.ts')).toContain('loadTripVatExtras(supabase, id)')
  })

  it('the Tax tab still reads the recorded amounts (source)', () => {
    const fr = src('app/api/financial-reports/route.ts')
    expect(fr).not.toMatch(/vatColumns|vatFor\(|quoteVatExcluded|invoiceVatExcluded/)
  })
})
