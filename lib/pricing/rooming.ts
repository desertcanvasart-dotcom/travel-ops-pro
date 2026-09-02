// ============================================
// Rooming: how a party sleeps, and what that costs per night
// ============================================
// Hotels and Nile cruises are contracted the same way: a rate PER PERSON IN
// DOUBLE, a SINGLE SUPPLEMENT for a room of one, and a TRIPLE REDUCTION for
// each person in a room of three. The engine used to price every party as
// pax × per-person-double and only REPORT the single supplement, so a solo
// traveller was under-quoted by the supplement and a party of three or five
// was over-quoted by the reduction it never took. Operator decision
// 2026-09-02: price a three-share as per-person-double minus the reduction,
// hotels and cruises alike.
//
// Rooming rule (the office's own): an even party sleeps in doubles; an odd
// party of three or more puts three people in ONE triple and the rest in
// doubles; a party of one takes a single. Nothing invented beyond that — a
// family that wants two singles overrides in the quote, not here.

export interface NightRates {
  /** Per person in double, this night. */
  ppd: number
  /** Extra for a room of one, this night (0 when the contract has none). */
  singleSupp: number
  /** Reduction per person in a triple, this night (0 when none). */
  tripleRed: number
}

export interface Rooms {
  singles: number
  doubles: number
  triples: number
}

export function roomsForPax(pax: number): Rooms {
  const n = Math.max(0, Math.floor(pax))
  if (n === 0) return { singles: 0, doubles: 0, triples: 0 }
  if (n === 1) return { singles: 1, doubles: 0, triples: 0 }
  if (n % 2 === 0) return { singles: 0, doubles: n / 2, triples: 0 }
  return { singles: 0, doubles: (n - 3) / 2, triples: 1 }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** What the whole party pays for one night under the rooming rule. */
export function nightAccommodationCost(pax: number, night: NightRates): number {
  const rooms = roomsForPax(pax)
  const ppd = Math.max(0, Number(night.ppd) || 0)
  const supp = Math.max(0, Number(night.singleSupp) || 0)
  const red = Math.max(0, Number(night.tripleRed) || 0)
  return r2(
    rooms.doubles * 2 * ppd +
    rooms.triples * 3 * Math.max(0, ppd - red) +
    rooms.singles * (ppd + supp)
  )
}

/** The party's accommodation for the whole trip. */
export function tripAccommodationCost(pax: number, nights: NightRates[]): number {
  return r2(nights.reduce((sum, n) => sum + nightAccommodationCost(pax, n), 0))
}

/**
 * The difference between what the rooming rule charges and the flat
 * pax × per-person-double the per-person lines add up to. Positive for a
 * solo traveller (the supplement), negative for a party with a triple (the
 * reduction), zero for any even party. Shown as its own line so the quote's
 * lines still sum to its total.
 */
export function roomingAdjustment(pax: number, nights: NightRates[]): number {
  const flat = nights.reduce((sum, n) => sum + (Math.max(0, Number(n.ppd) || 0)) * pax, 0)
  return r2(tripAccommodationCost(pax, nights) - flat)
}
