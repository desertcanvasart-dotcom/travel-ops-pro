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

import { RATE_FIELDS, type RateSeason, type RateSeasonEntity } from '@/lib/rates/rate-seasons'

export interface PeriodColumn {
  /** Header text in the file. */
  label: string
  /** Where it lands: the rate key, a period property, or a rate field. */
  field: string
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

  return { byKey, errors, exampleRows }
}
