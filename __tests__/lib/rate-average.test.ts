// averageRateInOneCurrency: average within ONE currency, or refuse.
//
// The header on /rates/tipping read "Avg. Tip $600.00" for two rows stored as
// EGP 500 and EGP 700. The 600 was arithmetically fine and completely wrong:
// it is E£600, and the org symbol in front of it named a currency neither row
// used and the viewer had not chosen either.
import { describe, it, expect } from 'vitest'
import { averageRateInOneCurrency, formatRateAverage } from '@/lib/currency-totals'

const rows = (...rs: [number | null, string | null][]) =>
  rs.map(([rate_eur, rate_currency]) => ({ rate_eur, rate_currency }))

const avg = (rs: { rate_eur: number | null; rate_currency: string | null }[]) =>
  averageRateInOneCurrency(rs, r => r.rate_eur, r => r.rate_currency)

const orgFormat = (n: number) => `$${n.toFixed(2)}`

describe('averageRateInOneCurrency', () => {
  it('averages an all-EGP list in EGP, not in the org currency', () => {
    // The exact live case from the screenshot.
    const result = avg(rows([500, 'EGP'], [700, 'EGP']))
    expect(result).toEqual({ amount: 600, currency: 'EGP' })
    expect(formatRateAverage(result, orgFormat)).toBe('E£600.00')
  })

  it('refuses to average across currencies', () => {
    expect(avg(rows([500, 'EGP'], [700, 'GBP']))).toBeNull()
    expect(formatRateAverage(avg(rows([500, 'EGP'], [700, 'GBP'])), orgFormat)).toBe('—')
  })

  it('averages the org-currency rows when any row uses the org currency', () => {
    // Mixed, but with a real org-currency population: report that one rather
    // than a dash. Rows carrying their own currency are left out of it.
    const result = avg(rows([10, null], [20, null], [9999, 'EGP']))
    expect(result).toEqual({ amount: 15, currency: null })
    expect(formatRateAverage(result, orgFormat)).toBe('$15.00')
  })

  it('excludes unpriced rows from the count, not just the sum', () => {
    // A blank rate is a hole. Averaging 100 and null as (100+0)/2 = 50 reports
    // a rate nobody charges.
    expect(avg(rows([100, 'EGP'], [null, 'EGP']))).toEqual({ amount: 100, currency: 'EGP' })
    expect(avg(rows([100, null], [0, null]))).toEqual({ amount: 100, currency: null })
  })

  it('returns null for an empty or wholly unpriced list', () => {
    expect(avg([])).toBeNull()
    expect(avg(rows([null, 'EGP'], [0, null]))).toBeNull()
    expect(formatRateAverage(avg([]), orgFormat)).toBe('—')
  })

  it('rounds a yen average to whole yen', () => {
    // ¥1,200.50 is not a quantity of money that exists.
    expect(avg(rows([100, 'JPY'], [101, 'JPY']))?.amount).toBe(101)
    expect(formatRateAverage(avg(rows([100, 'JPY'], [101, 'JPY'])), orgFormat)).toBe('¥101')
  })

  it('treats a blank or whitespace currency as the org currency', () => {
    expect(avg(rows([10, ''], [20, '  ']))).toEqual({ amount: 15, currency: null })
  })
})
