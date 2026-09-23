// ============================================
// Invoice subtotal / tax / discount
// ============================================
// The three must add up to the total the invoice bills. POST /api/invoices
// stored subtotal AS the total, so a taxed invoice read "Subtotal 110,000 +
// Tax 10,000 = Total 110,000" — on screen, on the PDF and in the QuickBooks /
// Xero export. total_amount stays authoritative (it already carries the
// server-side additions: insurance, confirmed extras); the subtotal is what is
// left once tax is taken off and the discount put back.
import { roundToCurrency } from '@/lib/currency-totals'

export interface InvoiceTotalsInput {
  invoiceType: string
  totalAmount: number
  taxRate?: unknown
  taxAmount?: unknown
  discountAmount?: unknown
  currency: string
}

export function invoiceTotals(input: InvoiceTotalsInput): {
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
} {
  // A deposit or final invoice is a share of the trip price the server works
  // out without tax or discount; a tax line sent with one would print an
  // amount the total never contained.
  if (input.invoiceType !== 'standard') {
    return { subtotal: input.totalAmount, tax_rate: 0, tax_amount: 0, discount_amount: 0 }
  }
  const tax = roundToCurrency(Number(input.taxAmount) || 0, input.currency)
  const discount = roundToCurrency(Number(input.discountAmount) || 0, input.currency)
  return {
    subtotal: roundToCurrency(input.totalAmount - tax + discount, input.currency),
    tax_rate: Number(input.taxRate) || 0,
    tax_amount: tax,
    discount_amount: discount,
  }
}
