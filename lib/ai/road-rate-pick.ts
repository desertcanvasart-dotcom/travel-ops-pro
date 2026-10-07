// ============================================
// Which road rate a generated day takes — by the shape of the trip
// ============================================
// transportation_rates carries a trip_shape on road transfers (migration
// 20261017): one_way, same_day_return, overnight_return. The AI builder took
// the first Intercity row for the road whatever its shape, so a day trip to
// Alexandria could be priced at the one-way or the overnight-return rate, and
// a move at the day-trip rate. (Ported in spirit from autoura-saas #614.)
//
//   a day trip (out and back, night where it was)
//     → same_day_return; then a row that names no shape; never a one-way or
//       overnight-return row. A sightseeing variant is preferred.
//   a move (night in the new city)
//     → one_way; then a row that names no shape; then overnight_return;
//       never same_day_return.

interface RoadRow { service_type?: string | null; trip_shape?: string | null }

const RANK: Record<'day_trip' | 'move', Record<string, number>> = {
  day_trip: { same_day_return: 0, '': 1 },
  move: { one_way: 0, '': 1, overnight_return: 2 },
}

export function pickRoadRate<T extends RoadRow>(rows: readonly T[] | null | undefined, kind: 'day_trip' | 'move'): T | null {
  const rank = RANK[kind]
  const scored = (rows ?? [])
    .map(r => ({ r, shape: rank[String(r.trip_shape ?? '')], sight: r.service_type === 'intercity_with_sightseeing' ? 0 : 1 }))
    .filter(x => x.shape !== undefined)
    .sort((a, b) => a.shape - b.shape || (kind === 'day_trip' ? a.sight - b.sight : b.sight - a.sight))
  return scored[0]?.r ?? null
}

/**
 * A generated day that goes somewhere and comes back: its night is where the
 * night before was, and its own city is somewhere else. Not a flight day or a
 * day aboard. (The AI writes such a day with city "Alexandria" and overnight
 * city "Cairo"; it was priced as a move with a hotel check-out and check-in.)
 */
export function isSameDayReturn(p: {
  overnightCity?: string | null
  previousOvernightCity?: string | null
  city: string
  flies: boolean
  aboard: boolean
}): boolean {
  const night = String(p.overnightCity ?? '').trim().toLowerCase()
  const before = String(p.previousOvernightCity ?? '').trim().toLowerCase()
  const city = p.city.trim().toLowerCase()
  return !p.flies && !p.aboard && !!night && night === before && !!city && city !== night
}
