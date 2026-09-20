// Reported from the live app, 2026-09-20. Importing NEW cruises from the CSV
// failed with the database's own words:
//
//   null value in column "cabin_type" of relation "nile_cruises"
//   violates not-null constraint
//
// A cruise rate is one cabin type on one ship; the Add form has always asked
// for it and the column is NOT NULL. The sheet never carried it — and adding a
// cabin_type column to the file by hand changed nothing, because a header the
// sheet does not know is ignored.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { RATE_TABLE_CONFIGS, getTemplateHeaders, validateImportData } from '@/lib/bulk-rate-service'
import { vocabularyColumnsFor } from '@/lib/vocabulary'

const config = RATE_TABLE_CONFIGS.nile_cruises
const row = (over: Record<string, string> = {}): Record<string, string> => ({
  cruise_code: 'NC-100', ship_name: 'MS Farah', ship_category: 'luxury',
  route_name: 'Luxor–Aswan', embark_city: 'Luxor', disembark_city: 'Aswan',
  duration_nights: '4', cabin_type: 'standard', ...over,
})

describe('the cruise sheet', () => {
  it('carries Cabin Type, and requires it', () => {
    const col = config.columns.find(c => c.name === 'cabin_type')
    expect(col?.required).toBe(true)
    expect(getTemplateHeaders(config)).toContain('cabin_type')
  })

  it('takes a cruise that names its cabin', () => {
    const result = validateImportData([row()], config)
    expect(result.errors).toEqual([])
  })

  it('refuses a cruise with no cabin in the SHEET\'s words, on its row — not the database\'s', () => {
    const result = validateImportData([row({ cabin_type: '' })], config)
    const text = JSON.stringify(result.errors)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(text).toMatch(/Cabin Type/)
    expect(text).not.toMatch(/not-null constraint/)
  })
})

describe('what "cabin type" means depends on the table', () => {
  it('a cruise cabin on cruises', () => {
    expect(vocabularyColumnsFor('nile_cruises').cabin_type).toBe('cruise_cabin')
  })

  it('still a sleeping-train cabin everywhere else', () => {
    expect(vocabularyColumnsFor('sleeping_train_rates').cabin_type).toBe('sleeper_cabin')
  })
})

describe('the two columns that were waiting behind it', () => {
  // Postgres reports only the FIRST not-null violation. rate_single_eur and
  // rate_double_eur mirror the first dated period, and a cruise arrives before
  // its periods — so with the cabin fixed, the same import would have failed
  // again one column along.
  const sql = readFileSync(join(process.cwd(), 'migrations/20261030_cruise_base_rates_nullable.sql'), 'utf8')

  it('may be empty until the periods arrive', () => {
    expect(sql).toMatch(/ALTER COLUMN rate_single_eur DROP NOT NULL/)
    expect(sql).toMatch(/ALTER COLUMN rate_double_eur DROP NOT NULL/)
  })

  it('are not on the sheet — a cruise prices from its periods', () => {
    const names = config.columns.map(c => c.name)
    expect(names).not.toContain('rate_single_eur')
    expect(names).not.toContain('rate_double_eur')
  })

  it('and are never defaulted to 0, which would be a price', () => {
    expect(sql.replace(/^--.*$/gm, '')).not.toMatch(/SET DEFAULT/i)
  })
})
