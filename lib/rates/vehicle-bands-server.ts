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
import type { VehicleBand } from '@/lib/vocabulary'
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
 * Put the org's vocabulary bands on every stored rate — after a vehicle's
 * size changes in Settings → Vocabulary. transportation_rates has no org_id
 * (one organisation per install, DEFERRED_GATES G1); packages are scoped.
 * Only rows whose list changes are written. Returns how many were.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function restampVehicleBands(supabase: SupabaseClient<any>, orgId: string): Promise<number> {
  const bands = await vehicleBandsForOrg(supabase, orgId)
  if (bands.length === 0) return 0
  let written = 0
  const tables = [
    { table: 'transportation_rates', scoped: false },
    { table: 'b2b_transport_packages', scoped: true },
  ] as const
  for (const { table, scoped } of tables) {
    let query = supabase.from(table).select('id, vehicles')
    if (scoped) query = query.eq('org_id', orgId)
    const { data, error } = await query
    if (error) throw error
    for (const row of (data ?? []) as { id: string; vehicles: unknown }[]) {
      const current = parseVehicles(row.vehicles)
      if (!current || current.length === 0) continue
      const stamped = stampVocabularyBands(current, bands)
      if (sameVehicleBands(current, stamped)) continue
      const { error: upErr } = await supabase.from(table).update({ vehicles: stamped }).eq('id', row.id)
      if (upErr) throw upErr
      written++
    }
  }
  return written
}
