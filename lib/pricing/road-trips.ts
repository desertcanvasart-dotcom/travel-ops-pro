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
/** The city a rate's NAME says it departs from, when no column holds it — the
 *  same heuristic as tripShapeFromName. "ASWAN-TO-ABU-SIMBEL-NEXT-DAY-RETURN"
 *  → "Aswan"; "MARSA-ALAM-TO-ASWAN-OVERNIGHT" → "Marsa Alam". Empty when the
 *  name has no "…-TO-…" origin. */
export function departureFromName(...names: Array<string | null | undefined>): string {
  const text = names.filter(Boolean).join(' ')
  const m = text.match(/([A-Za-z][A-Za-z-]*?)-TO-/i)
  if (!m) return ''
  return m[1]
    .replace(/-/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** A road rate's departure city: the column the form saves (`city`), the one a
 *  sheet fills (`origin_city`), or — when neither is set, which is every row
 *  today because the form never saved an origin — parsed from the route name,
 *  so route matching (roadRouteKey) can still find it. */
export const rateDeparture = (row: { origin_city?: string | null; city?: string | null; service_code?: string | null; route_name?: string | null }): string =>
  String(row.origin_city || row.city || departureFromName(row.service_code, row.route_name) || '').trim()

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
  leg_to?: string
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
  // Arrived by ticket (train / sleeping train / flight): the morning place is
  // where the ticket dropped them (leg_to). A night train to Aswan leaves the
  // party in Aswan — ready for an onward road leg — even though the train day
  // carries no city of its own.
  if (isTicket(prev)) return prev.leg_to || prev.overnight_city || prev.city || null
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
    // Waking on a sleeping train: the journey was its ticket, no road — UNLESS
    // the train dropped the party at a hub (leg_to) and they drive onward to a
    // different city today (Aswan → Abu Simbel). Without a leg_to, the old rule
    // holds and the sleeper day is treated as arriving at the destination.
    if (prev.transport_type === 'sleeping_train' && (!prev.leg_to || same(prev.leg_to, day.city))) continue
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

/**
 * The trip_shape a rate write should store. Road types only (others: null).
 * A value that is sent must be a shape — anything else is refused, never
 * coerced. Omitted keeps what the row already is (stored, else its name), so
 * a client that does not know shapes cannot quietly turn an overnight return
 * into one way (Greptile on #462). A new row with none reads its name.
 */
export function resolveTripShapeWrite(
  body: { service_type?: unknown; trip_shape?: unknown; service_code?: unknown; route_name?: unknown },
  current?: { trip_shape?: string | null; service_code?: string | null; route_name?: string | null } | null
): { ok: true; value: TripShape | null } | { ok: false; error: string } {
  if (!isRoadTransferType(String(body.service_type ?? ''))) return { ok: true, value: null }
  if (body.trip_shape !== undefined && body.trip_shape !== null && body.trip_shape !== '') {
    const shape = sanitizeTripShape(body.trip_shape)
    return shape ? { ok: true, value: shape } : { ok: false, error: `trip_shape must be one of ${TRIP_SHAPES.join(', ')}` }
  }
  if (current) return { ok: true, value: rateTripShape(current) }
  return { ok: true, value: tripShapeFromName(String(body.service_code ?? ''), String(body.route_name ?? '')) }
}
