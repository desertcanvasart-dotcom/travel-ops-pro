// The engine used to stamp 'EUR' on everything. The rate currency is now an org
// setting; these pin that the resolver defaults to EUR (so no existing org
// changes), honours the setting, and never throws.
import { describe, it, expect, vi } from 'vitest'
import { getOrgRateCurrency, normaliseRateCurrency, DEFAULT_RATE_CURRENCY } from '@/lib/org-rate-currency'

const dbWith = (result: { data: { rate_currency?: string | null } | null; error: { message: string } | null }) => ({
  from: (_t: 'organizations') => ({ select: (_c: 'rate_currency') => ({ eq: (_k: 'id', _v: string) => ({ maybeSingle: async () => result }) }) }),
})

describe('getOrgRateCurrency', () => {
  it('is EUR when there is no org — the engine\'s historical default', async () => {
    expect(await getOrgRateCurrency(dbWith({ data: null, error: null }), null)).toBe('EUR')
    expect(DEFAULT_RATE_CURRENCY).toBe('EUR')
  })
  it('returns the org setting', async () => {
    expect(await getOrgRateCurrency(dbWith({ data: { rate_currency: 'USD' }, error: null }), 'org-1')).toBe('USD')
  })
  it('falls back to EUR on an unset, unknown, or unreadable value — never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await getOrgRateCurrency(dbWith({ data: { rate_currency: null }, error: null }), 'org-1')).toBe('EUR')
    expect(await getOrgRateCurrency(dbWith({ data: { rate_currency: 'BTC' }, error: null }), 'org-1')).toBe('EUR')
    expect(await getOrgRateCurrency(dbWith({ data: null, error: { message: 'column does not exist' } }), 'org-1')).toBe('EUR')
    const throwing = { from: () => { throw new Error('boom') } } as unknown as Parameters<typeof getOrgRateCurrency>[0]
    expect(await getOrgRateCurrency(throwing, 'org-1')).toBe('EUR')
    warn.mockRestore()
  })
})

describe('normaliseRateCurrency', () => {
  it('accepts the five codes in any case and rejects the rest', () => {
    expect(normaliseRateCurrency(' usd ')).toBe('USD')
    expect(normaliseRateCurrency('jpy')).toBe('JPY')
    expect(normaliseRateCurrency('BTC')).toBeNull()
    expect(normaliseRateCurrency(42)).toBeNull()
  })
})
