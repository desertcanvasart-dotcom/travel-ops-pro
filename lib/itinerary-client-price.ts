// ============================================
// What the client pays for a service line
// ============================================
// itinerary_services.total_cost is the SUPPLIER cost; client_price is what
// the client is charged. A line with no client_price yet is priced at the
// default 25% margin — the rule the itinerary page's total and its Profit &
// Loss card use. Anything printed for the client reads this, never
// total_cost: the quote PDF listed supplier costs per line under the
// marked-up total, and the client could read the margin off it.

export const DEFAULT_CLIENT_MARGIN_PERCENT = 25

export function serviceClientPrice(service: { total_cost?: unknown; client_price?: unknown }): number {
  if (service.client_price != null && service.client_price !== '') {
    const n = Number(service.client_price)
    if (Number.isFinite(n)) return n
  }
  const cost = Number(service.total_cost) || 0
  return cost * (1 + DEFAULT_CLIENT_MARGIN_PERCENT / 100)
}

/**
 * The season premium the pricing grid charged on top of the lines
 * (itineraries.season_uplift_amount, 20261124). It is not a service line, so a
 * total built from the lines alone dropped it: the quote PDF and the trip-page
 * invoice said ¥1,000,000 while the contract and the booking said ¥1,150,000.
 */
export function seasonSupplementOf(itinerary: { season_uplift_amount?: unknown } | null | undefined): number {
  const n = Number(itinerary?.season_uplift_amount)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** What the client pays for the trip: its lines plus the season premium, or the
 *  stored total when there are no priced lines. To the cent. */
export function tripClientTotal(
  itinerary: { total_cost?: unknown; season_uplift_amount?: unknown } | null | undefined,
  days: Array<{ services?: Array<{ total_cost?: unknown; client_price?: unknown }> | null }>
): number {
  const lines = clientTotalOfDays(days)
  if (lines <= 0) return Number(itinerary?.total_cost) || 0
  return Math.round((lines + seasonSupplementOf(itinerary)) * 100) / 100
}

/** The client total of a trip's services, to the cent. */
export function clientTotalOfDays(days: Array<{ services?: Array<{ total_cost?: unknown; client_price?: unknown }> | null }>): number {
  let total = 0
  for (const day of days) for (const s of day.services ?? []) total += serviceClientPrice(s)
  return Math.round(total * 100) / 100
}
