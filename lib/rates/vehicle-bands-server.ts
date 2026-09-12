// ============================================
// Vehicle bands — the write side, for the transportation routes
// ============================================
// The four routes that write transportation_rates (rates/transportation,
// rates/transportation/[id], resources/transportation, resources/…/[id])
// all resolve a request's vehicles the same way: what the body carries
// (a list, or the legacy per-vehicle fields), checked against the vehicle
// types the agency defines in Settings → Vocabulary, stored as the list
// PLUS its mirror into the five legacy columns for readers not yet
// converted. One function, so the four cannot drift.

import { vocabularyItemsForCurrentOrg } from '@/lib/vocabulary-server'
import {
  allowedVehicleKeys, legacyColumnsFor, unknownVehicleKeys, vehicleBands, vehiclesFromBody,
  type VehicleBandRate,
} from '@/lib/rates/vehicle-bands'

export type VehicleWrite =
  | { ok: true; patch: (Record<string, unknown> & { vehicles: VehicleBandRate[] }) | null }
  | { ok: false; error: string }

/** The row patch for a write's vehicles — the list and its legacy mirror —
 *  or null when the body carries no vehicle field (a PUT changing something
 *  else). `existingRow` is the row being patched (null on create): legacy
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

  const vocabulary = (await vocabularyItemsForCurrentOrg('vehicle_type')).map(i => i.key)
  const allowed = allowedVehicleKeys(vocabulary, existing)
  const unknown = unknownVehicleKeys(vehicles, allowed)
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown vehicle type${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Add it in Settings → Vocabulary → Vehicle types, or use one of: ${[...allowed].join(', ')}`,
    }
  }
  return { ok: true, patch: { vehicles, ...legacyColumnsFor(vehicles) } }
}
