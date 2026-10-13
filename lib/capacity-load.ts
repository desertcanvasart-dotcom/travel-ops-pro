// ============================================
// The groups out on each day, read from trips and departures
// ============================================
// The I/O half of dayLoads() (lib/capacity-availability.ts): this company's
// sold trips and running departures that overlap a date range. Used by the
// Capacity page (GET /api/capacity), /api/capacity/check, the partner
// availability API and the WhatsApp assistant, so they all count the same.

import { dayLoads, type DayLoad, type LoadSource } from '@/lib/capacity-availability'
import { withSeatCounts } from '@/lib/departures/seats'
import { shiftDateISO } from '@/lib/today'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = { from(table: string): any }

/** Departures that are running: not Draft (unpublished) or Cancelled. */
const RUNNING_DEPARTURE_STATUSES = ['open', 'limited', 'full', 'guaranteed']

/** Every date from start to end, inclusive (calendar arithmetic). */
export function datesInRange(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end && out.length < 400; d = shiftDateISO(d, 1)) out.push(d)
  return out
}

/** Groups, guides and vehicles out on each day of [start, end]. Throws on a
 *  read error — a day shown with nothing booked because a read failed is
 *  the silent wrong answer this replaces. */
export async function loadDayLoads(
  supabase: DbClient, orgId: string, start: string, end: string,
): Promise<Map<string, DayLoad>> {
  const { data: trips, error: tripErr } = await supabase
    .from('itineraries')
    .select('start_date, end_date, assigned_guide_id, assigned_vehicle_id')
    .eq('org_id', orgId)
    .in('status', ['confirmed', 'completed'])
    .lte('start_date', end)
    .gte('end_date', start)
  if (tripErr) throw new Error(tripErr.message || 'Could not read trips')

  const { data: deps, error: depErr } = await supabase
    .from('tour_departures')
    .select('id, start_date, end_date, max_pax, booked_pax, assigned_guide_id, assigned_vehicle_id')
    .eq('org_id', orgId)
    .in('status', RUNNING_DEPARTURE_STATUSES)
    .lte('start_date', end)
    .gte('end_date', start)
  if (depErr) throw new Error(depErr.message || 'Could not read departures')

  // A departure is a group out only once someone is on it.
  const running = (await withSeatCounts(supabase, orgId, (deps ?? []) as Array<LoadSource & { id: string; max_pax: number | null; booked_pax: number | null }>))
    .filter(d => d.seats_taken > 0)

  return dayLoads(datesInRange(start, end), [...((trips ?? []) as LoadSource[]), ...running])
}
