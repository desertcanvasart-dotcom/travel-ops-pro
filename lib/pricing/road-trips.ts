// ============================================
// Road transfers between cities: the route and the TRIP SHAPE
// ============================================
// Operator, 2026-09-17: a road transfer that comes back the same day is one
// price; going one day and driving back the next is a higher price; one way
// is another. The rate sheet said so only in route NAMES (…-ONEWAY,
// …-OVER-DAY, …-SAME-DAY, …-RETURN, …-OVERNIGHT, …-NEXT-DAY-RETURN), which
// pricing never read — and the 2026-09-16 sheet import collapsed the office's
// own day_trip / overnight types into one. So:
//
//   - every road-transfer rate carries a `trip_shape` (migration 20261017):
//       one_way           drop at the destination
//       same_day_return   there and back the same day        (OVER-DAY, SAME-DAY, RETURN)
//       overnight_return  stay the night, drive back next day (OVERNIGHT, NEXT-DAY-RETURN)
//   - a rate is found by its ROUTE and SHAPE: From = the rate's departure city
//     (the form's Departure City is stored in `city`; `origin_city` when a
//     sheet filled it) → To = `destination_city`. Never by one city alone:
//     that matched Aswan → Hurghada for an Aswan → Luxor day, or nothing.
//   - the programme's days say which shape a leg needs (planRoadTrips):
//       same-day return  the day goes A → B and sleeps back in A
//       overnight return the day goes A → B, sleeps in B, and the next day
//                        comes back to A by road — charged ONCE on the day
//                        out; the day back lists the drive as included
//       one way          anything else
//
// Client-safe: no database, no engine import.

export const ROAD_TRANSFER_TYPES = ['intercity', 'intercity_with_sightseeing'] as const

export const isRoadTransferType = (t: string | null | undefined): boolean =>
  (ROAD_TRANSFER_TYPES as readonly string[]).includes(String(t ?? ''))

export const TRIP_SHAPES = ['one_way', 'same_day_return', 'overnight_return'] as const
export type TripShape = (typeof TRIP_SHAPES)[number]

export function sanitizeTripShape(v: unknown): TripShape | undefined {
  return (TRIP_SHAPES as readonly string[]).includes(String(v ?? '')) ? (v as TripShape) : undefined
}

/** The shape a rate's name says, by the words the office uses (confirmed by
 *  the operator, 2026-09-17). NEXT-DAY-RETURN is checked before RETURN. A name
 *  with none of the words is one way — how every such rate has priced. */
export function tripShapeFromName(...names: Array<string | null | undefined>): TripShape {
  const text = names.filter(Boolean).join(' ').toUpperCase()
  if (/NEXT-DAY-RETURN|OVERNIGHT/.test(text)) return 'overnight_return'
  if (/OVER-DAY|SAME-DAY|RETURN/.test(text)) return 'same_day_return'
  return 'one_way'
}

/** Where a road-transfer RATE departs from. */
export const rateDeparture = (row: { origin_city?: string | null; city?: string | null }): string =>
  String(row.origin_city || row.city || '').trim()

/** A rate's shape: the stored one; a row without one (before 20261017, or a
 *  sheet with no Trip Shape column) reads it from its name. */
export const rateTripShape = (row: { trip_shape?: string | null; service_code?: string | null; route_name?: string | null }): TripShape =>
  sanitizeTripShape(row.trip_shape) ?? tripShapeFromName(row.service_code, row.route_name)

/** The cache key a road-transfer rate is found by. */
export function roadRouteKey(serviceType: string, from: string, to: string, shape: TripShape): string {
  return ['road', serviceType, from.trim().toLowerCase(), to.trim().toLowerCase(), shape].join('|')
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase()

type DayLike = {
  day: number
  city: string
  overnight_city?: string
  accommodation_type?: string
  transport_type?: string
  leg_from?: string
  in_transit?: boolean
  is_cruise_day?: boolean
}

export type RoadPlanEntry =
  | { kind: 'leg'; from: string; to: string; shape: TripShape }
  /** Today's drive back is inside an earlier day's overnight return. */
  | { kind: 'return_included'; outDay: number; from: string; to: string }

const isTicket = (d: DayLike) => d.transport_type === 'flight' || d.transport_type === 'train' || d.transport_type === 'sleeping_train'

/**
 * Where the party woke up the morning of `index` — the previous night's place.
 * A night aboard ends at the ship's disembarkation port (`cruiseEndCity`), not
 * at the day's "Nile Cruise" label.
 */
export function morningPlace<T extends DayLike>(days: readonly T[], index: number, cruiseEndCity?: string | null): string | null {
  const prev = days[index - 1]
  if (!prev || prev.in_transit) return null
  if (prev.accommodation_type === 'cruise') return cruiseEndCity || prev.city || null
  return prev.overnight_city || prev.city || null
}

/** Where a day's road travel ENDS when it comes back: a ticket day drives
 *  back to where its flight or train leaves (leg_from); a road day to its city. */
function roadArrival(day: DayLike): string | null {
  if (isTicket(day)) return day.leg_from || null
  return day.city || null
}

/**
 * The road transfer each day needs, keyed by day index. Days without an entry
 * need none (no city change, a ticket day, a night aboard to a night aboard).
 */
export function planRoadTrips<T extends DayLike>(days: readonly T[], cruiseEndCity?: string | null): Map<number, RoadPlanEntry> {
  const plan = new Map<number, RoadPlanEntry>()
  for (let i = 1; i < days.length; i++) {
    const day = days[i]
    const prev = days[i - 1]
    if (day.in_transit) continue
    const from = morningPlace(days, i, cruiseEndCity)
    if (!from) continue

    // The drive back of yesterday's overnight return.
    const earlier = plan.get(i - 1)
    if (earlier?.kind === 'leg' && earlier.shape === 'overnight_return' && same(roadArrival(day), earlier.from)) {
      plan.set(i, { kind: 'return_included', outDay: prev.day, from: earlier.to, to: earlier.from })
      continue
    }

    if (isTicket(day)) continue
    // Waking on a sleeping train: the journey was its ticket.
    if (prev.transport_type === 'sleeping_train') continue
    // The ship moving between ports is not a transfer.
    if (day.accommodation_type === 'cruise' && prev.accommodation_type === 'cruise') continue
    const to = day.city
    if (!to || same(to, from)) continue

    const next = days[i + 1]
    const shape: TripShape =
      day.overnight_city && same(day.overnight_city, from) ? 'same_day_return'
      : next && !next.in_transit && same(roadArrival(next), from) ? 'overnight_return'
      : 'one_way'
    plan.set(i, { kind: 'leg', from, to, shape })
  }
  return plan
}
