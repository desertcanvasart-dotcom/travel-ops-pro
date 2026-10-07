// ============================================
// The assignment pickers list a place once
// ============================================
// The Hotels and Restaurants pickers on an itinerary's resources read the
// RATE tables: a hotel has a row per room type and season, a restaurant a row
// per meal. So the picker listed "Mena House — Cairo" a dozen times and the
// operator picked one row of many for the same hotel. A place is what is
// assigned, so it is listed once — its first active row standing for it.
// (Ported in spirit from autoura-saas #577, which reads assignable places
// from their own sources; here the lists are folded on the client.)

interface PlaceRow { name?: unknown; city?: unknown; is_active?: unknown }

const key = (r: PlaceRow) =>
  `${String(r.name ?? '').trim().toLowerCase()}|${String(r.city ?? '').trim().toLowerCase()}`

/** One row per name + city, an active row preferred, in first-seen order. */
export function onePerPlace<T extends PlaceRow>(rows: readonly T[]): T[] {
  const byKey = new Map<string, T>()
  for (const r of rows) {
    if (!String(r.name ?? '').trim()) continue
    const k = key(r)
    const held = byKey.get(k)
    if (!held || (held.is_active === false && r.is_active !== false)) byKey.set(k, r)
  }
  return [...byKey.values()]
}

/** The types whose picker reads a rate table with many rows per place. */
export const PLACE_TYPES = new Set(['hotel', 'restaurant'])
