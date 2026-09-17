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
// periods stopped being fixed columns. The twenty columns were dropped by
// 20261006; the five preset keys and their conventional bands survive only
// as the defaults an install without a vehicle vocabulary starts from.
//
// This module is the ONE reader: vehicleBands(row) understands the list and
// the oldest single-rate rows, in that order. The
// chooser is lib/vocabulary's vehicleForPax — the same rule
// getTransportRateForPax always applied (exact band, else the smallest
// vehicle whose maximum covers the group, else the largest).
//
// Rules, all inherited from the columns:
//   - a vehicle absent from the list is not offered; a blank or zero rate
//     never was ("leave the rate blank and it is never used", PR #102)
//   - rate_non_eur null means "same as EUR"
//   - capacity bands are the VOCABULARY's (operator, 2026-09-17:
//     "transportation rates always follow the Vocabulary vehicle sizes"):
//     every write stamps them (stampVocabularyBands) and a band changed in
//     Settings re-stamps every row (lib/rates/vehicle-bands-server). A vehicle
//     the vocabulary no longer lists keeps the band it was entered with.
//   - transport packages (b2b_transport_packages, 20261018) carry the same
//     list; a package row from before it reads its five columns
// ============================================

import { KEY_PATTERN, slugifyKey, vehicleForPax, type VehicleBand } from '@/lib/vocabulary'

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

/** The five preset vehicles and their conventional bands — what the dropped
 *  columns defaulted to (every production row carried these on 2026-09-12),
 *  and what an install without a vehicle vocabulary starts from. */
export const PRESET_VEHICLE_KEYS = ['sedan', 'minivan', 'van', 'minibus', 'bus'] as const
export type PresetVehicleKey = (typeof PRESET_VEHICLE_KEYS)[number]
export const PRESET_VEHICLE_BANDS: Record<PresetVehicleKey, { min: number; max: number }> = {
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

/** The five vehicle columns a transport package carried before its list
 *  (20261018): a rate and a MAXIMUM each; a band starts one above the column
 *  before it. The migration's backfill, for a row read before it ran. */
const PACKAGE_COLUMN_DEFAULT_MAX: Record<PresetVehicleKey, number> = { sedan: 3, minivan: 7, van: 12, minibus: 20, bus: 50 }
function packageColumnBands(row: Record<string, unknown>): VehicleBandRate[] | null {
  if (!PRESET_VEHICLE_KEYS.some(k => `${k}_rate` in row)) return null
  const out: VehicleBandRate[] = []
  let floor = 1
  for (const k of PRESET_VEHICLE_KEYS) {
    const max = num(row[`${k}_capacity`]) ?? PACKAGE_COLUMN_DEFAULT_MAX[k]
    const rate = num(row[`${k}_rate`])
    if (rate !== null && rate > 0) {
      out.push({ key: k, rate_eur: rate, rate_non_eur: null, capacity_min: floor, capacity_max: Math.max(max, floor) })
    }
    floor = max + 1
  }
  return out.sort(byBand)
}

/** The vocabulary's band on every vehicle it lists (min_pax/max_pax), the
 *  rest as they are, re-sorted by band. `bands` empty = unchanged. */
export function stampVocabularyBands(vehicles: readonly VehicleBandRate[], bands: readonly VehicleBand[]): VehicleBandRate[] {
  const byKey = new Map(bands.filter(b => b.max_pax >= Math.max(b.min_pax, 1)).map(b => [b.key, b]))
  return vehicles
    .map(v => {
      const b = byKey.get(v.key)
      return b ? { ...v, capacity_min: Math.max(b.min_pax, 1), capacity_max: b.max_pax } : { ...v }
    })
    .sort(byBand)
}

/** Whether stamping changed anything — so a re-stamp writes only rows that differ. */
export function sameVehicleBands(a: readonly VehicleBandRate[], b: readonly VehicleBandRate[]): boolean {
  return a.length === b.length && a.every((v, i) => v.key === b[i].key && v.capacity_min === b[i].capacity_min && v.capacity_max === b[i].capacity_max && v.rate_eur === b[i].rate_eur && v.rate_non_eur === b[i].rate_non_eur)
}

/** The vehicles this row offers, sorted smallest band first — from the
 *  `vehicles` list when the row has one, else a transport package's five
 *  columns, else the oldest shape (one base_rate for one vehicle_type).
 *  Empty when the row prices nothing. */
export function vehicleBands(row: Record<string, unknown>): VehicleBandRate[] {
  const listed = parseVehicles(row.vehicles)
  if (listed) return listed
  const packaged = packageColumnBands(row)
  if (packaged) return packaged

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

// The four cells a vehicle has in a FLAT shape — a write body's
// <preset>_rate_eur fields, a CSV sheet's <key>_* columns.
const FLAT_FIELDS = ['rate_eur', 'rate_non_eur', 'capacity_min', 'capacity_max'] as const

export interface VehicleWriteResult {
  /** The list to store; undefined when the body carried no vehicle field at all. */
  vehicles?: VehicleBandRate[]
  /** Why the body cannot be stored, when it cannot. */
  invalid?: string
}

/** True when a write carries any vehicle field — the list, or a preset's
 *  per-vehicle field — so a PUT knows to load the row it is patching. */
export function bodyTouchesVehicles(body: Record<string, unknown>): boolean {
  if (body.vehicles !== undefined) return true
  return PRESET_VEHICLE_KEYS.some(k => FLAT_FIELDS.some(f => body[`${k}_${f}`] !== undefined))
}

/** What a write may carry for vehicles: a `vehicles` list (the form since
 *  P2), or the per-vehicle fields of the five presets (the body shape older
 *  clients send — the columns they were named for are gone, the shape is
 *  still honoured). A list REPLACES the row's vehicles. Preset fields PATCH
 *  them — merged over `existing`, so such a write cannot drop a vehicle it
 *  does not know (a 4x4 priced from the form survives a client that only
 *  speaks sedan…bus). A field blanked or zero removes that vehicle, as a
 *  blank column always did. No vehicle field → nothing to change. */
export function vehiclesFromBody(body: Record<string, unknown>, existing: readonly VehicleBandRate[] = []): VehicleWriteResult {
  if (body.vehicles !== undefined) {
    const list = sanitizeVehicles(body.vehicles)
    if (!list) {
      return { invalid: 'vehicles must be a list of { key, rate_eur, rate_non_eur, capacity_min, capacity_max } — key a slug, min ≤ max, no duplicate key' }
    }
    return { vehicles: list }
  }
  const touched = PRESET_VEHICLE_KEYS.filter(k => FLAT_FIELDS.some(f => body[`${k}_${f}`] !== undefined))
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
      capacity_min: min ?? PRESET_VEHICLE_BANDS[k].min,
      capacity_max: max ?? PRESET_VEHICLE_BANDS[k].max,
    })
  }
  const list = sanitizeVehicles([...byKey.values()])
  if (!list) return { invalid: 'a vehicle band must run from a minimum to a maximum of at least the same size' }
  return { vehicles: list }
}

/** The keys a write may use: the agency's vehicle vocabulary (the five
 *  presets when it has none), plus whatever the row already carries — hiding
 *  a vehicle in Settings never breaks the rows that price it. */
export function allowedVehicleKeys(vocabularyKeys: readonly string[], existing: readonly VehicleBandRate[] = []): Set<string> {
  return new Set([...(vocabularyKeys.length ? vocabularyKeys : PRESET_VEHICLE_KEYS), ...existing.map(v => v.key)])
}

export function unknownVehicleKeys(vehicles: readonly VehicleBandRate[], allowed: ReadonlySet<string>): string[] {
  return vehicles.map(v => v.key).filter(k => !allowed.has(k))
}

// ---- Flat sheets (the CSV importer / exporter) ----------------------------

/** The vehicles a FLAT sheet row carries: one <key>_rate_eur column-set per
 *  vehicle in `specs` (the agency's sheet). A sheet row is the whole list —
 *  every vehicle it prices — so this REPLACES, where a form's legacy fields
 *  patch. A vehicle without a rate is not offered. The band is always the
 *  spec's (Settings → Vocabulary); the sheet's capacity cells are written
 *  on export for reading and ignored on import. Null when a band is malformed. */
export function vehiclesFromFlatRow(
  row: Record<string, unknown>,
  specs: readonly { key: string; min: number; max: number }[],
): VehicleBandRate[] | null {
  const raw = specs.map(s => ({
    key: s.key,
    rate_eur: row[`${s.key}_rate_eur`],
    rate_non_eur: row[`${s.key}_rate_non_eur`],
    capacity_min: s.min,
    capacity_max: s.max,
  }))
  return sanitizeVehicles(raw)
}

/** The FLAT cells for a row's vehicles, for the columns in `specs`: the
 *  list written out as <key>_rate_eur / _rate_non_eur / _capacity_min /
 *  _capacity_max. A vehicle the row does not offer exports
 *  blank; a vehicle the row offers that the sheet has no column for is not
 *  exported (the sheet is the agency's list — a hidden vehicle stays behind). */
export function flattenVehicles(
  row: Record<string, unknown>,
  specs: readonly { key: string }[],
): Record<string, number | null> {
  const bands = vehicleBands(row)
  const out: Record<string, number | null> = {}
  for (const s of specs) {
    const b = bands.find(x => x.key === s.key)
    out[`${s.key}_rate_eur`] = b ? b.rate_eur : null
    // Unset stays blank (not mirrored), so a re-import lands the same list.
    out[`${s.key}_rate_non_eur`] = b ? b.rate_non_eur : null
    out[`${s.key}_capacity_min`] = b ? b.capacity_min : null
    out[`${s.key}_capacity_max`] = b ? b.capacity_max : null
  }
  return out
}

/** Remove every <key>_* vehicle cell for these keys — before an upsert; the
 *  table has no per-vehicle columns, so none may reach Postgres. */
export function stripVehicleFields(row: Record<string, unknown>, keys: readonly string[]): void {
  for (const k of keys) for (const f of FLAT_FIELDS) delete row[`${k}_${f}`]
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
