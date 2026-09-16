import { describe, it, expect } from 'vitest'
import {
  PERIOD_SHEETS,
  periodHeaders,
  periodsToRows,
  parsePeriodRows,
  parseSheetDate,
  periodTemplateRows,
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
  it('leads with the key, the name, the season word and the window', () => {
    expect(periodHeaders(HOTEL).slice(0, 6))
      .toEqual(['Service Code', 'Property Name', 'Period Name', 'Season', 'From', 'To'])
    expect(periodHeaders(CRUISE).slice(0, 6))
      .toEqual(['Cruise Code', 'Ship Name', 'Period Name', 'Season', 'From', 'To'])
  })

  it('carries every rate field for its catalog', () => {
    // +1 on each: the throughout-guide bed rate (2026-09-04).
    expect(periodHeaders(HOTEL)).toHaveLength(6 + 7)
    expect(periodHeaders(CRUISE)).toHaveLength(6 + 9)
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

  it('refuses a rate with a bad row WHOLE — never replaces its periods with the rows that parsed', () => {
    const { byKey, errors } = parsePeriodRows(HOTEL, [row(), row({ To: 'nonsense' })])
    expect(byKey.has('ACC-1')).toBe(false)
    expect(errors).toHaveLength(1)
  })

  it('a bad row for one rate does not stop another rate loading', () => {
    const { byKey, errors } = parsePeriodRows(HOTEL, [
      row({ To: 'nonsense' }),
      row({ 'Service Code': 'ACC-2' }),
    ])
    expect(byKey.has('ACC-1')).toBe(false)
    expect(byKey.get('ACC-2')).toHaveLength(1)
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

// ── Supplements (2026-09-13) ────────────────────────────────────────────
// The agency's supplements are two more columns per supplement, keyed in
// the header so a renamed word or another installation's sheet still lands.
import { withSupplementColumns, supplementHeader, parseSupplementHeader } from '@/lib/rates/period-csv'

describe('supplement columns', () => {
  const VOCAB = [{ key: 'view_nile', label: 'Nile View' }, { key: 'half_board', label: 'Half Board (HB)' }]
  const SHEET = withSupplementColumns(HOTEL, VOCAB)

  it('adds a pair of columns per supplement, after the fixed rates, and never duplicates a key', () => {
    const headers = periodHeaders(SHEET)
    expect(headers).toHaveLength(periodHeaders(HOTEL).length + 4)
    expect(headers.slice(-4)).toEqual([
      'Supplement: Nile View [view_nile] (EU passport)',
      'Supplement: Nile View [view_nile] (non-EU passport)',
      'Supplement: Half Board (HB) [half_board] (EU passport)',
      'Supplement: Half Board (HB) [half_board] (non-EU passport)',
    ])
    expect(periodHeaders(withSupplementColumns(HOTEL, [...VOCAB, VOCAB[0]]))).toHaveLength(headers.length)
  })

  it('reads a header by its key, whatever the word beside it', () => {
    expect(parseSupplementHeader('Supplement: Vista del Nilo [view_nile] (non-EU passport)'))
      .toEqual({ key: 'view_nile', label: 'Vista del Nilo', suffix: 'non_eur' })
    expect(parseSupplementHeader(supplementHeader('upper_deck', 'Upper Deck', 'eur')))
      .toEqual({ key: 'upper_deck', label: 'Upper Deck', suffix: 'eur' })
    expect(parseSupplementHeader('PP Double (EU passport)')).toBeNull()
    expect(parseSupplementHeader('Supplement: Bad [Not A Key] (EU passport)')).toBeNull()
  })

  it('round-trips supplement prices and derives which supplements each rate carries', () => {
    const seasons = [
      { name: 'Summer', from: '2026-05-01', to: '2026-09-30',
        rates: { pp_double_eur: 55, single_supp_eur: 0, triple_red_eur: 0, pp_double_non_eur: 50, single_supp_non_eur: 0, triple_red_non_eur: 0, guide_rate: 0,
                 'supp:view_nile:eur': 15, 'supp:view_nile:non_eur': 18, 'supp:half_board:eur': 0, 'supp:half_board:non_eur': 0 } },
      { name: 'Christmas', from: '2026-12-20', to: '2027-01-05',
        rates: { pp_double_eur: 140, single_supp_eur: 0, triple_red_eur: 0, pp_double_non_eur: 135, single_supp_non_eur: 0, triple_red_non_eur: 0, guide_rate: 0,
                 'supp:view_nile:eur': 25, 'supp:view_nile:non_eur': 30, 'supp:half_board:eur': 0, 'supp:half_board:non_eur': 0 } },
    ]
    const rows = periodsToRows(SHEET, { key: 'ACC-1', displayName: 'Steigenberger', seasons })
    expect(rows[0]['Supplement: Nile View [view_nile] (EU passport)']).toBe(15)

    const parsed = parsePeriodRows(HOTEL, rows as Record<string, unknown>[])   // base config: columns come from the FILE
    expect(parsed.errors).toEqual([])
    expect(parsed.hasSupplementColumns).toBe(true)
    expect(parsed.byKey.get('ACC-1')).toEqual(seasons)
    // Priced somewhere → carried; blank everywhere → not.
    expect(parsed.supplementsByKey.get('ACC-1')).toEqual([{ key: 'view_nile', name: 'Nile View' }])
  })

  it('an older sheet with no supplement columns says so, and touches nothing', () => {
    const rows = periodsToRows(HOTEL, { key: 'ACC-1', displayName: 'X', seasons: [
      { name: 'All', from: '2026-01-01', to: '2026-12-31', rates: { pp_double_eur: 50 } },
    ] })
    const parsed = parsePeriodRows(HOTEL, rows as Record<string, unknown>[])
    expect(parsed.hasSupplementColumns).toBe(false)
    expect(parsed.supplementsByKey.size).toBe(0)
  })

  it('the sample rows carry supplement figures too, smaller than the headline', () => {
    const [summer] = periodTemplateRows(SHEET)
    expect(summer['Supplement: Nile View [view_nile] (EU passport)']).toBe(50)
  })
})

// The agency's season word (Settings → Vocabulary → Rate seasons) and the
// six-period limit (operator, 2026-09-16).
describe('season words and the period limit', () => {
  const row = (key: string, from: string, to: string, season = '') => ({
    'Service Code': key, 'Property Name': 'X', 'Period Name': '', Season: season, From: from, To: to,
    'PP Double (EU passport)': '100', 'PP Double (non-EU passport)': '110',
  })
  const vocab = [{ key: 'high_season', label: 'High Season' }, { key: 'christmas', label: 'Christmas' }]
  const keyFor = (cell: string) =>
    vocab.find(v => v.key === cell.toLowerCase() || v.label.toLowerCase() === cell.toLowerCase())?.key ?? null

  it('reads the Season cell by the agency word or the key, and exports the word back', () => {
    const out = parsePeriodRows(HOTEL, [
      row('H1', '2026-10-01', '2026-12-19', 'high season'),
      row('H1', '2026-12-20', '2027-01-05', 'christmas'),
    ], keyFor)
    expect(out.errors).toEqual([])
    const periods = out.byKey.get('H1')!
    expect(periods.map(p => p.season)).toEqual(['high_season', 'christmas'])
    // A season word stands on its own — no invented "from – to" name.
    expect(periods[0].name).toBe('')
    const exported = periodsToRows(HOTEL, { key: 'H1', displayName: 'X', seasons: periods }, k => vocab.find(v => v.key === k)!.label)
    expect(exported.map(r => r.Season)).toEqual(['High Season', 'Christmas'])
  })

  it('refuses a Season word that is not in the list, by row', () => {
    const out = parsePeriodRows(HOTEL, [row('H1', '2026-10-01', '2026-12-19', 'Monsoon')], keyFor)
    expect(out.byKey.size).toBe(0)
    expect(out.errors[0]).toMatchObject({ row: 2, key: 'H1' })
    expect(out.errors[0].message).toMatch(/Monsoon/)
  })

  it('a blank Season cell, or an older sheet with no Season column, is simply no word', () => {
    const out = parsePeriodRows(HOTEL, [row('H1', '2026-10-01', '2026-12-19')], keyFor)
    expect(out.byKey.get('H1')![0].season).toBeUndefined()
  })

  it('refuses a rate with more than six periods WHOLE — never loads the first six', () => {
    const seven = Array.from({ length: 7 }, (_, i) => row('H7', `2026-0${i + 1}-01`, `2026-0${i + 1}-20`))
    const six = Array.from({ length: 6 }, (_, i) => row('H6', `2026-0${i + 1}-01`, `2026-0${i + 1}-20`))
    const out = parsePeriodRows(HOTEL, [...seven, ...six], keyFor)
    expect(out.byKey.has('H7')).toBe(false)
    expect(out.byKey.get('H6')).toHaveLength(6)
    expect(out.errors.some(e => e.key === 'H7' && /at most 6/.test(e.message))).toBe(true)
  })
})
