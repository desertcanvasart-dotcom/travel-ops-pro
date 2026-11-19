// The seasons feed (GET /api/public/v1/seasons; ported from autoura-saas #823):
// the operator's peak calendar, with the rules quotes use.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seasonsFeed, peakPerPerson, type FeedWindow } from '@/lib/pricing/season-feed'

const w = (over: Partial<FeedWindow>): FeedWindow => ({
  seasonId: 's1', name: 'Winter peak', upliftPercent: 10, startDate: '2026-12-01', endDate: '2027-02-28', label: 'Winter 26/27', ...over,
})

describe('seasonsFeed', () => {
  const winter = w({})
  const newYear = w({ seasonId: 's2', name: 'New Year', upliftPercent: 25, startDate: '2026-12-24', endDate: '2027-01-02', label: null })

  it('lists each season with its ranges, in date order', () => {
    const f = seasonsFeed([newYear, winter, w({ startDate: '2027-12-01', endDate: '2028-02-28', label: 'Winter 27/28' })], '2026-11-19')
    expect(f.asOf).toBe('2026-11-19')
    expect(f.rule).toEqual({ matchBy: 'departure_date', overlap: 'highest_wins', appliesTo: 'per_person_selling_price' })
    expect(f.seasons).toEqual([
      { name: 'Winter peak', upliftPercent: 10, ranges: [
        { start: '2026-12-01', end: '2027-02-28', label: 'Winter 26/27' },
        { start: '2027-12-01', end: '2028-02-28', label: 'Winter 27/28' },
      ] },
      { name: 'New Year', upliftPercent: 25, ranges: [{ start: '2026-12-24', end: '2027-01-02', label: null }] },
    ])
  })

  it('a date in two windows takes the highest premium, never the sum', () => {
    expect(seasonsFeed([winter, newYear], '2026-11-19', '2026-12-31').date).toEqual({ date: '2026-12-31', season: { name: 'New Year', upliftPercent: 25 } })
    expect(seasonsFeed([winter, newYear], '2026-11-19', '2027-02-01').date).toEqual({ date: '2027-02-01', season: { name: 'Winter peak', upliftPercent: 10 } })
    expect(seasonsFeed([winter, newYear], '2026-11-19', '2026-11-20').date).toEqual({ date: '2026-11-20', season: null })
  })

  it('0% seasons and windows already over charge nothing and are left out', () => {
    const f = seasonsFeed([w({ upliftPercent: 0 }), w({ seasonId: 's3', name: 'Old', startDate: '2026-01-01', endDate: '2026-02-01' })], '2026-11-19', '2026-12-05')
    expect(f.seasons).toEqual([])
    expect(f.date?.season).toBeNull()
  })

  it('a window ending today still counts', () => {
    expect(seasonsFeed([w({ startDate: '2026-11-01', endDate: '2026-11-19' })], '2026-11-19').seasons).toHaveLength(1)
  })
})

describe('peakPerPerson', () => {
  it('the premium on the per-person price, to the cent', () => {
    expect(peakPerPerson(408.75, 15)).toBe(470.06)
    expect(peakPerPerson(330, 0)).toBe(330)
    expect(peakPerPerson(99.99, 10)).toBe(109.99)
  })
})

describe('GET /api/public/v1/seasons', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('uses the partner key, reads only that company\'s ACTIVE seasons, and returns no prices', () => {
    const src = read('app/api/public/v1/seasons/route.ts')
    expect(src).toContain("partnerFromRequest(db, request.headers.get('authorization'), 'seasons')")
    expect(src).toContain(".eq('org_id', integration.org_id)")
    expect(src).toContain(".eq('pricing_seasons.is_active', true)")
    expect(src.indexOf('partnerFromRequest(')).toBeLessThan(src.indexOf("from('pricing_season_dates')"))
  })
  it('availability and seasons share one key check', () => {
    expect(read('app/api/public/v1/availability/route.ts')).toContain('partnerFromRequest(supabaseAdmin')
  })
})

// The key check itself.
const db = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, error: null as { code?: string; message: string } | null, hash: '' }))
vi.mock('@/lib/integrations/credentials', () => ({
  bearerToken: (h: string | null) => (h?.startsWith('Bearer ') ? h.slice(7) : null),
  hashApiKey: (k: string) => `h:${k}`,
}))
import { partnerFromRequest } from '@/lib/integrations/partner-key'
const fake = {
  from: () => ({ select: () => ({ eq: (_c: string, v: string) => { db.hash = v; return { maybeSingle: async () => ({ data: db.row, error: db.error }) } } }) }),
} as never

describe('partnerFromRequest', () => {
  beforeEach(() => { db.row = null; db.error = null; db.hash = '' })
  it('looks the key up by its hash', async () => {
    db.row = { id: 'i1', org_id: 'o1', direction: 'both', is_active: true }
    const r = await partnerFromRequest(fake, 'Bearer k1', 'test')
    expect(r).toEqual({ ok: true, integration: { id: 'i1', org_id: 'o1' } })
    expect(db.hash).toBe('h:k1')
  })
  it('missing, unknown, disabled and inbound-only keys: 401', async () => {
    expect((await partnerFromRequest(fake, null, 'test') as { response: Response }).response.status).toBe(401)
    expect((await partnerFromRequest(fake, 'Bearer x', 'test') as { response: Response }).response.status).toBe(401)
    db.row = { id: 'i1', org_id: 'o1', direction: 'both', is_active: false }
    expect((await partnerFromRequest(fake, 'Bearer x', 'test') as { response: Response }).response.status).toBe(401)
    db.row = { id: 'i1', org_id: 'o1', direction: 'inbound', is_active: true }
    expect((await partnerFromRequest(fake, 'Bearer x', 'test') as { response: Response }).response.status).toBe(401)
  })
  it('no integrations table yet: 401, not 500', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.error = { code: '42P01', message: 'no table' }
    expect((await partnerFromRequest(fake, 'Bearer x', 'test') as { response: Response }).response.status).toBe(401)
    warn.mockRestore()
  })
})
