import { describe, it, expect } from 'vitest'
import {
  PERIOD_SHEETS,
  periodHeaders,
  periodsToRows,
  parsePeriodRows,
  parseSheetDate,
} from '@/lib/rates/period-csv'

// The wide rate CSV has fixed columns for three seasons, so a six-period
// contract could not be imported. This sheet is one row per period — the shape
// a contract's rate table already has.

const HOTEL = PERIOD_SHEETS.accommodation
const CRUISE = PERIOD_SHEETS.cruise

describe('parseSheetDate', () => {
  it('passes ISO through', () => {
    expect(parseSheetDate('2026-05-01')).toBe('2026-05-01')
    expect(parseSheetDate('2026-05-01T00:00:00Z')).toBe('2026-05-01')
  })

  it('normalises the DD/MM/YYYY that Excel writes', () => {
    // A real production import once failed because Excel rewrote ISO dates on
    // save and the database rejected "23/06/2026".
    expect(parseSheetDate('23/06/2026')).toBe('2026-06-23')
    expect(parseSheetDate('1/6/2026')).toBe('2026-06-01')
  })

  it('refuses anything else rather than passing a date the database rejects', () => {
    expect(parseSheetDate('June 2026')).toBeNull()
    expect(parseSheetDate('')).toBeNull()
    expect(parseSheetDate(null)).toBeNull()
  })
})

describe('the sheet shape', () => {
  it('leads with the key, the name and the window', () => {
    expect(periodHeaders(HOTEL).slice(0, 5))
      .toEqual(['Service Code', 'Property Name', 'Period Name', 'From', 'To'])
    expect(periodHeaders(CRUISE).slice(0, 5))
      .toEqual(['Cruise Code', 'Ship Name', 'Period Name', 'From', 'To'])
  })

  it('carries every rate field for its catalog', () => {
    // +1 on each: the throughout-guide bed rate (2026-09-04).
    expect(periodHeaders(HOTEL)).toHaveLength(5 + 7)
    expect(periodHeaders(CRUISE)).toHaveLength(5 + 9)
    expect(periodHeaders(CRUISE)).toContain('Suite (non-EU passport)')
    expect(periodHeaders(HOTEL)).toContain('Guide Bed / Night')
    expect(periodHeaders(CRUISE)).toContain('Guide Bed / Night')
  })

  it('round-trips: export then import gives the same periods back', () => {
    const seasons = [
      { name: 'Summer', from: '2026-05-01', to: '2026-09-30',
        rates: { pp_double_eur: 55, single_supp_eur: 28, triple_red_eur: 5,
                 pp_double_non_eur: 50, single_supp_non_eur: 25, triple_red_non_eur: 5, guide_rate: 0 } },
      { name: 'Christmas', from: '2026-12-20', to: '2027-01-05',
        rates: { pp_double_eur: 140, single_supp_eur: 75, triple_red_eur: 10,
                 pp_double_non_eur: 135, single_supp_non_eur: 72, triple_red_non_eur: 10, guide_rate: 0 } },
    ]
    const rows = periodsToRows(HOTEL, { key: 'ACC-1', displayName: 'Steigenberger', seasons })
    expect(rows).toHaveLength(2)

    const { byKey, errors } = parsePeriodRows(HOTEL, rows as Record<string, unknown>[])
    expect(errors).toEqual([])
    expect(byKey.get('ACC-1')).toEqual(seasons)
  })
})

describe('parsePeriodRows', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    'Service Code': 'ACC-1',
    'Property Name': 'Steigenberger',
    'Period Name': 'Summer',
    From: '2026-05-01',
    To: '2026-09-30',
    'PP Double (EU passport)': '55',
    'Single Supp (EU passport)': '28',
    'Triple Red (EU passport)': '5',
    'PP Double (non-EU passport)': '50',
    'Single Supp (non-EU passport)': '25',
    'Triple Red (non-EU passport)': '5',
    ...over,
  })

  it('groups many rows under one rate — the whole point of the sheet', () => {
    const { byKey, errors } = parsePeriodRows(HOTEL, [
      row({ 'Period Name': 'April', From: '2026-04-01', To: '2026-04-30' }),
      row(),
      row({ 'Period Name': 'Autumn', From: '2026-10-01', To: '2026-12-19' }),
      row({ 'Period Name': 'Christmas', From: '2026-12-20', To: '2027-01-05' }),
      row({ 'Period Name': 'Winter', From: '2027-01-06', To: '2027-02-28' }),
      row({ 'Period Name': 'Spring', From: '2027-03-01', To: '2027-03-31' }),
    ])
    expect(errors).toEqual([])
    expect(byKey.get('ACC-1')).toHaveLength(6)
  })

  it('keeps different rates apart', () => {
    const { byKey } = parsePeriodRows(HOTEL, [
      row(),
      row({ 'Service Code': 'ACC-2', 'Property Name': 'Nile Palace' }),
    ])
    expect([...byKey.keys()].sort()).toEqual(['ACC-1', 'ACC-2'])
    expect(byKey.get('ACC-2')).toHaveLength(1)
  })

  it('sorts by start date, so row order in the file decides nothing', () => {
    const { byKey } = parsePeriodRows(HOTEL, [
      row({ 'Period Name': 'Later', From: '2026-10-01', To: '2026-12-19' }),
      row({ 'Period Name': 'Earlier', From: '2026-04-01', To: '2026-04-30' }),
    ])
    expect(byKey.get('ACC-1')!.map(s => s.name)).toEqual(['Earlier', 'Later'])
  })

  it('reports the spreadsheet row number the operator can see', () => {
    const { errors } = parsePeriodRows(HOTEL, [row(), row({ From: 'June' })])
    // Header is row 1, so the second data row is row 3.
    expect(errors).toEqual([
      { row: 3, key: 'ACC-1', message: expect.stringContaining('must both be dates') },
    ])
  })

  it('refuses a row with no key rather than inventing one', () => {
    const { errors, byKey } = parsePeriodRows(HOTEL, [row({ 'Service Code': '  ' })])
    expect(byKey.size).toBe(0)
    expect(errors[0].message).toContain('Service Code is required')
  })

  it('refuses a backwards window', () => {
    const { errors } = parsePeriodRows(HOTEL, [row({ From: '2026-09-30', To: '2026-05-01' })])
    expect(errors[0].message).toContain('is before')
  })

  it('drops a bad row without losing the good ones', () => {
    const { byKey, errors } = parsePeriodRows(HOTEL, [row(), row({ To: 'nonsense' })])
    expect(byKey.get('ACC-1')).toHaveLength(1)
    expect(errors).toHaveLength(1)
  })

  it('reads the numbers rate sheets actually contain', () => {
    const { byKey } = parsePeriodRows(HOTEL, [row({ 'PP Double (EU passport)': ' 1,250 ' })])
    expect(byKey.get('ACC-1')![0].rates.pp_double_eur).toBe(1250)
  })

  it('treats a blank rate as zero, not as a parse failure', () => {
    const { byKey, errors } = parsePeriodRows(HOTEL, [row({ 'Triple Red (EU passport)': '' })])
    expect(errors).toEqual([])
    expect(byKey.get('ACC-1')![0].rates.triple_red_eur).toBe(0)
  })

  it('names an unnamed period after its window', () => {
    const { byKey } = parsePeriodRows(HOTEL, [row({ 'Period Name': '' })])
    expect(byKey.get('ACC-1')![0].name).toBe('2026-05-01 – 2026-09-30')
  })

  it('handles the cruise sheet with its four cabin types', () => {
    const { byKey, errors } = parsePeriodRows(CRUISE, [{
      'Cruise Code': 'CR-1', 'Ship Name': 'MS Sonesta',
      'Period Name': 'High', From: '01/10/2026', To: '19/12/2026',
      'Single (EU passport)': '160', 'Double (EU passport)': '130',
      'Triple (EU passport)': '115', 'Suite (EU passport)': '240',
      'Single (non-EU passport)': '155', 'Double (non-EU passport)': '125',
      'Triple (non-EU passport)': '110', 'Suite (non-EU passport)': '235',
    }])
    expect(errors).toEqual([])
    expect(byKey.get('CR-1')![0]).toEqual({
      name: 'High', from: '2026-10-01', to: '2026-12-19',
      rates: { single_eur: 160, double_eur: 130, triple_eur: 115, suite_eur: 240,
               single_non_eur: 155, double_non_eur: 125, triple_non_eur: 110, suite_non_eur: 235, guide_rate: 0 },
    })
  })
})
