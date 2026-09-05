import { describe, it, expect } from 'vitest'
import { hotelPpDouble, hotelPpDoubleRange } from '@/lib/rates/hotel-display-rate'

// The rates hub's hotel price. Every accommodation_rates row saved by the
// current editor has NULL base_rate columns and its price on `seasons` —
// the hub read the nulls and showed hotels with no price (reported
// 2026-09-04). These rows are shaped like the live ones.

const seasonRow = (from: string, to: string, ppEur: number, ppNonEur: number) => ({
  name: `${from} – ${to}`,
  from,
  to,
  rates: {
    pp_double_eur: ppEur, single_supp_eur: 10, triple_red_eur: 5,
    pp_double_non_eur: ppNonEur, single_supp_non_eur: 10, triple_red_non_eur: 5,
  },
})

describe('hotelPpDouble', () => {
  it('reads the period covering today off a live-shaped row with null base columns', () => {
    const today = new Date()
    const y = today.getFullYear()
    const row = {
      property_name: 'Seti Abu Simbel Lake Resort',
      base_rate_eur: null,
      base_rate_non_eur: null,
      seasons: [seasonRow(`${y}-01-01`, `${y}-12-31`, 140, 150)],
    }
    expect(hotelPpDouble(row)).toEqual({ eur: 140, nonEur: 150 })
  })

  it('falls back to the FIRST period when none covers today (mirror semantics)', () => {
    const row = {
      base_rate_eur: null,
      base_rate_non_eur: null,
      seasons: [seasonRow('2020-01-01', '2020-03-31', 80, 90), seasonRow('2020-06-01', '2020-08-31', 120, 130)],
    }
    expect(hotelPpDouble(row)).toEqual({ eur: 80, nonEur: 90 })
  })

  it('a row with no periods at all falls back to its columns, and blanks stay 0 — never invented', () => {
    expect(hotelPpDouble({ pp_double_eur: 70, pp_double_non_eur: 75 })).toEqual({ eur: 70, nonEur: 75 })
    expect(hotelPpDouble({ base_rate_eur: 60, base_rate_non_eur: 65 })).toEqual({ eur: 60, nonEur: 65 })
    expect(hotelPpDouble({ base_rate_eur: null, base_rate_non_eur: null })).toEqual({ eur: 0, nonEur: 0 })
  })
})

// The hotels list's Low / High pair. It read pp_double_eur (mirrored from the
// FIRST period on save) and high_pp_double_eur (never written since periods
// became a dated list) — so every row showed High $0.00 beside a real Low
// (operator, 2026-09-06). Low/High now span the priced periods.
describe('hotelPpDoubleRange', () => {
  it('reads the cheapest and dearest priced period, whatever order they are stored in', () => {
    const row = {
      pp_double_eur: 100, high_pp_double_eur: 0, // the live column shape
      seasons: [
        seasonRow('2026-05-01', '2026-10-31', 100, 100),
        seasonRow('2026-11-01', '2026-12-20', 120, 125),
        seasonRow('2026-12-21', '2027-01-05', 180, 190),
        seasonRow('2027-01-06', '2027-04-30', 120, 125),
      ],
    }
    expect(hotelPpDoubleRange(row)).toEqual({
      low: { eur: 100, nonEur: 100 },
      high: { eur: 180, nonEur: 190 },
      periods: 4,
    })
  })

  it('skips unpriced periods — a 0 is a hole, never the Low', () => {
    const row = { seasons: [seasonRow('2026-01-01', '2026-06-30', 0, 0), seasonRow('2026-07-01', '2026-12-31', 90, 95)] }
    expect(hotelPpDoubleRange(row)).toEqual({ low: { eur: 90, nonEur: 95 }, high: { eur: 90, nonEur: 95 }, periods: 2 })
    expect(hotelPpDoubleRange({ seasons: [seasonRow('2026-01-01', '2026-06-30', 0, 0)] }).high).toEqual({ eur: 0, nonEur: 0 })
  })

  it('a row still on columns reports its one price on both ends and 0 periods', () => {
    expect(hotelPpDoubleRange({ pp_double_eur: 70, pp_double_non_eur: 75 })).toEqual({
      low: { eur: 70, nonEur: 75 }, high: { eur: 70, nonEur: 75 }, periods: 0,
    })
  })
})
