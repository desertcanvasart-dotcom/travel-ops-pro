// ============================================
// Is an accommodation rate row still in use?
// ============================================
// Deleting a hotel, ship, hotel-service or sleeper rate that something still
// points at was either refused by Postgres (tour_days.accommodation_id has a
// foreign key with no ON DELETE, so the operator read "Internal server error")
// or went through and orphaned the reference silently — and the engine later
// reported "The hotel chosen for Cairo is no longer in Rates → Hotels" on a
// quote nobody connected with the delete.
//
// So the delete routes ask first and refuse with the reason (409), naming
// what uses the row and suggesting the switch that keeps it: deactivate.
//
// What can point at a rate row, by id:
//   - tour_days.accommodation_id      the legacy tour builder (hotels only)
//   - tour_templates.itinerary        a programme day's chosen hotel/ship
//                                     (property_by_tier) or chosen sleeper
//                                     (a travel leg's rate id) — JSONB, so
//                                     the company's programmes are scanned
//   - itinerary_services.notes        a Pricing Grid pick ("…|rate_id:<id>")

// Structural, so a route's client and the test mock both fit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export type RateTable = 'accommodation_rates' | 'nile_cruises' | 'hotel_staff_rates' | 'sleeping_train_rates'

export interface RateUsage {
  tourDays: number
  programmes: number
  gridLines: number
}

/** How many places reference this rate row. Lookups that fail count as 0 —
 *  the guard must not block a delete because an optional table is missing;
 *  the foreign key is still the last wall. */
export async function rateUsage(db: Db, table: RateTable, id: string, orgId: string): Promise<RateUsage> {
  const usage: RateUsage = { tourDays: 0, programmes: 0, gridLines: 0 }
  if (table === 'accommodation_rates') {
    // Global on purpose: the foreign key refuses the delete whichever
    // company's tour holds the row, and tour_days has no org_id of its own.
    const { count } = await db.from('tour_days').select('id', { count: 'exact', head: true }).eq('accommodation_id', id)
    usage.tourDays = count ?? 0
  }
  {
    const { data } = await db.from('tour_templates').select('id, itinerary').eq('org_id', orgId)
    // A rate id is a uuid: as a quoted JSON string it cannot occur by accident.
    const needle = `"${id}"`
    usage.programmes = ((data ?? []) as Array<{ itinerary: unknown }>)
      .filter(t => t.itinerary != null && JSON.stringify(t.itinerary).includes(needle)).length
  }
  {
    const { count } = await db.from('itinerary_services').select('id', { count: 'exact', head: true }).ilike('notes', `%rate_id:${id}%`)
    usage.gridLines = count ?? 0
  }
  return usage
}

/** The 409 message for a rate still in use, or null when nothing uses it. */
export function rateInUseMessage(usage: RateUsage): string | null {
  const parts = [
    usage.tourDays ? `${usage.tourDays} tour day${usage.tourDays === 1 ? '' : 's'}` : '',
    usage.programmes ? `${usage.programmes} programme${usage.programmes === 1 ? '' : 's'}` : '',
    usage.gridLines ? `${usage.gridLines} Pricing Grid line${usage.gridLines === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  if (!parts.length) return null
  return `This rate is used by ${parts.join(', ')}. Switch it off (untick Active) instead of deleting it, or remove it from those first.`
}
