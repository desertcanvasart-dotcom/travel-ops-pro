/**
 * The single source of truth for the cost → margin → selling-price formula.
 *
 * Pre-B4 this calculation existed in two places:
 *   - app/pricing-grid/lib/calculator.ts (the grid engine)
 *   - app/api/itineraries/[id]/calculate-pricing/route.ts (the edit-page route)
 * Plus inline copies in auto-pricing-service. The convention everyone uses
 * is the same:
 *
 *     client_price = supplier_cost × (1 + margin_percent / 100)
 *
 * Importing this module instead of redefining the formula prevents drift,
 * makes "one engine, two shapes" literal at the math level, and keeps B2C
 * (typical 25% margin) and B2B (typical 10%) on identical arithmetic.
 */
export function applyMargin(cost: number, marginPercent: number): number {
  return cost * (1 + marginPercent / 100)
}

/** Round a money value to 2 decimal places. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
