// ============================================
// Invoice subtotal / tax / discount
// ============================================
// The three must add up to the total the invoice bills. POST /api/invoices
// stored subtotal AS the total, so a taxed invoice read "Subtotal 110,000 +
// Tax 10,000 = Total 110,000" — on screen, on the PDF and in the QuickBooks /
// Xero export.
//
// The tax on an invoice is VAT (owner's decision, 2026-10-13; lib/vat.ts):
// whether it applies is the invoice's choice, the rate is the company's when
// the invoice is issued, and the amount is computed HERE from the invoice's
// net — a tax rate or amount sent by the browser is never stored. VAT goes on
// top: total = net + tax, and subtotal = net + discount, so
// subtotal + tax − discount = total, as before.
//
// `netAmount` is what the route worked out the invoice bills before VAT: the
// caller's net (after discount) for a standard invoice, with the server-side
// additions (insurance, confirmed extras) in; the share of the trip for a
// deposit; the balance for a final. Each document carries VAT on its own net,
// so a deposit and its final together carry the VAT on the whole trip.
import { roundToCurrency } from '@/lib/currency-totals'
import { vatColumns } from '@/lib/vat'

export interface InvoiceTotalsInput {
  invoiceType: string
  netAmount: number
  vatApplied: boolean
  /** The company's VAT rate when the invoice is issued. */
  vatRate: number
  discountAmount?: unknown
  currency: string
}

export function invoiceTotals(input: InvoiceTotalsInput): {
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  vat_applied: boolean
} {
  const net = roundToCurrency(input.netAmount, input.currency)
  const vat = vatColumns({ applied: input.vatApplied, net, rate: input.vatRate, currency: input.currency })
  // A deposit or final invoice is a share of the trip price the server works
  // out; a discount sent with one would print an amount the total never
  // contained.
  const discount = input.invoiceType === 'standard'
    ? roundToCurrency(Number(input.discountAmount) || 0, input.currency)
    : 0
  return {
    subtotal: roundToCurrency(net + discount, input.currency),
    tax_rate: vat.vat_applied ? (vat.vat_rate ?? 0) : 0,
    tax_amount: vat.vat_amount,
    discount_amount: discount,
    total_amount: roundToCurrency(net + vat.vat_amount, input.currency),
    vat_applied: vat.vat_applied,
  }
}

/**
 * An invoice's net: what it bills before VAT. tax_amount is the VAT it
 * recorded (0 when none), and total_amount includes it.
 */
export function invoiceNet(inv: { total_amount?: unknown; tax_amount?: unknown }): number {
  return (Number(inv.total_amount) || 0) - (Number(inv.tax_amount) || 0)
}

/**
 * VAT switched on or off on an invoice already issued (PUT /api/invoices/[id]).
 * Re-worked from the invoice's own net at `rate` (the company's today); the
 * subtotal and discount stay as they are. An invoice that has taken a payment
 * keeps its VAT: the client paid against the figure it showed.
 */
export function switchInvoiceVat(
  inv: { total_amount?: unknown; tax_amount?: unknown; amount_paid?: unknown; currency?: string | null; vat_applied?: unknown },
  on: boolean,
  rate: number
): { ok: true; updates: Record<string, unknown> } | { ok: false; error: string } {
  const currency = inv.currency || 'EUR'
  if ((Number(inv.amount_paid) || 0) > 0) {
    return { ok: false, error: 'An invoice with payments keeps its VAT. Issue a new invoice to change it.' }
  }
  const net = invoiceNet(inv)
  const vat = vatColumns({ applied: on, net, rate, currency })
  const total = roundToCurrency(net + vat.vat_amount, currency)
  return {
    ok: true,
    updates: {
      vat_applied: vat.vat_applied,
      tax_rate: vat.vat_applied ? vat.vat_rate : 0,
      tax_amount: vat.vat_amount,
      total_amount: total,
      balance_due: total,
    },
  }
}

/**
 * Whether a new invoice applies VAT: as asked, else as its source carries it
 * — the deposit invoice a final settles, else the trip it bills (which took
 * its flag from the quote). Off when nothing says otherwise.
 */
export function resolveInvoiceVat(
  requested: boolean | undefined,
  source: { parent?: { vat_applied?: unknown; tax_amount?: unknown } | null; itinerary?: { vat_applied?: unknown } | null }
): boolean {
  if (requested !== undefined) return requested
  if (source.parent) return source.parent.vat_applied === true || (source.parent.vat_applied === undefined && Number(source.parent.tax_amount) > 0)
  return source.itinerary?.vat_applied === true
}
