// ============================================
// A transport rate's pickup area and the sights it covers, on save
// ============================================
// Migration 20270125 (ported from autoura-saas #832), step 3 of the transport
// zones plan. The rate form's save routes ask this for the columns to write:
//   zone           one of the city's zones (Settings → Zones), by key or name;
//                  blank = the city's default. Not sent = the stored one, unless
//                  it does not belong to the (possibly new) city: then the default.
//   covers_sights  names on the company's entrance-fee sheet, saved in the
//                  sheet's spelling. Not sent = the stored list.
// Before migration 20270125 the columns are not there: nothing is written, and
// a form that asks to set them is told so.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCardSights, resolveZoneChoice } from './city-zones'
import { loadCityZones } from './hotel-zone'

/** Postgres / PostgREST "no such column". */
const NO_COLUMN = new Set(['42703', 'PGRST204'])

export type CardZoneWrite =
  | { ok: true; patch: { zone?: string | null; covers_sights?: string[] } }
  | { ok: false; status: number; error: string }

export async function cardZoneWrite(
  db: SupabaseClient,
  orgId: string,
  body: Record<string, unknown>,
  existing: { zone?: string | null; covers_sights?: string[] | null } | null,
): Promise<CardZoneWrite> {
  const asksZone = body.zone !== undefined && String(body.zone ?? '').trim() !== ''
  const asksSights = body.covers_sights !== undefined && (Array.isArray(body.covers_sights) ? body.covers_sights.length > 0 : String(body.covers_sights ?? '').trim() !== '')

  // Are the columns there? (One row, two columns: cheap.)
  const probe = await db.from('transportation_rates').select('zone, covers_sights').limit(1)
  if (probe.error) {
    if (probe.error.code && NO_COLUMN.has(probe.error.code)) {
      if (asksZone || asksSights) {
        return { ok: false, status: 503, error: 'Pickup areas and sights need a database update that has not been applied yet (migration 20270125).' }
      }
      return { ok: true, patch: {} }
    }
    return { ok: false, status: 500, error: 'Could not read the transport rates.' }
  }

  const patch: { zone?: string | null; covers_sights?: string[] } = {}
  const zones = await loadCityZones(db, orgId)
  if (body.zone !== undefined) {
    const choice = resolveZoneChoice(zones, body.city, body.zone, { what: 'rate' })
    if (!choice.ok) return { ok: false, status: 400, error: choice.error }
    patch.zone = choice.zone
  } else if (existing?.zone) {
    const kept = resolveZoneChoice(zones, body.city, existing.zone, { what: 'rate' })
    patch.zone = kept.ok ? kept.zone : null
  }

  if (body.covers_sights !== undefined) {
    const { data: fees, error } = await db.from('entrance_fees').select('attraction_name').eq('org_id', orgId)
    if (error) return { ok: false, status: 500, error: 'Could not read your entrance-fee sheet.' }
    const sights = resolveCardSights(body.covers_sights, (fees ?? []).map((f: { attraction_name: string | null }) => f.attraction_name ?? '').filter(Boolean))
    if (!sights.ok) return { ok: false, status: 400, error: sights.error }
    patch.covers_sights = sights.sights
  }
  return { ok: true, patch }
}
