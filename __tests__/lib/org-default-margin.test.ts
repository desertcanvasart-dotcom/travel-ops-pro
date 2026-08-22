// Margin used to be a per-user preference with a hard-coded 25 behind it. It
// is now an org default, resolved request → user → org → 25. These pin the
// order, that 0 is a real margin, and that the lookup never throws.
import { describe, it, expect, vi } from 'vitest'
import { resolveMarginPercent, getOrgDefaultMargin, normaliseMargin, FALLBACK_MARGIN_PERCENT } from '@/lib/org-default-margin'

const dbWith = (result: { data: { default_margin_percent?: unknown } | null; error: { message: string } | null }) => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }),
})

describe('resolveMarginPercent', () => {
  it('request beats user beats org beats 25', () => {
    expect(resolveMarginPercent({ requested: 18, userPreference: 22, orgDefault: 30 })).toBe(18)
    expect(resolveMarginPercent({ userPreference: 22, orgDefault: 30 })).toBe(22)
    expect(resolveMarginPercent({ orgDefault: 30 })).toBe(30)
    expect(resolveMarginPercent({})).toBe(FALLBACK_MARGIN_PERCENT)
  })
  it('treats 0 as a real margin, not as "unset"', () => {
    expect(resolveMarginPercent({ requested: 0, orgDefault: 30 })).toBe(0)
    expect(resolveMarginPercent({ userPreference: 0, orgDefault: 30 })).toBe(0)
  })
  it('skips garbage and out-of-range values', () => {
    expect(resolveMarginPercent({ requested: 'abc', userPreference: 150, orgDefault: '27.5' })).toBe(27.5)
    expect(normaliseMargin('')).toBeNull(); expect(normaliseMargin(-1)).toBeNull(); expect(normaliseMargin('30')).toBe(30)
  })
})

describe('getOrgDefaultMargin', () => {
  it('returns the org setting, null when unset, and never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await getOrgDefaultMargin(dbWith({ data: { default_margin_percent: '30.00' }, error: null }), 'org')).toBe(30)
    expect(await getOrgDefaultMargin(dbWith({ data: { default_margin_percent: null }, error: null }), 'org')).toBeNull()
    expect(await getOrgDefaultMargin(dbWith({ data: null, error: { message: 'column missing' } }), 'org')).toBeNull()
    expect(await getOrgDefaultMargin({ from: () => { throw new Error('boom') } }, 'org')).toBeNull()
    expect(await getOrgDefaultMargin(dbWith({ data: { default_margin_percent: 30 }, error: null }), null)).toBeNull()
    warn.mockRestore()
  })
})
