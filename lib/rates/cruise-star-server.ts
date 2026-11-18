// After a cruise is saved starred: clear the stars it competes with
// (lib/rates/cruise-star), so there is one starred boat per tier, route and
// length. Only this company's rows.

import { competingStars, describeCruiseScope, type CruiseScopeRow } from './cruise-star'

type Db = { from(table: string): any }

export interface StarOutcome {
  /** "standard · Aswan → Luxor · 3 nights" */
  scope: string
  /** The ships whose star was cleared. */
  cleared: string[]
}

export async function clearCompetingCruiseStars(
  db: Db,
  orgId: string,
  saved: (CruiseScopeRow & { is_preferred?: unknown }) | null | undefined,
): Promise<StarOutcome | null> {
  if (!saved || saved.is_preferred !== true) return null
  const { data, error } = await db.from('nile_cruises')
    .select('id, tier, embark_city, disembark_city, duration_nights, ship_name, is_preferred')
    .eq('org_id', orgId)
    .eq('is_preferred', true)
  if (error) throw new Error(error.message)
  const rivals = competingStars(saved, (data ?? []) as Array<CruiseScopeRow & { is_preferred?: unknown }>)
  if (rivals.length > 0) {
    const { error: upErr } = await db.from('nile_cruises')
      .update({ is_preferred: false })
      .eq('org_id', orgId)
      .in('id', rivals.map(r => String(r.id)))
    if (upErr) throw new Error(upErr.message)
  }
  return { scope: describeCruiseScope(saved), cleared: rivals.map(r => String(r.ship_name ?? '').trim() || 'a cruise') }
}
