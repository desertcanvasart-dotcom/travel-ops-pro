// POST /api/invoices stored subtotal AS the total: "Subtotal 110,000 + Tax
// 10,000 = Total 110,000", exported that way to QuickBooks/Xero.
//
// Since VAT (owner's decision, 2026-10-13; lib/vat.ts) the tax is no longer
// taken from the request: the route passes the invoice's NET and whether VAT
// applies, and the VAT is worked out here at the company's rate and added on
// top. These used to pin a browser-sent tax_amount being taken out of a gross
// total; that is exactly what VAT must never do.
import { describe, it, expect } from 'vitest'
import { invoiceNet, invoiceTotals, resolveInvoiceVat, switchInvoiceVat } from '@/lib/invoices/totals'

describe('invoiceTotals', () => {
  it('VAT applied: subtotal + tax = total, tax on top of the net', () => {
    const t = invoiceTotals({ invoiceType: 'standard', netAmount: 100000, vatApplied: true, vatRate: 14, currency: 'JPY' })
    expect(t).toEqual({ subtotal: 100000, tax_rate: 14, tax_amount: 14000, discount_amount: 0, total_amount: 114000, vat_applied: true })
  })
  it('a discount is put back into the subtotal', () => {
    const t = invoiceTotals({ invoiceType: 'standard', netAmount: 950, vatApplied: true, vatRate: 14, discountAmount: 50, currency: 'USD' })
    expect(t.subtotal).toBe(1000)
    expect(t.tax_amount).toBe(133)
    expect(t.subtotal + t.tax_amount - t.discount_amount).toBe(t.total_amount)
  })
  it('rounds the VAT to the currency (no fractional yen)', () => {
    const t = invoiceTotals({ invoiceType: 'standard', netAmount: 1003, vatApplied: true, vatRate: 14, currency: 'JPY' })
    // 1003 × 14% = 140.42 → ¥140
    expect(t).toMatchObject({ tax_amount: 140, total_amount: 1143 })
  })
  it('no VAT: subtotal is the total, and the invoice says so', () => {
    const t = invoiceTotals({ invoiceType: 'standard', netAmount: 343.43, vatApplied: false, vatRate: 14, currency: 'USD' })
    expect(t).toEqual({ subtotal: 343.43, tax_rate: 0, tax_amount: 0, discount_amount: 0, total_amount: 343.43, vat_applied: false })
  })
  it.each(['deposit', 'final'])('a %s invoice carries VAT on its own net, and no discount line', type => {
    const t = invoiceTotals({ invoiceType: type, netAmount: 219980, vatApplied: true, vatRate: 14, discountAmount: 100, currency: 'JPY' })
    expect(t).toEqual({ subtotal: 219980, tax_rate: 14, tax_amount: 30797, discount_amount: 0, total_amount: 250777, vat_applied: true })
  })
  it('a deposit and its final together carry the VAT on the whole trip', () => {
    const dep = invoiceTotals({ invoiceType: 'deposit', netAmount: 20000, vatApplied: true, vatRate: 14, currency: 'JPY' })
    // The final settles the trip net less the deposit's NET.
    const fin = invoiceTotals({ invoiceType: 'final', netAmount: 100000 - invoiceNet(dep), vatApplied: true, vatRate: 14, currency: 'JPY' })
    expect(dep.total_amount + fin.total_amount).toBe(114000)
  })
})

describe('resolveInvoiceVat', () => {
  it('the request decides when it says', () => {
    expect(resolveInvoiceVat(false, { itinerary: { vat_applied: true } })).toBe(false)
    expect(resolveInvoiceVat(true, {})).toBe(true)
  })
  it('else a final follows its deposit, else the trip, else off', () => {
    expect(resolveInvoiceVat(undefined, { parent: { vat_applied: true }, itinerary: { vat_applied: false } })).toBe(true)
    expect(resolveInvoiceVat(undefined, { itinerary: { vat_applied: true } })).toBe(true)
    expect(resolveInvoiceVat(undefined, { itinerary: null })).toBe(false)
  })
})

describe('switchInvoiceVat', () => {
  it('re-works VAT from the invoice\'s own net', () => {
    const on = switchInvoiceVat({ total_amount: 100000, tax_amount: 0, amount_paid: 0, currency: 'JPY' }, true, 14)
    expect(on).toEqual({ ok: true, updates: { vat_applied: true, tax_rate: 14, tax_amount: 14000, total_amount: 114000, balance_due: 114000 } })
    const off = switchInvoiceVat({ total_amount: 114000, tax_amount: 14000, amount_paid: 0, currency: 'JPY' }, false, 0)
    expect(off).toEqual({ ok: true, updates: { vat_applied: false, tax_rate: 0, tax_amount: 0, total_amount: 100000, balance_due: 100000 } })
  })
  it('an invoice with a payment keeps its VAT', () => {
    expect(switchInvoiceVat({ total_amount: 100000, tax_amount: 0, amount_paid: 1, currency: 'JPY' }, true, 14).ok).toBe(false)
  })
})
