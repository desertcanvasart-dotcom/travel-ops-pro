// A client's trips: linked by client_id, or carrying the client's email.
//
// Most trips in this system were written with the client's name and email as
// text, not linked, so the Bookings tab matches on both — and the timeline
// (which read client_id only, and every column of the row) used to disagree
// with it. Both now ask this one function. The company is part of every
// query: the email match once searched every company's trips.
import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeLike } from '@/lib/db/escape-like'

/** The columns a client page needs of a trip; no costs, margins or notes. */
export const CLIENT_TRIP_COLUMNS =
  'id, itinerary_code, trip_name, status, start_date, end_date, num_adults, num_children, total_cost, currency, created_at'

export interface ClientTrip {
  id: string
  created_at?: string | null
  [column: string]: unknown
}

export async function listClientTrips(
  db: SupabaseClient,
  orgId: string,
  clientId: string,
  email: string | null | undefined,
): Promise<{ data: ClientTrip[]; error: { message: string } | null }> {
  const address = email?.trim()
  // Two queries rather than one .or() with the email interpolated into it: a
  // filter string built from stored data is the injection shape this codebase
  // already had to fix once (sanitizeSearchTerm).
  const [byId, byEmail] = await Promise.all([
    db.from('itineraries').select(CLIENT_TRIP_COLUMNS).eq('org_id', orgId).eq('client_id', clientId),
    address
      ? db.from('itineraries').select(CLIENT_TRIP_COLUMNS).eq('org_id', orgId)
          // An exact (case-insensitive) match: `_` and `%` are legal in an
          // address but are LIKE wildcards, so they are escaped.
          .ilike('client_email', escapeLike(address))
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ])

  const seen = new Set<string>()
  const data = ([...(byId.data ?? []), ...(byEmail.data ?? [])] as unknown as ClientTrip[])
    .filter(row => {
      if (seen.has(row.id)) return false
      seen.add(row.id)
      return true
    })
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))

  return { data, error: byId.error || byEmail.error || null }
}
