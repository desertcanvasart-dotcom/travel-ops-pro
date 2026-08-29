// The Rates Hub opens on a tab that has something — audit AUT-M01: it opened
// on an empty Transportation tab while its own header counted services that
// lived on other tabs, and the page read as broken.
import { describe, it, expect } from 'vitest'
import { RATES_TAB_ORDER, firstTabWithData, type RatesTab } from '@/lib/rates/first-tab-with-data'

const counts = (over: Partial<Record<RatesTab, number>>): Record<RatesTab, number> =>
  Object.fromEntries(RATES_TAB_ORDER.map(t => [t, over[t] ?? 0])) as Record<RatesTab, number>

describe('firstTabWithData', () => {
  it('keeps transportation when it has rows', () => {
    expect(firstTabWithData(counts({ transportation: 3, entrances: 5 }))).toBe('transportation')
  })

  it('skips past empty tabs to the one with data — the audited case', () => {
    // The audit account: one entrance fee, nothing else. It saw an empty
    // transportation table under a header saying "Total Services 1".
    expect(firstTabWithData(counts({ entrances: 1 }))).toBe('entrances')
  })

  it('respects tab-bar order when several tabs have data', () => {
    expect(firstTabWithData(counts({ meals: 2, guides: 1 }))).toBe('guides')
  })

  it('returns null on a brand-new install with no rates anywhere', () => {
    expect(firstTabWithData(counts({}))).toBe(null)
  })
})
