// POST /api/invoices stored subtotal AS the total: "Subtotal 110,000 + Tax
// 10,000 = Total 110,000", exported that way to QuickBooks/Xero.
import { describe, it, expect } from 'vitest'
import { invoiceTotals } from '@/lib/invoices/totals'

describe('invoiceTotals', () => {
  it('a taxed invoice: subtotal + tax = total', () => {
    const t = invoiceTotals({ invoiceType: 'standard', totalAmount: 110000, taxRate: 10, taxAmount: 10000, currency: 'JPY' })
    expect(t).toEqual({ subtotal: 100000, tax_rate: 10, tax_amount: 10000, discount_amount: 0 })
  })
  it('a discount is put back into the subtotal', () => {
    const t = invoiceTotals({ invoiceType: 'standard', totalAmount: 1050, taxAmount: 100, discountAmount: 50, currency: 'USD' })
    expect(t.subtotal).toBe(1000)
    expect(t.subtotal + t.tax_amount - t.discount_amount).toBe(1050)
  })
  it('rounds to the currency (no fractional yen)', () => {
    const t = invoiceTotals({ invoiceType: 'standard', totalAmount: 1000, taxAmount: 90.909, currency: 'JPY' })
    expect(t).toMatchObject({ tax_amount: 91, subtotal: 909 })
  })
  it('no tax: subtotal is the total', () => {
    expect(invoiceTotals({ invoiceType: 'standard', totalAmount: 343.43, currency: 'USD' }).subtotal).toBe(343.43)
  })
  it.each(['deposit', 'final'])('a %s invoice carries no tax or discount lines', type => {
    const t = invoiceTotals({ invoiceType: type, totalAmount: 219980, taxRate: 10, taxAmount: 5000, discountAmount: 100, currency: 'JPY' })
    expect(t).toEqual({ subtotal: 219980, tax_rate: 0, tax_amount: 0, discount_amount: 0 })
  })
})
