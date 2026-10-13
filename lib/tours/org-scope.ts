// ============================================
// Whose programme is this?
// ============================================
// tour_templates, tour_variations and the legacy tours belong to one company
// (org_id, migration 20261207). Their CHILD tables carry no org_id of their
// own — tour_template_versions / tour_day_activities hang off a template;
// tour_variation_versions / tour_variation_services / variation_daily_itinerary
// / variation_pricing / variation_services off a variation; tour_days /
// tour_pricing off a tour. So a route that is handed a template, variation or
// tour id asks HERE first whether it is the caller's company's, and only then
// reads or writes the children by that id. Another company's id answers null,
// exactly like an id that does not exist (404, never 403: whether the other
// company has such a row is not the caller's business).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** A uuid no organisation has: filtering by it matches nothing. */
export const NO_ORG = '00000000-0000-0000-0000-000000000000'

async function rowInOrg<T>(
  db: Db,
  table: 'tour_templates' | 'tour_variations' | 'tours',
  orgId: string | null | undefined,
  id: string | null | undefined,
  columns: string
): Promise<T | null> {
  if (!orgId || !id) return null
  const { data } = await db.from(table).select(columns).eq('id', id).eq('org_id', orgId).maybeSingle()
  return (data as T) ?? null
}

/** The template when it is this company's, else null. */
export function templateInOrg<T = { id: string }>(db: Db, orgId: string | null | undefined, templateId: string | null | undefined, columns = 'id') {
  return rowInOrg<T>(db, 'tour_templates', orgId, templateId, columns)
}

/** The variation when it is this company's, else null. */
export function variationInOrg<T = { id: string }>(db: Db, orgId: string | null | undefined, variationId: string | null | undefined, columns = 'id') {
  return rowInOrg<T>(db, 'tour_variations', orgId, variationId, columns)
}

/** The legacy builder's tour when it is this company's, else null. */
export function tourInOrg<T = { id: string }>(db: Db, orgId: string | null | undefined, tourId: string | null | undefined, columns = 'id') {
  return rowInOrg<T>(db, 'tours', orgId, tourId, columns)
}

// The rate tables a tour line (tour_variation_services.rate_id, tour_days'
// hotel / meal / guide) can name. Rate ids are uuids, unique across them.
const RATE_TABLES = [
  'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'hotel_staff_rates', 'guide_rates',
  'meal_rates', 'nile_cruises', 'flight_rates', 'train_rates', 'sleeping_train_rates',
  'transportation_rates', 'tipping_rates', 'entrance_fees', 'service_fees',
] as const

/**
 * The ids among `rateIds` that are ANOTHER company's rate (a rate belongs to
 * one company since 20261206). A tour line must name its own company's rate:
 * a write naming one of these is refused. Ids that are no rate at all are not
 * reported — free-text lines and deleted rates carry no company.
 */
export async function foreignRateIds(db: Db, orgId: string, rateIds: Array<string | null | undefined>): Promise<string[]> {
  const ids = [...new Set(rateIds.filter((x): x is string => typeof x === 'string' && x.length > 0))]
  if (ids.length === 0) return []
  const found = await Promise.all(RATE_TABLES.map(async table => {
    const { data } = await db.from(table).select('id, org_id').in('id', ids)
    return ((data ?? []) as Array<{ id: string; org_id: string | null }>).filter(r => r.org_id !== orgId).map(r => r.id)
  }))
  return found.flat()
}
