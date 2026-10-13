// The departures grid: LND is the engine's whole gross (domestic flights
// included), AIR is the international fare typed per class, and each class
// publishes a website rate ending in 999 (operator, 2026-10-01).
import { describe, it, expect } from 'vitest'
import { classColumn, convertAtRate, websiteRate } from '@/lib/pricing/departure-buckets'

describe('websiteRate rounds UP to end in 999', () => {
  it('rounds up within the thousand', () => {
    expect(websiteRate(417_651)).toBe(417_999)
    expect(websiteRate(417_000)).toBe(417_999)
  })

  it('keeps a price already ending in 999, and moves on from a round thousand', () => {
    expect(websiteRate(417_999)).toBe(417_999)
    expect(websiteRate(418_000)).toBe(418_999)
  })

  it('never rounds down, even by a fraction', () => {
    expect(websiteRate(417_999.4)).toBe(418_999)
  })

  it('is zero-safe', () => {
    expect(websiteRate(0)).toBe(0)
  })
})

describe('classColumn', () => {
  it('totals AIR + 燃油 + LND and suggests the website rate', () => {
    expect(classColumn({ landPp: 388_603, fuelPp: 20_000, airPp: 180_000, websiteTyped: null })).toEqual({
      airPp: 180_000,
      totalPp: 588_603,
      websiteSuggested: 588_999,
      websitePp: 588_999,
      websiteTyped: false,
    })
  })

  it('has no total and no website rate until the class has a fare', () => {
    expect(classColumn({ landPp: 388_603, fuelPp: 20_000, airPp: null, websiteTyped: null })).toMatchObject({
      totalPp: null,
      websiteSuggested: null,
      websitePp: null,
    })
  })

  it('totals without fuel while it is not entered', () => {
    expect(classColumn({ landPp: 100_000, fuelPp: null, airPp: 50_000, websiteTyped: null }).totalPp).toBe(150_000)
  })

  it('publishes a typed website rate over the suggestion', () => {
    const c = classColumn({ landPp: 388_603, fuelPp: 0, airPp: 100_000, websiteTyped: 489_000 })
    expect(c).toMatchObject({ websiteSuggested: 488_999, websitePp: 489_000, websiteTyped: true })
  })
})

describe('FX conversion is a parameter, rounded to whole target units', () => {
  it('converts USD to whole JPY at the office rate', () => {
    // 160 JPY per USD, the office internal rate.
    expect(convertAtRate(1000, 160)).toBe(160000)
    expect(convertAtRate(12.345, 160)).toBe(1975) // 1975.2 → 1975
  })

  it('is zero-safe', () => {
    expect(convertAtRate(0, 160)).toBe(0)
    expect(convertAtRate(100, 0)).toBe(0)
  })
})

// The 999 rule is the yen rule. The grid prices in the company's own currency,
// and a euro total of €1,234.56 was published as €1,999 (Operate audit).
describe('websiteRate: 999 for yen only', () => {
  it('yen rounds up to end in 999, as before (the default)', () => {
    expect(websiteRate(417_651, 'JPY')).toBe(417_999)
    expect(websiteRate(417_651)).toBe(417_999)
  })

  it('any other currency is the total rounded to its own unit', () => {
    expect(websiteRate(1_234.564, 'EUR')).toBe(1_234.56)
    expect(websiteRate(1_234.565, 'USD')).toBe(1_234.57)
    expect(websiteRate(980.1, 'GBP')).toBe(980.1)
    expect(websiteRate(15_000, 'EGP')).toBe(15_000)
    expect(websiteRate(0, 'EUR')).toBe(0)
  })

  it('classColumn suggests by the grid currency', () => {
    expect(classColumn({ landPp: 1_000.5, fuelPp: 34.25, airPp: 200, websiteTyped: null, currency: 'EUR' }))
      .toMatchObject({ totalPp: 1_234.75, websiteSuggested: 1_234.75, websitePp: 1_234.75 })
    expect(classColumn({ landPp: 100_500, fuelPp: 0, airPp: 200_000, websiteTyped: null, currency: 'JPY' }).websiteSuggested)
      .toBe(300_999)
  })

  it('the grid route and page pass their currency', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('app/api/departures/grid/route.ts', 'utf8')).toContain('currency: targetCurrency,')
    expect(readFileSync('app/departures/grid/[templateId]/page.tsx', 'utf8')).toContain('currency: band.currency')
  })
})
