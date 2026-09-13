// ============================================
// Rate periods as a spreadsheet
// ============================================
// The wide rate CSV has one row per rate and fixed columns for three seasons.
// A contract does not look like that — it looks like a TABLE OF PERIODS, one
// line per dated block with its rates. So the periods sheet is that table:
// one row per period, as many rows per hotel or ship as the contract has.
//
// REPLACE, NOT MERGE. Importing this file sets each listed rate's period list
// to exactly the rows in the file. A contract supersedes the previous
// contract, and merging would leave last year's windows interleaved with this
// year's with no way to tell which the operator meant. Rates NOT named in the
// file are untouched.
//
// Excel and Numbers rewrite ISO dates into the user's locale on save, which
// broke a real production import once ("23/06/2026" rejected by the database).
// Both forms are accepted here, exactly as the wide importer accepts them.

import { RATE_FIELDS, SUPPLEMENT_FIELD, type RateSeason, type RateSeasonEntity } from '@/lib/rates/rate-seasons'
import { supplementField, type RateSupplement, type SupplementSuffix } from '@/lib/rates/supplements'

export interface PeriodColumn {
  /** Header text in the file. */
  label: string
  /** Where it lands: the rate key, a period property, or a rate field. */
  field: string
}

// ── Supplements ──────────────────────────────────────────────────────────
// The agency's supplements (Settings → Vocabulary) are two more columns per
// supplement — one per passport group — carrying the per-person-per-night
// price for the period. The header carries the vocabulary KEY in brackets
// next to the agency's word, so an import still finds the column after the
// word was changed in Settings, and a sheet from another installation loads
// under its own keys. The word is for the operator's eye.
//
// Which supplements a rate CARRIES is derived on import: a key with a price
// in any of the rate's periods is on the rate; one that is blank everywhere
// is not. A sheet with no supplement columns at all (an older export) leaves
// every rate's list alone.

export interface SupplementColumnMeta {
  key: string
  label: string
  suffix: SupplementSuffix
}

const SUPPLEMENT_HEADER = /^Supplement:\s*(.*?)\s*\[([a-z0-9][a-z0-9_]{0,59})\]\s*\((EU|non-EU) passport\)$/i

export function supplementHeader(key: string, label: string, suffix: SupplementSuffix): string {
  return `Supplement: ${label} [${key}] (${suffix === 'eur' ? 'EU' : 'non-EU'} passport)`
}

/** The supplement a column header names, or null for any other header. */
export function parseSupplementHeader(header: string): SupplementColumnMeta | null {
  const m = SUPPLEMENT_HEADER.exec(String(header ?? '').trim())
  if (!m) return null
  return { key: m[2], label: m[1] || m[2], suffix: /^non/i.test(m[3]) ? 'non_eur' : 'eur' }
}

/** A sheet config with a pair of columns for each of the given supplements —
 *  the agency's vocabulary for the kind, plus any key a rate already
 *  carries (so an export never drops a price it holds). */
export function withSupplementColumns(
  config: PeriodSheetConfig,
  supplements: readonly { key: string; label: string }[]
): PeriodSheetConfig {
  const seen = new Set<string>()
  const extra: PeriodColumn[] = []
  for (const s of supplements) {
    if (!s.key || seen.has(s.key)) continue
    seen.add(s.key)
    for (const suffix of ['eur', 'non_eur'] as const) {
      extra.push({ label: supplementHeader(s.key, s.label || s.key, suffix), field: supplementField(s.key, suffix) })
    }
  }
  return { ...config, columns: [...config.columns, ...extra] }
}

/** Columns before the rate numbers: which rate this is, and which window. */
const commonColumns = (keyLabel: string, nameLabel: string): PeriodColumn[] => [
  { label: keyLabel, field: 'key' },
  { label: nameLabel, field: 'display_name' },
  { label: 'Period Name', field: 'name' },
  { label: 'From', field: 'from' },
  { label: 'To', field: 'to' },
]

const RATE_LABELS: Record<string, string> = {
  pp_double_eur: 'PP Double (EU passport)',
  single_supp_eur: 'Single Supp (EU passport)',
  triple_red_eur: 'Triple Red (EU passport)',
  pp_double_non_eur: 'PP Double (non-EU passport)',
  single_supp_non_eur: 'Single Supp (non-EU passport)',
  triple_red_non_eur: 'Triple Red (non-EU passport)',
  single_eur: 'Single (EU passport)',
  double_eur: 'Double (EU passport)',
  triple_eur: 'Triple (EU passport)',
  suite_eur: 'Suite (EU passport)',
  single_non_eur: 'Single (non-EU passport)',
  double_non_eur: 'Double (non-EU passport)',
  triple_non_eur: 'Triple (non-EU passport)',
  suite_non_eur: 'Suite (non-EU passport)',
  // The property's special per-night rate for a throughout guide ("+1") —
  // one number, no passport split. Blank prices as a hole, never a free bed.
  guide_rate: 'Guide Bed / Night',
}

export interface PeriodSheetConfig {
  entity: RateSeasonEntity
  table: 'accommodation_rates' | 'nile_cruises'
  /** The column that identifies the rate — the same key the wide CSV upserts on. */
  keyColumn: 'service_code' | 'cruise_code'
  /** Column carrying the human-readable name, for the operator's eye only. */
  displayColumn: 'property_name' | 'ship_name'
  columns: PeriodColumn[]
}

export const PERIOD_SHEETS: Record<RateSeasonEntity, PeriodSheetConfig> = {
  accommodation: {
    entity: 'accommodation',
    table: 'accommodation_rates',
    keyColumn: 'service_code',
    displayColumn: 'property_name',
    columns: [
      ...commonColumns('Service Code', 'Property Name'),
      ...RATE_FIELDS.accommodation.map(f => ({ label: RATE_LABELS[f], field: f })),
    ],
  },
  cruise: {
    entity: 'cruise',
    table: 'nile_cruises',
    keyColumn: 'cruise_code',
    displayColumn: 'ship_name',
    columns: [
      ...commonColumns('Cruise Code', 'Ship Name'),
      ...RATE_FIELDS.cruise.map(f => ({ label: RATE_LABELS[f], field: f })),
    ],
  },
}

export const periodHeaders = (config: PeriodSheetConfig): string[] =>
  config.columns.map(c => c.label)

/** One CSV row per period, for export. */
export function periodsToRows(
  config: PeriodSheetConfig,
  rate: { key: string; displayName: string; seasons: RateSeason[] }
): Record<string, string | number>[] {
  return rate.seasons.map(season => {
    const row: Record<string, string | number> = {}
    for (const col of config.columns) {
      if (col.field === 'key') row[col.label] = rate.key
      else if (col.field === 'display_name') row[col.label] = rate.displayName
      else if (col.field === 'name') row[col.label] = season.name
      else if (col.field === 'from') row[col.label] = season.from
      else if (col.field === 'to') row[col.label] = season.to
      else row[col.label] = season.rates[col.field] ?? 0
    }
    return row
  })
}

/** The sample row for a periods sheet. Same reasoning as the wide template:
 *  with no rate carrying periods yet, an export is headers and nothing else,
 *  and the date format is left to guesswork. The key is the sentinel the
 *  import refuses, so filling the sheet in underneath it cannot land a rate
 *  called EXAMPLE-DELETE-THIS-ROW. */
export const PERIOD_EXAMPLE_KEY = 'EXAMPLE-DELETE-THIS-ROW'

export function periodTemplateRows(config: PeriodSheetConfig): Record<string, string | number>[] {
  const example = (name: string, from: string, to: string, base: number) => {
    const row: Record<string, string | number> = {}
    for (const col of config.columns) {
      if (col.field === 'key') row[col.label] = PERIOD_EXAMPLE_KEY
      else if (col.field === 'display_name') row[col.label] = 'Example Name'
      else if (col.field === 'name') row[col.label] = name
      else if (col.field === 'from') row[col.label] = from
      else if (col.field === 'to') row[col.label] = to
      // Supplements and reductions are smaller than the headline rate; a
      // sample where every number is identical teaches nothing about which
      // column is which.
      else if (/supp|red/.test(col.field)) row[col.label] = Math.round(base / 2)
      else row[col.label] = base
    }
    return row
  }
  // Two rows, because one row does not show that periods REPEAT per rate —
  // which is the whole point of this sheet.
  return [
    example('Summer', '2026-05-01', '2026-09-30', 100),
    example('Christmas', '2026-12-20', '2027-01-05', 180),
  ]
}

/** ISO through untouched; DD/MM/YYYY normalised. Anything else is refused —
 *  a date the database would reject is better caught here, by row number. */
export function parseSheetDate(raw: unknown): string | null {
  const value = String(raw ?? '').trim()
  if (!value) return null
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return null
}

export interface PeriodRowError {
  row: number
  key: string
  message: string
}

export interface ParsedPeriodSheet {
  /** rate key → the period list that key should end up with. */
  byKey: Map<string, RateSeason[]>
  errors: PeriodRowError[]
  /** Unedited sample rows left out rather than treated as a missing rate. */
  exampleRows: number
  /** Whether the file carried any supplement column at all. False = an
   *  older sheet; the importer leaves every rate's supplement list alone. */
  hasSupplementColumns: boolean
  /** rate key → the supplements it carries per this file: every key priced
   *  in at least one of its periods, named by the header's word. */
  supplementsByKey: Map<string, RateSupplement[]>
}

const num = (raw: unknown): number => {
  if (raw === null || raw === undefined || String(raw).trim() === '') return 0
  // Rate sheets arrive with thousands separators and currency symbols.
  const n = Number(String(raw).replace(/[,\s$€£¥]/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * Turn parsed CSV rows into a period list per rate.
 *
 * Row numbers in errors are 1-based and count the header, so they match what
 * the operator sees in the spreadsheet.
 */
export function parsePeriodRows(
  config: PeriodSheetConfig,
  rows: Record<string, unknown>[]
): ParsedPeriodSheet {
  const byKey = new Map<string, RateSeason[]>()
  const errors: PeriodRowError[] = []
  let exampleRows = 0
  // Supplement columns are read off the FILE's headers, not the config: the
  // key in the header is what identifies them, whatever the word beside it.
  const supplementColumns = new Map<string, SupplementColumnMeta>()
  for (const raw of rows) {
    for (const header of Object.keys(raw)) {
      if (supplementColumns.has(header)) continue
      const meta = parseSupplementHeader(header)
      if (meta) supplementColumns.set(header, meta)
    }
  }
  const supplementsByKey = new Map<string, RateSupplement[]>()
  const keyLabel = config.columns[0].label
  const nameLabel = config.columns[2].label
  const fromLabel = config.columns[3].label
  const toLabel = config.columns[4].label

  rows.forEach((raw, index) => {
    const line = index + 2 // header is row 1
    const key = String(raw[keyLabel] ?? '').trim()
    if (!key) {
      errors.push({ row: line, key: '', message: `${keyLabel} is required` })
      return
    }
    // The untouched sample row from a downloaded template. Skipped silently
    // here and reported by the route, so filling the sheet in underneath it
    // cannot try to load periods onto a rate that does not exist.
    if (key.toUpperCase() === PERIOD_EXAMPLE_KEY) {
      exampleRows++
      return
    }

    const from = parseSheetDate(raw[fromLabel])
    const to = parseSheetDate(raw[toLabel])
    if (!from || !to) {
      errors.push({ row: line, key, message: `${fromLabel} and ${toLabel} must both be dates (YYYY-MM-DD or DD/MM/YYYY)` })
      return
    }
    if (to < from) {
      errors.push({ row: line, key, message: `${toLabel} is before ${fromLabel}` })
      return
    }

    const rates: Record<string, number> = {}
    for (const field of RATE_FIELDS[config.entity]) {
      const col = config.columns.find(c => c.field === field)
      rates[field] = num(col ? raw[col.label] : 0)
    }
    for (const [header, meta] of supplementColumns) {
      const field = supplementField(meta.key, meta.suffix)
      if (!SUPPLEMENT_FIELD.test(field)) continue
      const value = num(raw[header])
      rates[field] = value
      if (value > 0) {
        const carried = supplementsByKey.get(key) ?? []
        if (!carried.some(c => c.key === meta.key)) carried.push({ key: meta.key, name: meta.label.slice(0, 80) })
        supplementsByKey.set(key, carried)
      }
    }

    const name = String(raw[nameLabel] ?? '').trim().slice(0, 80) || `${from} – ${to}`
    const list = byKey.get(key) ?? []
    list.push({ name, from, to, rates })
    byKey.set(key, list)
  })

  // Sort each rate's periods by start date, so the file's row order never
  // decides anything.
  for (const [, list] of byKey) {
    list.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
  }

  return { byKey, errors, exampleRows, hasSupplementColumns: supplementColumns.size > 0, supplementsByKey }
}
