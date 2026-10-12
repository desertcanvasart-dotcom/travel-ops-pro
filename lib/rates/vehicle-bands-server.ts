// ============================================
// Vehicle bands — the write side, for the transportation routes
// ============================================
// The four routes that write transportation_rates (rates/transportation,
// rates/transportation/[id], resources/transportation, resources/…/[id])
// all resolve a request's vehicles the same way: what the body carries
// (a list, or the per-vehicle fields older clients send), checked against
// the vehicle types the agency defines in Settings → Vocabulary, stored as
// the row's `vehicles` list with the vocabulary's passenger bands. One
// function, so the four cannot drift — the transport package routes
// (b2b/transport-packages) use it too since 20261018.

import type { SupabaseClient } from '@supabase/supabase-js'
import { vehicleBandsForOrg, vocabularyItemsForCurrentOrg } from '@/lib/vocabulary-server'
import type { VehicleBand, VehicleTypeUsage } from '@/lib/vocabulary'
import {
  allowedVehicleKeys, parseVehicles, sameVehicleBands, stampVocabularyBands, unknownVehicleKeys, vehicleBands, vehiclesFromBody,
  type VehicleBandRate,
} from '@/lib/rates/vehicle-bands'

/** The vocabulary items' passenger bands (meta min_pax / max_pax). */
export function bandsFromVocabulary(items: readonly { key: string; meta?: Record<string, unknown> | null }[]): VehicleBand[] {
  return items
    .map(i => ({ key: i.key, min_pax: Number(i.meta?.min_pax ?? 0), max_pax: Number(i.meta?.max_pax ?? 0) }))
    .filter(b => Number.isInteger(b.min_pax) && Number.isInteger(b.max_pax) && b.max_pax > 0)
}

export type VehicleWrite =
  | { ok: true; patch: (Record<string, unknown> & { vehicles: VehicleBandRate[] }) | null }
  | { ok: false; error: string }

/** The row patch for a write's vehicles — `{ vehicles }` — or null when the
 *  body carries no vehicle field (a PUT changing something else).
 *  `existingRow` is the row being patched (null on create): per-vehicle
 *  fields merge over its vehicles, and a vehicle it already carries stays
 *  allowed even if the agency has since hidden it in Settings. */
export async function resolveVehicleWrite(
  body: Record<string, unknown>,
  existingRow: Record<string, unknown> | null,
): Promise<VehicleWrite> {
  const existing = existingRow ? vehicleBands(existingRow) : []
  const { vehicles, invalid } = vehiclesFromBody(body, existing)
  if (invalid) return { ok: false, error: invalid }
  if (!vehicles) return { ok: true, patch: null }

  const items = await vocabularyItemsForCurrentOrg('vehicle_type')
  const vocabulary = items.map(i => i.key)
  const allowed = allowedVehicleKeys(vocabulary, existing)
  const unknown = unknownVehicleKeys(vehicles, allowed)
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown vehicle type${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Add it in Settings → Vocabulary → Vehicle types, or use one of: ${[...allowed].join(', ')}`,
    }
  }
  // Sizes are the vocabulary's, whatever the client sent.
  return { ok: true, patch: { vehicles: stampVocabularyBands(vehicles, bandsFromVocabulary(items)) } }
}

/**
 * Put the org's vocabulary bands on every one of ITS stored rates — after a
 * vehicle's size changes in Settings → Vocabulary. Both tables carry org_id;
 * this rewrote every company's transportation rates with one company's sizes.
 * Only rows whose list changes are written. Returns how many were.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function restampVehicleBands(supabase: SupabaseClient<any>, orgId: string): Promise<number> {
  const bands = await vehicleBandsForOrg(supabase, orgId)
  if (bands.length === 0) return 0
  let written = 0
  for (const table of ['transportation_rates', 'b2b_transport_packages'] as const) {
    const { data, error } = await supabase.from(table).select('id, vehicles').eq('org_id', orgId)
    if (error) throw error
    for (const row of (data ?? []) as { id: string; vehicles: unknown }[]) {
      const current = parseVehicles(row.vehicles)
      if (!current || current.length === 0) continue
      const stamped = stampVocabularyBands(current, bands)
      if (sameVehicleBands(current, stamped)) continue
      const { error: upErr } = await supabase.from(table).update({ vehicles: stamped }).eq('id', row.id).eq('org_id', orgId)
      if (upErr) throw upErr
      written++
    }
  }
  return written
}

/** What a vehicle key is still filed under: transportation rates and
 *  transport packages whose `vehicles` list holds it. Deleting the key in
 *  Settings → Vocabulary leaves them naming a vehicle the list no longer has,
 *  so the settings screen warns first (ported from autoura-saas #644).
 *  This organisation's rows only — the vocabulary is its own. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function vehicleTypeUsage(supabase: SupabaseClient<any>, orgId: string, key: string): Promise<VehicleTypeUsage> {
  const [rates, packages] = await Promise.all([
    supabase.from('transportation_rates').select('id', { count: 'exact', head: true }).eq('org_id', orgId).contains('vehicles', [{ key }]),
    supabase.from('b2b_transport_packages').select('id', { count: 'exact', head: true }).eq('org_id', orgId).contains('vehicles', [{ key }]),
  ])
  return { transport_rates: rates.count ?? 0, transport_packages: packages.count ?? 0 }
}
