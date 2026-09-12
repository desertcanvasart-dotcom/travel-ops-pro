// ============================================
// Vehicle bands — the vehicles a transportation rate offers
// ============================================
// A transportation rate used to hold its vehicles as twenty columns: for
// each of sedan / minivan / van / minibus / bus a EUR rate, a non-EUR rate,
// a capacity min and a capacity max. Those five names were hardcoded in
// eleven places, so a vehicle the agency added in Settings → Vocabulary →
// Vehicle types (suv, 4x4, horse_carriage) had nowhere to be priced.
//
// Since 20261005 the row carries `vehicles` — a JSONB LIST of
//   { key, rate_eur, rate_non_eur, capacity_min, capacity_max }
// keyed by the vocabulary vehicle key, the shape `seasons` took when rate
// periods stopped being fixed columns. The legacy columns stay for the CSV
// importer and for readers not yet converted; writers mirror the five preset
// keys into them during the transition.
//
// This module is the ONE reader: vehicleBands(row) understands the list, the
// legacy columns, and the oldest single-rate rows, in that order. The
// chooser is lib/vocabulary's vehicleForPax — the same rule
// getTransportRateForPax always applied (exact band, else the smallest
// vehicle whose maximum covers the group, else the largest).
//
// Rules, all inherited from the columns:
//   - a vehicle absent from the list is not offered; a blank or zero rate
//     never was ("leave the rate blank and it is never used", PR #102)
//   - rate_non_eur null means "same as EUR"
//   - capacity bands are the ROW's own (the agency's contract), not the
//     vocabulary's — the vocabulary's min/max are only the default for a
//     NEW row
// ============================================

import { KEY_PATTERN, slugifyKey, vehicleForPax } from '@/lib/vocabulary'

export interface VehicleBandRate {
  /** The vocabulary vehicle key ('sedan', '4x4', …). */
  key: string
  /** Per-vehicle rate in the row's rate_currency. Always > 0 — a vehicle with no rate is not in the list. */
  rate_eur: number
  /** The non-EU-passport rate, or null = same as rate_eur. */
  rate_non_eur: number | null
  capacity_min: number
  capacity_max: number
}

/** The five vehicles the legacy columns know, and the bands the columns
 *  default to (the values every production row carried on 2026-09-12). */
export const LEGACY_VEHICLE_KEYS = ['sedan', 'minivan', 'van', 'minibus', 'bus'] as const
export type LegacyVehicleKey = (typeof LEGACY_VEHICLE_KEYS)[number]
export const LEGACY_VEHICLE_BANDS: Record<LegacyVehicleKey, { min: number; max: number }> = {
  sedan: { min: 1, max: 2 },
  minivan: { min: 3, max: 7 },
  van: { min: 8, max: 12 },
  minibus: { min: 13, max: 20 },
  bus: { min: 21, max: 45 },
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

const byBand = (a: VehicleBandRate, b: VehicleBandRate) =>
  a.capacity_max - b.capacity_max || a.capacity_min - b.capacity_min

/** A vehicles list fit to store: keys slugged and well formed, only vehicles
 *  with a positive rate, integer bands with min ≤ max, no duplicate key,
 *  sorted by band. Null when the input is not a list or holds an entry that
 *  cannot be repaired (a bad key, min > max, a duplicate) — the caller
 *  refuses the save rather than storing a guess. An entry with no rate is
 *  dropped, not refused: it is the editor's "not offered" row. */
export function sanitizeVehicles(input: unknown): VehicleBandRate[] | null {
  if (!Array.isArray(input)) return null
  const out: VehicleBandRate[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return null
    const v = raw as Record<string, unknown>
    const key = slugifyKey(typeof v.key === 'string' ? v.key : '')
    if (!KEY_PATTERN.test(key)) return null
    if (seen.has(key)) return null
    const rate = num(v.rate_eur)
    if (rate === null || rate <= 0) continue
    const nonEur = num(v.rate_non_eur)
    const min = num(v.capacity_min)
    const max = num(v.capacity_max)
    if (min === null || max === null || !Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) return null
    seen.add(key)
    out.push({ key, rate_eur: rate, rate_non_eur: nonEur !== null && nonEur >= 0 ? nonEur : null, capacity_min: min, capacity_max: max })
  }
  return out.sort(byBand)
}

/** Read a vehicles value off a rate row. Tolerates the JSONB arriving as a
 *  string, which some Supabase client paths do for jsonb columns. Null when
 *  the row has no list (not yet backfilled) — NOT for an empty list, which
 *  is a real "offers nothing" and reads as []. */
export function parseVehicles(value: unknown): VehicleBandRate[] | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    try { return sanitizeVehicles(JSON.parse(value)) } catch { return null }
  }
  return sanitizeVehicles(value)
}

/** The vehicles this row offers, sorted smallest band first — from the
 *  `vehicles` list when the row has one, else the five legacy column-sets,
 *  else the oldest shape (one base_rate for one vehicle_type). Empty when
 *  the row prices nothing. */
export function vehicleBands(row: Record<string, unknown>): VehicleBandRate[] {
  const listed = parseVehicles(row.vehicles)
  if (listed) return listed

  const fromColumns: VehicleBandRate[] = []
  for (const key of LEGACY_VEHICLE_KEYS) {
    const rate = num(row[`${key}_rate_eur`])
    if (rate === null || rate <= 0) continue
    const nonEur = num(row[`${key}_rate_non_eur`])
    fromColumns.push({
      key,
      rate_eur: rate,
      rate_non_eur: nonEur,
      capacity_min: num(row[`${key}_capacity_min`]) ?? LEGACY_VEHICLE_BANDS[key].min,
      capacity_max: num(row[`${key}_capacity_max`]) ?? LEGACY_VEHICLE_BANDS[key].max,
    })
  }
  if (fromColumns.length > 0) return fromColumns.sort(byBand)

  const base = num(row.base_rate_eur)
  if (base !== null && base > 0) {
    return [{
      key: slugifyKey(typeof row.vehicle_type === 'string' ? row.vehicle_type : '') || 'vehicle',
      rate_eur: base,
      rate_non_eur: num(row.base_rate_non_eur),
      capacity_min: num(row.capacity_min) ?? 1,
      capacity_max: num(row.capacity_max) ?? 45,
    }]
  }
  return []
}

/** The vehicle this row prices a group of `pax` in: the band it falls in,
 *  else the smallest vehicle whose maximum still covers it, else the largest
 *  the row offers. Null when the row offers nothing. */
export function vehicleRateForPax(row: Record<string, unknown>, pax: number): VehicleBandRate | null {
  const bands = vehicleBands(row)
  if (bands.length === 0) return null
  const key = vehicleForPax(bands.map(b => ({ key: b.key, min_pax: b.capacity_min, max_pax: b.capacity_max })), pax)
  return bands.find(b => b.key === key) ?? null
}
