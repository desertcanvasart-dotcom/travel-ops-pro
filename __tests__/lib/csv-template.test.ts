import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import {
  RATE_TABLE_CONFIGS,
  getExportHeaders,
  getTemplateHeaders,
  buildTemplateRow,
  isExampleRow,
  EXAMPLE_ROW_KEY,
  validateImportData,
} from '@/lib/bulk-rate-service'
import { PERIOD_SHEETS, periodHeaders, periodTemplateRows, parsePeriodRows } from '@/lib/rates/period-csv'

// Exporting an EMPTY rate table produced a completely blank file — Papa
// returns "" for zero rows, headers and all — so the one moment somebody most
// needs the column names (their first import, before any data exists) was the
// moment the system gave them nothing.

describe('an export of an empty table', () => {
  it('still carries the headers', () => {
    // The bug, pinned: unparse(rows, { columns }) drops everything when rows
    // is empty. The { fields, data } form does not.
    expect(Papa.unparse([], { columns: ['a', 'b'] })).toBe('')
    expect(Papa.unparse({ fields: ['a', 'b'], data: [] }).trim()).toBe('a,b')
  })
})

describe('the sample CSV', () => {
  const tables = Object.keys(RATE_TABLE_CONFIGS)

  it('exists for every rate table', () => {
    expect(tables.length).toBeGreaterThan(10)
    for (const name of tables) {
      const config = RATE_TABLE_CONFIGS[name]
      expect(getTemplateHeaders(config).length, name).toBeGreaterThan(0)
      expect(Object.keys(buildTemplateRow(config)).length, name).toBeGreaterThan(0)
    }
  })

  it('leaves out the columns the importer ignores', () => {
    const config = RATE_TABLE_CONFIGS.accommodation_rates
    // id/created_at/updated_at are export-only; a sheet somebody fills in by
    // hand should not invite them to.
    expect(getExportHeaders(config)).toContain('created_at')
    expect(getTemplateHeaders(config)).not.toContain('created_at')
    expect(getTemplateHeaders(config)).not.toContain('id')
  })

  it('fills every required column, so the sample itself would validate', () => {
    for (const name of tables) {
      const config = RATE_TABLE_CONFIGS[name]
      const row = buildTemplateRow(config)
      for (const colDef of config.columns.filter(c => c.required && !c.exportOnly)) {
        expect(String(row[colDef.name] ?? '').trim(), `${name}.${colDef.name}`).not.toBe('')
      }
    }
  })

  it('uses a valid option wherever a column is an enum', () => {
    for (const name of tables) {
      const config = RATE_TABLE_CONFIGS[name]
      const row = buildTemplateRow(config)
      for (const colDef of config.columns.filter(c => c.allowedValues?.length)) {
        expect(colDef.allowedValues, `${name}.${colDef.name}`).toContain(row[colDef.name])
      }
    }
  })

  it('shows an ISO date rather than leaving the format to guesswork', () => {
    const row = buildTemplateRow(RATE_TABLE_CONFIGS.accommodation_rates)
    expect(row.low_season_from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('gives each season its own window, not the same day everywhere', () => {
    // A template whose every date is identical does not show which column is a
    // start and which an end, nor that the seasons are different windows.
    const r = buildTemplateRow(RATE_TABLE_CONFIGS.accommodation_rates)
    expect(r.low_season_from).toBe('2026-05-01')
    expect(r.low_season_to).toBe('2026-09-30')
    expect(r.high_season_from).toBe('2026-10-01')
    expect(r.peak_season_from).toBe('2026-12-20')
    expect(r.peak_season_2_from).toBe('2027-03-20')
    // Every window runs forwards.
    for (const [from, to] of [
      [r.low_season_from, r.low_season_to],
      [r.high_season_from, r.high_season_to],
      [r.peak_season_from, r.peak_season_to],
      [r.peak_season_2_from, r.peak_season_2_to],
      [r.rate_valid_from, r.rate_valid_to],
    ]) {
      expect(to > from, `${from}..${to}`).toBe(true)
    }
  })

  it('reads like a rate card: peak above high above low, supplements below both', () => {
    const r = buildTemplateRow(RATE_TABLE_CONFIGS.accommodation_rates)
    expect(Number(r.peak_pp_double_eur)).toBeGreaterThan(Number(r.high_pp_double_eur))
    expect(Number(r.high_pp_double_eur)).toBeGreaterThan(Number(r.pp_double_eur))
    expect(Number(r.single_supp_eur)).toBeLessThan(Number(r.pp_double_eur))
    expect(Number(r.triple_red_eur)).toBeLessThan(Number(r.single_supp_eur))
  })

  it('never suggests a zero rate — a blank or zero price means unpriced here', () => {
    const row = buildTemplateRow(RATE_TABLE_CONFIGS.accommodation_rates)
    expect(Number(row.pp_double_eur)).toBeGreaterThan(0)
  })

  it('passes the importer\'s own validation', () => {
    // If the sample cannot validate, it is not a sample, it is a trap.
    const config = RATE_TABLE_CONFIGS.accommodation_rates
    const preview = validateImportData([buildTemplateRow(config)], config)
    expect(preview.errors).toEqual([])
    expect(preview.validRows).toBe(1)
  })

  it('marks its own row so an unedited sample cannot be imported', () => {
    const row = buildTemplateRow(RATE_TABLE_CONFIGS.accommodation_rates)
    expect(row.service_code).toBe(EXAMPLE_ROW_KEY)
    expect(isExampleRow(row.service_code)).toBe(true)
    expect(isExampleRow('  example-delete-this-row ')).toBe(true)
    expect(isExampleRow('ACC-001')).toBe(false)
    expect(isExampleRow('')).toBe(false)
    expect(isExampleRow(undefined)).toBe(false)
  })
})

describe('the sample periods sheet', () => {
  it('shows two periods, because one would not show that they repeat', () => {
    const rows = periodTemplateRows(PERIOD_SHEETS.accommodation)
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r['Service Code'])).toEqual([EXAMPLE_ROW_KEY, EXAMPLE_ROW_KEY])
  })

  it('covers every column of the sheet', () => {
    for (const entity of ['accommodation', 'cruise'] as const) {
      const config = PERIOD_SHEETS[entity]
      for (const row of periodTemplateRows(config)) {
        expect(Object.keys(row).sort(), entity).toEqual([...periodHeaders(config)].sort())
      }
    }
  })

  it('distinguishes the headline rate from supplements', () => {
    // A sample where every number is identical teaches nothing about which
    // column is which.
    const [summer] = periodTemplateRows(PERIOD_SHEETS.accommodation)
    expect(Number(summer['PP Double (EU passport)']))
      .toBeGreaterThan(Number(summer['Single Supp (EU passport)']))
  })

  it('is refused by the importer while it still says EXAMPLE', () => {
    const config = PERIOD_SHEETS.accommodation
    const parsed = parsePeriodRows(config, periodTemplateRows(config) as Record<string, unknown>[])
    expect(parsed.byKey.size).toBe(0)
    expect(parsed.exampleRows).toBe(2)
    expect(parsed.errors).toEqual([])
  })

  it('accepts the same rows once the code is replaced with a real one', () => {
    const config = PERIOD_SHEETS.accommodation
    const rows = periodTemplateRows(config).map(r => ({ ...r, 'Service Code': 'ACC-1' }))
    const parsed = parsePeriodRows(config, rows as Record<string, unknown>[])
    expect(parsed.byKey.get('ACC-1')).toHaveLength(2)
    expect(parsed.exampleRows).toBe(0)
  })
})
