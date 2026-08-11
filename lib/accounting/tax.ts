// Tax handling shared by the QuickBooks and Xero mappers.
//
// H9: the mappers used to emit no tax at all, so a taxable invoice/bill synced
// to QB/Xero got a total that differed from the Autoura source by the tax
// amount, breaking reconciliation and tax reporting. These helpers let each
// provider represent the tax so the external document's total matches
// `total_amount`.
//
// The Autoura invoice model is loose: `subtotal`, `tax_amount`, and
// `total_amount` are stored independently and aren't guaranteed to satisfy
// total = subtotal + tax. Rather than assume, we DETECT the relationship and
// pick a mapping that reproduces `total_amount` in the accounting system.

export type TaxMode = 'none' | 'exclusive' | 'inclusive'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Decide how the invoice/bill tax relates to the line amounts:
 *  - 'none'      — no tax to represent.
 *  - 'exclusive' — tax is charged on top (total ≈ subtotal + tax); line amounts
 *                  are net, and the provider adds the tax.
 *  - 'inclusive' — tax is already inside the line amounts (total ≈ subtotal);
 *                  the provider back-computes the tax portion.
 * Ambiguous/inconsistent data falls back to 'exclusive' so the tax is at least
 * represented rather than silently dropped (the H9 regression).
 */
export function resolveTaxTreatment(
  subtotal: number,
  taxAmount: number,
  totalAmount: number
): TaxMode {
  if (!taxAmount || taxAmount <= 0) return 'none'
  const EPS = 0.01
  if (Math.abs(totalAmount - (subtotal + taxAmount)) <= EPS) return 'exclusive'
  if (Math.abs(totalAmount - subtotal) <= EPS) return 'inclusive'
  return 'exclusive'
}

/**
 * Split a total tax amount across line items proportionally to each line's
 * amount, with any rounding remainder absorbed by the last line so the parts
 * sum back to `taxAmount` exactly (to the cent).
 */
export function allocateLineTax(lineAmounts: number[], taxAmount: number): number[] {
  if (!lineAmounts.length) return []
  const base = lineAmounts.reduce((s, a) => s + a, 0)
  if (base <= 0 || taxAmount <= 0) return lineAmounts.map(() => 0)

  const parts = lineAmounts.map((a) => round2((a / base) * taxAmount))
  const drift = round2(taxAmount - parts.reduce((s, p) => s + p, 0))
  parts[parts.length - 1] = round2(parts[parts.length - 1] + drift)
  return parts
}
