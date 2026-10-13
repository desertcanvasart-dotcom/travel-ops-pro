// ============================================
// The statuses a trip can be in
// ============================================
// PUT /api/itineraries/[id] stored any string as the status, so a typo or a
// crafted request left a trip in a state no list, card or rule knows. These
// are the states the screens and routes use: draft → (quoted) → sent →
// confirmed → completed, or cancelled.

export const ITINERARY_STATUSES = ['draft', 'quoted', 'sent', 'confirmed', 'completed', 'cancelled'] as const
export type ItineraryStatus = (typeof ITINERARY_STATUSES)[number]

export function isItineraryStatus(value: unknown): value is ItineraryStatus {
  return typeof value === 'string' && (ITINERARY_STATUSES as readonly string[]).includes(value)
}

/** Sold trips: what revenue and resource clashes are about. Drafts, quotes
 *  not yet accepted and cancelled trips are not. */
export function isSoldStatus(status: unknown): boolean {
  return status === 'confirmed' || status === 'completed'
}
