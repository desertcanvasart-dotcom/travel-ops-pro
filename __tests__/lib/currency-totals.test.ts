import { describe, it, expect } from 'vitest'
import { averageRatesByCurrency, formatRateAverages } from '@/lib/currency-totals'

describe('averageRatesByCurrency — the mixed-list answer', () => {
  const row = (rate: number, currency: string | null) => ({ rate, currency })
  const buckets = (rows: ReturnType<typeof row>[]) =>
    averageRatesByCurrency(rows, r => r.rate, r => r.currency)

  it('a mixed list gets one honest number per currency, biggest bucket first', () => {
    // The Meal Rates card (2026-09-04): 16 EGP rows + 2 USD rows showed a
    // dash. Now it shows both truths, nothing converted.
    const out = buckets([row(700, 'EGP'), row(900, 'EGP'), row(20, 'USD')])
    expect(out).toEqual([
      { currency: 'EGP', amount: 800, count: 2 },
      { currency: 'USD', amount: 20, count: 1 },
    ])
    expect(formatRateAverages(out, n => `$${n}`)).toBe('E£800.00 · $20.00')
  })

  it('org-currency rows form their own bucket and format through the org formatter', () => {
    const out = buckets([row(10, null), row(30, null)])
    expect(out).toEqual([{ currency: null, amount: 20, count: 2 }])
    expect(formatRateAverages(out, n => `US$${n}`)).toBe('US$20')
  })

  it('unpriced rows are excluded from sum AND count; nothing priced is a dash', () => {
    expect(buckets([row(0, 'EGP'), row(600, 'EGP')])).toEqual([{ currency: 'EGP', amount: 600, count: 1 }])
    expect(formatRateAverages(buckets([row(0, 'EGP')]), n => `${n}`)).toBe('—')
  })

  it('yen averages carry no invented decimals', () => {
    expect(buckets([row(100, 'JPY'), row(101, 'JPY')])).toEqual([{ currency: 'JPY', amount: 101, count: 2 }])
  })
})
