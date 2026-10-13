// /api/rates — what the rates hub (and the tour-builder pickers) read.
//   - A database error was answered `success: true, data: []`, so the hub
//     showed 0 for that category, indistinguishable from "no rates".
//   - Every type was one select: PostgREST's 1000-row cap stopped the tab
//     counts, "Total Services" and "Cities" at a thousand, silently.
//   - The transportation transform dropped `id`, so with in_org_currency an
//     unconvertible row came back labelled as converted.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { setMockTables, createMockClient } from '../_mock-supabase'
import type { ExchangeRates } from '@/lib/currency-service'

const state = vi.hoisted(() => ({ fail: false }))
vi.mock('@/lib/supabase-server', () => ({
  createServerClient: () => {
    const real = createMockClient()
    if (!state.fail) return real
    const broken: any = { select: () => broken, eq: () => broken, ilike: () => broken, order: () => broken,
      range: async () => ({ data: null, error: { message: 'boom' } }) }
    return { ...real, from: () => broken }
  },
}))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return { getCurrentOrgId: async () => 'org-1', noOrgResponse: () => NextResponse.json({}, { status: 403 }) }
})
vi.mock('@/lib/rates/fx-source', () => ({
  fetchRunExchangeRates: vi.fn(async () => ({ base: 'USD', rates: { USD: 1, EGP: 50, EUR: 0.9 }, timestamp: 0 } as unknown as ExchangeRates)),
}))

import { GET } from '@/app/api/rates/route'
import { hubViewCsv, tabForHash } from '@/lib/rates/hub-view'

const get = async (query: string) => {
  const res = await GET({ url: `http://localhost/api/rates?${query}` } as any)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  state.fail = false
  setMockTables({ organizations: [{ id: 'org-1', rate_currency: 'USD' }] })
})

describe('GET /api/rates', () => {
  it('a failed read is a 500, not an empty success', async () => {
    state.fail = true
    const out = await get('type=guide')
    expect(out.status).toBe(500)
    expect(out.body.success).toBe(false)
  })

  it('reads past 1000 rows', async () => {
    setMockTables({ tipping_rates: Array.from({ length: 1205 }, (_, i) => ({ id: `t${String(i).padStart(4, '0')}`, org_id: 'org-1', is_active: true, role_type: 'driver', context: 'day_tour', rate_eur: 1 })) })
    const out = await get('type=tipping')
    expect(out.body.count).toBe(1205)
  })

  it('an unconvertible transport row comes back flagged, with its id', async () => {
    setMockTables({
      organizations: [{ id: 'org-1', rate_currency: 'USD' }],
      transportation_rates: [{ id: 'tr-1', org_id: 'org-1', is_active: true, service_code: 'X', city: 'Cairo', rate_currency: 'BTC',
        vehicles: [{ key: 'sedan', rate_eur: 10, rate_non_eur: null, capacity_min: 1, capacity_max: 2 }] }],
    })
    const out = await get('type=transportation&in_org_currency=true')
    expect(out.body.data[0]).toMatchObject({ id: 'tr-1', conversion_missing: true })
  })
})

describe('the hub page', () => {
  it('"Export view" keeps 0 and writes lists, under every row’s keys', () => {
    const csv = hubViewCsv([{ code: 'A', rate: 0, tags: ['x', 'y'] }, { code: 'B', vehicles: [{ key: 'van', rate_eur: 5 }] }])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('"code","rate","tags","vehicles"')
    expect(lines[1]).toBe('"A","0","x; y",""')
    expect(lines[2]).toContain('""key"":""van""')
    expect(csv).not.toContain('[object Object]')
  })

  it('every /rates#… menu link opens a hub tab', () => {
    const nav = fs.readFileSync(path.join(process.cwd(), 'components/nav/navigation-config.ts'), 'utf8')
    const anchors = [...nav.matchAll(/href: '\/rates#(\w+)'/g)].map(m => m[1])
    expect(anchors.length).toBeGreaterThan(0)
    for (const a of anchors) expect(tabForHash(`#${a}`), a).not.toBeNull()
    const page = fs.readFileSync(path.join(process.cwd(), 'app/rates/page.tsx'), 'utf8')
    expect(page).toContain('id={anchor}')
  })

  it('a tab that failed to load is said so, not shown as empty', () => {
    const page = fs.readFileSync(path.join(process.cwd(), 'app/rates/page.tsx'), 'utf8')
    expect(page).toContain("t('loadFailed'")
    expect(page).not.toMatch(/json\?\.success \? json\.data : \[\]/)
  })
})
