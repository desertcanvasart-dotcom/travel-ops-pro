// ============================================
// May this transport or ticket rate be deleted?
// ============================================
// Rates are referenced by id with no foreign key, so a delete used to go
// through whatever pointed at the rate:
//   - a trip's priced line picked on the pricing grid
//     (itinerary_services.notes "…|rate_id:<id>" — a vehicle pick is
//     "<id>__<vehicle>"),
//   - a programme day's chosen flight or train (tour_templates.itinerary,
//     a day's transport_rate_id) or any other pin inside the programme,
//   - a tour variation's service (tour_variation_services.rate_id),
//   - a B2B pricing rule (b2b_pricing_rules.rate_id).
// The trip kept a price nobody could trace and the programme a choice the
// engine reports as "no longer in Rates". So the delete is refused, naming
// what uses the rate — the same shape as the supplier delete
// (lib/suppliers/delete-guard) — and the operator deactivates it instead.

import { describeRateBlockers, type RateReference } from './rate-delete-blockers'

export { describeRateBlockers, type RateReference }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** How many things reference rate `id` of this company. */
export async function rateReferences(db: Db, orgId: string, id: string): Promise<RateReference[]> {
  if (!id) return []
  const like = `%rate_id:${id}%`
  const [tripLines, variations, rules, templates] = await Promise.all([
    db.from('itinerary_services').select('id').ilike('notes', like),
    db.from('tour_variation_services').select('id').eq('rate_id', id),
    db.from('b2b_pricing_rules').select('id').eq('rate_id', id),
    db.from('tour_templates').select('id, itinerary').eq('org_id', orgId),
  ])
  const count = (r: { data?: unknown[] | null } | null | undefined) => (Array.isArray(r?.data) ? r!.data!.length : 0)
  // A programme stores the pick inside its days (JSONB), under whichever key
  // the day's picker writes — so look for the id anywhere in it.
  const programmes = (Array.isArray(templates?.data) ? templates.data : [])
    .filter((t: { itinerary?: unknown }) => t.itinerary != null && JSON.stringify(t.itinerary).includes(id))
    .length
  return [
    { label: 'priced trip lines', count: count(tripLines) },
    { label: 'tour programmes', count: programmes },
    { label: 'tour variation services', count: count(variations) },
    { label: 'B2B pricing rules', count: count(rules) },
  ]
}

/** The 409 body when something uses the rate, or null when it may go. */
export async function rateDeleteBlocked(db: Db, orgId: string, id: string): Promise<string | null> {
  return describeRateBlockers(await rateReferences(db, orgId, id))
}
