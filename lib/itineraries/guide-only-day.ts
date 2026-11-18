// ============================================
// A car & guide day
// ============================================
// Owner's rule (autoura-saas #835, 2026-11-16): a car-and-guide day tour is a
// car, a guide, water and the driver's tip, priced per day for up to 8 hours.
// It has no fixed route, so it sells no entrance fees.
//
// Here such a day could only be built by hand: tick the guide AND set the
// day's transport lines, because the day's vehicle is derived from how many
// sights it names, and a day with none got none. The day's title could also
// pull sights in (extractAttractionsFromTitle) and price tickets nobody sold.
//
// `sightseeing: 'guide_only'` says it once. On such a day the engine prices
// the guide and one full-day vehicle (day_tour, full_day) and no tickets. It
// holds only while the day names no sight: picking a sight drops it, and a
// day that lists sights is priced from them as before.
//
// Pure. No migration: days are JSON (tour_templates.itinerary).

export const GUIDE_ONLY = 'guide_only' as const

type DayLike = {
  sightseeing?: unknown
  attractions?: unknown
  attraction_ids?: unknown
}

const listed = (v: unknown) => Array.isArray(v) && v.some(x => String(x ?? '').trim() !== '')

/** The day names at least one sight (by wording or by ticket). */
export function dayNamesSights(day: DayLike): boolean {
  return listed(day.attractions) || listed(day.attraction_ids)
}

/** A car & guide day: marked so, and naming no sight. */
export function isGuideOnlyDay(day: DayLike): boolean {
  return day.sightseeing === GUIDE_ONLY && !dayNamesSights(day)
}

/** The day's one vehicle line: a full-day tour vehicle, up to 8 hours. */
export const GUIDE_ONLY_VEHICLE = { serviceType: 'day_tour', duration: 'full_day' } as const

type EditorDay = DayLike & {
  services?: Record<string, boolean | undefined>
  services_set_by_hand?: string[]
  attractions_set_by_hand?: boolean
  [key: string]: unknown
}

/**
 * The editor's switch. On: the day is a car & guide day, its guide is ticked
 * (and kept, as if ticked by hand), and its empty sight list is final, so
 * the title adds no tickets. Off: the mark goes; nothing else changes.
 */
export function setGuideOnly<D extends EditorDay>(day: D, on: boolean): D {
  if (!on) {
    const rest = { ...day }
    delete rest.sightseeing
    return rest
  }
  const byHand = day.services_set_by_hand ?? []
  return {
    ...day,
    sightseeing: GUIDE_ONLY,
    attractions: [],
    attraction_ids: [],
    attractions_set_by_hand: true,
    services: { ...(day.services ?? {}), guide_required: true },
    services_set_by_hand: byHand.includes('guide_required') ? byHand : [...byHand, 'guide_required'],
  }
}

/** After any edit: a day that now names a sight is no longer a car & guide day. */
export function dropGuideOnlyWhenSightsPicked<D extends EditorDay>(day: D): D {
  return day.sightseeing === GUIDE_ONLY && dayNamesSights(day) ? setGuideOnly(day, false) : day
}
