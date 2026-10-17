// ============================================
// The trip page's Profit & Loss card: its two small rules
// ============================================
// Margin is PROFIT OVER WHAT THE CLIENT PAYS, the definition the Profit & Loss
// page uses. The card used to divide by cost (markup), so the same trip read
// 25.0% on its own page and 20.0% on the report.
//
// A supplier cost nobody recorded is "not recorded", never a figure. The card
// used to work one out from the price at a hardcoded 25% markup (price / 1.25),
// a cost no one paid, and print it as if it were real.

/** Profit as a percentage of the client price; 0 when there is no price. */
export function marginOnPrice(profit: number, clientPrice: number): number {
  return clientPrice > 0 ? (profit / clientPrice) * 100 : 0
}

/**
 * The trip's supplier cost when no service carries one: the figure the pricing
 * engine stored on the trip, else null (not recorded).
 */
export function recordedTripSupplierCost(supplierCost: unknown): number | null {
  const n = Number(supplierCost)
  return Number.isFinite(n) && n > 0 ? n : null
}
