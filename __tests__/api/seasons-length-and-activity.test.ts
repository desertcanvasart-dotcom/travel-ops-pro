// Seasonal Premiums routes:
//   - a name over 80 characters or a label over 120 is a 400 that says why
//     (the columns are varchar(80)/(120); it was a bare 500 "Failed to create")
//   - a premium change, a new season, a deleted one and moved dates each add
//     an Activity Log row with the values before and after
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const logged = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const c = createMockClient()
    // The mock hands back live rows; PostgREST returns copies. A "before"
    // read must not change when the row is updated afterwards.
    return {
      from: (t: string) => {
        const q = c.from(t)
        const ms = q.maybeSingle
        q.maybeSingle = async () => {
          const r = await ms()
          return { ...r, data: r.data ? { ...r.data } : r.data }
        }
        return q
      },
    }
  },
}))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => 'org-a',
    getCurrentUserId: async () => 'u-manager',
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/activity-log', () => ({
  recordChange: async (c: Record<string, unknown>) => { logged.calls.push(c) },
}))

import * as seasons from '@/app/api/pricing/seasons/route'
import * as seasonById from '@/app/api/pricing/seasons/[id]/route'
import * as dates from '@/app/api/pricing/season-dates/route'
import * as dateById from '@/app/api/pricing/season-dates/[id]/route'

const req = (method: string, body: unknown) =>
  new NextRequest('http://x/api', { method, body: JSON.stringify(body) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  logged.calls.length = 0
  setMockTables({
    pricing_seasons: [
      { id: 's1', org_id: 'org-a', name: 'Golden Week', uplift_percent: '15.00', colour: '#647C47', display_order: 0, is_active: true },
      { id: 's-b', org_id: 'org-b', name: 'Other company', uplift_percent: '5.00', is_active: true },
    ],
    pricing_season_dates: [
      { id: 'w1', org_id: 'org-a', season_id: 's1', start_date: '2027-04-29', end_date: '2027-05-05', label: null, pricing_seasons: { name: 'Golden Week' } },
    ],
  })
})

describe('name and label length', () => {
  it('a season name of 81 characters is a 400 that names the limit; 80 is accepted', async () => {
    const r = await seasons.POST(req('POST', { name: 'x'.repeat(81), uplift_percent: 10 }))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('Season name can be at most 80 characters')
    expect((await seasons.POST(req('POST', { name: 'y'.repeat(80), uplift_percent: 10 }))).status).toBe(200)
  })
  it('a rename over 80 characters is a 400 too', async () => {
    const r = await seasonById.PATCH(req('PATCH', { name: 'z'.repeat(81) }), ctx('s1'))
    expect(r.status).toBe(400)
  })
  it('a label over 120 characters is a 400 on add and on edit', async () => {
    const a = await dates.POST(req('POST', { season_id: 's1', start_date: '2027-08-13', end_date: '2027-08-16', label: 'l'.repeat(121) }))
    expect(a.status).toBe(400)
    expect((await a.json()).error).toBe('Label can be at most 120 characters')
    const e = await dateById.PATCH(req('PATCH', { label: 'l'.repeat(121) }), ctx('w1'))
    expect(e.status).toBe(400)
  })
})

describe('Activity Log detail', () => {
  it('a premium change records 15% → 18% under the season name', async () => {
    const r = await seasonById.PATCH(req('PATCH', { uplift_percent: 18 }), ctx('s1'))
    expect(r.status).toBe(200)
    expect(logged.calls).toHaveLength(1)
    expect(logged.calls[0]).toMatchObject({
      org_id: 'org-a', user_id: 'u-manager', method: 'PATCH',
      detail: { target: 'Golden Week', changes: [{ field: 'uplift_percent', from: 15, to: 18 }] },
    })
  })
  it('switching a season off records the active flag', async () => {
    await seasonById.PATCH(req('PATCH', { is_active: false }), ctx('s1'))
    expect((logged.calls[0].detail as { changes: unknown }).changes).toEqual([{ field: 'is_active', from: true, to: false }])
  })
  it('a new season and a deleted one record the premium they start or end with', async () => {
    await seasons.POST(req('POST', { name: 'Obon', uplift_percent: 10 }))
    expect(logged.calls[0].detail).toEqual({ target: 'Obon', changes: [{ field: 'uplift_percent', from: null, to: 10 }] })
    await seasonById.DELETE(req('DELETE', {}), ctx('s1'))
    expect(logged.calls[1].detail).toEqual({ target: 'Golden Week', changes: [{ field: 'uplift_percent', from: 15, to: null }] })
  })
  it('moving dates records the window before and after; adding records the new one', async () => {
    await dateById.PATCH(req('PATCH', { end_date: '2027-05-06' }), ctx('w1'))
    expect(logged.calls[0].detail).toEqual({
      target: 'Golden Week',
      changes: [{ field: 'dates', from: '2027-04-29 – 2027-05-05', to: '2027-04-29 – 2027-05-06' }],
    })
    await dates.POST(req('POST', { season_id: 's1', start_date: '2027-12-29', end_date: '2028-01-03' }))
    expect(logged.calls[1].detail).toEqual({ target: 'Golden Week', changes: [{ field: 'dates', from: null, to: '2027-12-29 – 2028-01-03' }] })
  })
  it('a refused or not-found change records nothing', async () => {
    expect((await seasonById.PATCH(req('PATCH', { uplift_percent: 500 }), ctx('s1'))).status).toBe(400)
    expect((await seasonById.PATCH(req('PATCH', { uplift_percent: 1 }), ctx('s-b'))).status).toBe(404)
    expect(logged.calls).toEqual([])
  })
})
