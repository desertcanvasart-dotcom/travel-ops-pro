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

/** A readable word for a vehicle key where no vocabulary label is at hand
 *  (server code, documents): 'sedan' → 'Sedan', 'horse_carriage' → 'Horse
 *  Carriage', '4x4' → '4x4'. The agency's own label (useVehicleLabel on the
 *  client, the vocabulary on the server) is preferred wherever available. */
export function vehicleKeyLabel(key: string): string {
  return key.split('_').filter(Boolean).map(w => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
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

const LEGACY_FIELDS = ['rate_eur', 'rate_non_eur', 'capacity_min', 'capacity_max'] as const

export interface VehicleWriteResult {
  /** The list to store; undefined when the body carried no vehicle field at all. */
  vehicles?: VehicleBandRate[]
  /** Why the body cannot be stored, when it cannot. */
  invalid?: string
}

/** True when a write carries any vehicle field — the list, or a legacy
 *  per-vehicle column — so a PUT knows to load the row it is patching. */
export function bodyTouchesVehicles(body: Record<string, unknown>): boolean {
  if (body.vehicles !== undefined) return true
  return LEGACY_VEHICLE_KEYS.some(k => LEGACY_FIELDS.some(f => body[`${k}_${f}`] !== undefined))
}

/** What a write may carry for vehicles: a `vehicles` list (the form since
 *  P2), or the legacy per-vehicle fields (older clients, the CSV importer).
 *  A list REPLACES the row's vehicles. Legacy fields PATCH them — merged
 *  over `existing`, so a legacy write cannot drop a vehicle it does not know
 *  (a 4x4 priced from the form survives an importer run that only speaks
 *  sedan…bus). A legacy field blanked or zero removes that vehicle, as a
 *  blank column always did. No vehicle field → nothing to change. */
export function vehiclesFromBody(body: Record<string, unknown>, existing: readonly VehicleBandRate[] = []): VehicleWriteResult {
  if (body.vehicles !== undefined) {
    const list = sanitizeVehicles(body.vehicles)
    if (!list) {
      return { invalid: 'vehicles must be a list of { key, rate_eur, rate_non_eur, capacity_min, capacity_max } — key a slug, min ≤ max, no duplicate key' }
    }
    return { vehicles: list }
  }
  const touched = LEGACY_VEHICLE_KEYS.filter(k => LEGACY_FIELDS.some(f => body[`${k}_${f}`] !== undefined))
  if (touched.length === 0) return {}
  const byKey = new Map(existing.map(v => [v.key, { ...v }]))
  for (const k of touched) {
    const cur = byKey.get(k)
    const rate = body[`${k}_rate_eur`] !== undefined ? num(body[`${k}_rate_eur`]) : (cur?.rate_eur ?? null)
    if (rate === null || rate <= 0) { byKey.delete(k); continue }
    const nonEur = body[`${k}_rate_non_eur`] !== undefined ? num(body[`${k}_rate_non_eur`]) : (cur?.rate_non_eur ?? null)
    const min = body[`${k}_capacity_min`] !== undefined ? num(body[`${k}_capacity_min`]) : (cur?.capacity_min ?? null)
    const max = body[`${k}_capacity_max`] !== undefined ? num(body[`${k}_capacity_max`]) : (cur?.capacity_max ?? null)
    byKey.set(k, {
      key: k,
      rate_eur: rate,
      rate_non_eur: nonEur !== null && nonEur >= 0 ? nonEur : null,
      capacity_min: min ?? LEGACY_VEHICLE_BANDS[k].min,
      capacity_max: max ?? LEGACY_VEHICLE_BANDS[k].max,
    })
  }
  const list = sanitizeVehicles([...byKey.values()])
  if (!list) return { invalid: 'a vehicle band must run from a minimum to a maximum of at least the same size' }
  return { vehicles: list }
}

/** The legacy columns a list mirrors into, for readers not yet converted
 *  (and the CSV exporter). A preset the list does not carry is CLEARED —
 *  its rate null, its band back to the conventional default — so removing
 *  a vehicle in the form removes it everywhere. A vehicle beyond the five
 *  presets lives only in the list. rate_non_eur mirrors "same as EUR". */
export function legacyColumnsFor(vehicles: readonly VehicleBandRate[]): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const k of LEGACY_VEHICLE_KEYS) {
    const v = vehicles.find(b => b.key === k)
    out[`${k}_rate_eur`] = v ? v.rate_eur : null
    out[`${k}_rate_non_eur`] = v ? (v.rate_non_eur ?? v.rate_eur) : null
    out[`${k}_capacity_min`] = v ? v.capacity_min : LEGACY_VEHICLE_BANDS[k].min
    out[`${k}_capacity_max`] = v ? v.capacity_max : LEGACY_VEHICLE_BANDS[k].max
  }
  return out
}

/** The keys a write may use: the agency's vehicle vocabulary (the five
 *  presets when it has none), plus whatever the row already carries — hiding
 *  a vehicle in Settings never breaks the rows that price it. */
export function allowedVehicleKeys(vocabularyKeys: readonly string[], existing: readonly VehicleBandRate[] = []): Set<string> {
  return new Set([...(vocabularyKeys.length ? vocabularyKeys : LEGACY_VEHICLE_KEYS), ...existing.map(v => v.key)])
}

export function unknownVehicleKeys(vehicles: readonly VehicleBandRate[], allowed: ReadonlySet<string>): string[] {
  return vehicles.map(v => v.key).filter(k => !allowed.has(k))
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
