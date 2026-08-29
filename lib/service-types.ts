// ============================================
// ONE service-type vocabulary
// ============================================
// The app spoke two dialects of the same taxonomy: the AI itinerary writer,
// the routing map and the pricing types said `airport_service` /
// `hotel_service`; the pricing grid's slot→service mapping emitted
// `airport_services` / `hotel_services`. Both spellings ended up in stored
// rows, and every consumer coped its own way — the departments table listed
// all four (which the external audit read straight off the screen: "duplicate
// service-type values, both routable", AUT-L02), task generation coerced
// strangers to 'transportation', and anything matching one spelling silently
// dropped the other.
//
// THE CANON IS SINGULAR — it is what lib/pricing-types.ts and the AI writer
// already used, and it matches the grammar of the rest of the list (a service
// of kind 'guide', 'meal', 'cruise'; 'tips' and 'supplies' are plural nouns,
// not plural types). The grid's SLOT ids keep their own names — a slot is not
// a service type, and `airport_services` the slot maps to `airport_service`
// the type at the boundary.
//
// Legacy plural values in data are healed by migration
// 20260831_service_type_taxonomy.sql; readers that touch rows old installs
// may still hold call normalizeServiceType() instead of comparing raw.

export const SERVICE_TYPES = [
  'accommodation',
  'activity',
  'airport_service',
  'cruise',
  'entrance',
  'extra',
  'flight',
  'guide',
  'hotel_service',
  'meal',
  'supplies',
  'tips',
  'transportation',
] as const

export type ServiceType = (typeof SERVICE_TYPES)[number]

/** The retired spellings, kept in exactly one place. */
const LEGACY_ALIASES: Record<string, ServiceType> = {
  airport_services: 'airport_service',
  hotel_services: 'hotel_service',
}

/**
 * Canonical form of a service type, however an old row spells it.
 *
 * Unknown values pass through trimmed and lowercased rather than being
 * coerced — a stranger routed nowhere is visible; a stranger relabelled
 * 'transportation' is confidently wrong (the lib/ai/task-generation lesson).
 */
export function normalizeServiceType(value: string | null | undefined): string {
  const t = (value ?? '').trim().toLowerCase()
  return LEGACY_ALIASES[t] ?? t
}
