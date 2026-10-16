// ============================================
// Is this Guides & Services rate still used?
// ============================================
// Deleting a rate that trips, quotes or programmes point at either failed on
// a foreign key — shown as "Internal server error" (guides: tour_days.
// guide_id) — or quietly left them pointing at nothing: a pricing-grid line
// pinned to the rate (itinerary_services.notes "rate_id:<id>"), a variation's
// service line (tour_variation_services.rate_id, no foreign key), a
// programme day's picked ticket (tour_templates.itinerary attraction_ids, then
// "picked ticket no longer in the table" on every quote). The attractions
// delete looked only at trip lines whose name CONTAINED the attraction's, so
// "Karnak Sound & Light" blocked deleting "Karnak" and a picked ticket did
// not (Rates audit, Guides & Services #11).
//
// One check for the four rate tables. The rate id has already been checked
// as the caller's company's (rowInOrg), so a row naming it is that company's
// too; the trip lines and programmes are read through their company anyway.
// Returns the first use found, worded for the person deleting, or null.

import { selectAllRows } from '@/lib/db/select-all-rows'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export type RateUseTable = 'guide_rates' | 'meal_rates' | 'entrance_fees' | 'activity_rates'

export interface RateUse {
  where: 'trip_line' | 'variation' | 'tour_day' | 'programme'
  /** What uses it, for the message: a programme's name, when there is one. */
  name?: string
}

/** Does `itinerary` (a programme's JSON day list) pick ticket `id`? */
export function programmePicksTicket(itinerary: unknown, id: string): boolean {
  const days = Array.isArray(itinerary)
    ? itinerary
    : Array.isArray((itinerary as { days?: unknown })?.days) ? (itinerary as { days: unknown[] }).days : []
  return days.some(d => Array.isArray((d as { attraction_ids?: unknown })?.attraction_ids)
    && ((d as { attraction_ids: unknown[] }).attraction_ids).map(String).includes(id))
}

export async function rateInUse(db: Db, table: RateUseTable, id: string, orgId: string): Promise<RateUse | null> {
  // A pricing-grid line pinned to this rate, on one of this company's trips.
  const { data: pinned } = await db
    .from('itinerary_services')
    .select('id, itinerary_days!inner(itineraries!inner(org_id))')
    .eq('itinerary_days.itineraries.org_id', orgId)
    .ilike('notes', `%rate_id:${id}%`)
    .limit(1)
  if (pinned?.length) return { where: 'trip_line' }

  // A tour variation's own service line.
  const { data: variationLines } = await db
    .from('tour_variation_services')
    .select('id')
    .eq('rate_id', id)
    .limit(1)
  if (variationLines?.length) return { where: 'variation' }

  // A day of a legacy tour (tour_days carries foreign keys to these two).
  if (table === 'guide_rates' || table === 'meal_rates') {
    const { data: days } = await (table === 'guide_rates'
      ? db.from('tour_days').select('id').eq('guide_id', id).limit(1)
      : db.from('tour_days').select('id').or(`lunch_meal_id.eq.${id},dinner_meal_id.eq.${id}`).limit(1))
    if (days?.length) return { where: 'tour_day' }
  }

  // A programme day whose ticket was picked from the fee table.
  if (table === 'entrance_fees') {
    const { data: templates } = await selectAllRows(() => db
      .from('tour_templates')
      .select('id, template_name, itinerary')
      .eq('org_id', orgId))
    const hit = ((templates ?? []) as Array<{ template_name?: string | null; itinerary?: unknown }>)
      .find(t => programmePicksTicket(t.itinerary, id))
    if (hit) return { where: 'programme', name: hit.template_name ?? undefined }
  }

  return null
}

/** The refusal, in plain words, with the way out. */
export function rateInUseMessage(use: RateUse): string {
  const what = {
    trip_line: 'a priced line on a trip (Pricing Grid)',
    variation: "a tour variation's service list",
    tour_day: 'a day of a tour',
    programme: use.name ? `a picked ticket on the programme "${use.name}"` : 'a picked ticket on a programme',
  }[use.where]
  return `This rate cannot be deleted: it is used by ${what}. Deactivate it instead, or remove it there first.`
}
