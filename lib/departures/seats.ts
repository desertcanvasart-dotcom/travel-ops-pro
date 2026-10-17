// ============================================
// A departure's seats: ONE rule, used everywhere
// ============================================
// Seats are taken three ways:
//   * booked_pax — seats the office enters by hand for bookings made outside
//     the app (a phone booking, an agent's allotment), or the partner's own
//     count on a departure an integration mirrors;
//   * confirmed holds — departure_bookings the office confirmed;
//   * pending holds — departure_bookings a website order placed (Order
//     Intake, hold_departure_seats), waiting for the office.
// Taken = booked_pax + confirmed + pending. Free = max_pax − taken, never
// below 0. A cancelled hold holds nothing.
//
// The list, the grid, the departure page, /api/departures/check, the WhatsApp
// assistant, the Order Intake preview and the database's own
// hold_departure_seats / set_departure_seats (migration 20261215) all count
// this way. Before, the screens showed booked_pax alone (always 0, since
// nothing wrote it) and the hold counted max(booked_pax, confirmed) + pending,
// so a date fully held by web orders read as empty everywhere but the hold.

/** The statuses a seat can be held or booked on. Draft is not published,
 *  Full was closed by hand, Cancelled will not run. */
export const BOOKABLE_DEPARTURE_STATUSES = ['open', 'limited', 'guaranteed'] as const

export const DEPARTURE_STATUSES = ['draft', 'open', 'limited', 'full', 'guaranteed', 'cancelled'] as const

export function isBookableStatus(status: unknown): boolean {
  return typeof status === 'string' && (BOOKABLE_DEPARTURE_STATUSES as readonly string[]).includes(status)
}

export interface SeatHold {
  pax: number | null
  status: string | null
}

export interface SeatCounts {
  /** Booked outside the app (tour_departures.booked_pax). */
  booked_pax: number
  held_confirmed: number
  held_pending: number
  seats_taken: number
  seats_free: number
}

/** Pax on holds of each live status. */
export function heldPax(holds: SeatHold[]): { confirmed: number; pending: number } {
  const sum = (status: string) => holds.filter(h => h.status === status).reduce((n, h) => n + (Number(h.pax) || 0), 0)
  return { confirmed: sum('confirmed'), pending: sum('pending') }
}

export function seatCounts(
  departure: { max_pax: number | null; booked_pax: number | null },
  holds: SeatHold[],
): SeatCounts {
  const booked = Number(departure.booked_pax) || 0
  const { confirmed, pending } = heldPax(holds)
  const taken = booked + confirmed + pending
  return {
    booked_pax: booked,
    held_confirmed: confirmed,
    held_pending: pending,
    seats_taken: taken,
    seats_free: Math.max(0, (Number(departure.max_pax) || 0) - taken),
  }
}

/** Seats left on a departure: max_pax − (booked_pax + confirmed + pending). */
export function seatsFree(
  departure: { max_pax: number | null; booked_pax: number | null },
  holds: SeatHold[],
): number {
  return seatCounts(departure, holds).seats_free
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = { from(table: string): any }

/**
 * The live holds (pending and confirmed) of these departures, by departure
 * id — one query per 200 ids, this company's rows only. A read failure
 * throws: a seat figure silently missing its holds is the bug this exists
 * to end.
 */
export async function liveHoldsByDeparture(
  supabase: DbClient, orgId: string, departureIds: string[],
): Promise<Map<string, SeatHold[]>> {
  const out = new Map<string, SeatHold[]>()
  const ids = [...new Set(departureIds.filter(Boolean))]
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('departure_bookings')
      .select('departure_id, pax, status')
      .eq('org_id', orgId)
      .in('departure_id', ids.slice(i, i + 200))
      .in('status', ['pending', 'confirmed'])
    if (error) throw new Error(error.message || 'Could not read seat holds')
    for (const h of (data ?? []) as Array<SeatHold & { departure_id: string }>) {
      const list = out.get(h.departure_id) ?? []
      list.push({ pax: h.pax, status: h.status })
      out.set(h.departure_id, list)
    }
  }
  return out
}

/** Each departure with its seat counts added. */
export async function withSeatCounts<D extends { id: string; max_pax: number | null; booked_pax: number | null }>(
  supabase: DbClient, orgId: string, departures: D[],
): Promise<Array<D & SeatCounts>> {
  if (departures.length === 0) return []
  const holds = await liveHoldsByDeparture(supabase, orgId, departures.map(d => d.id))
  return departures.map(d => ({ ...d, ...seatCounts(d, holds.get(d.id) ?? []) }))
}
