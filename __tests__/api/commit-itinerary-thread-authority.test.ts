// DEFERRED_GATES.md G1: an itinerary committed from a Concierge brief belongs
// to the THREAD's company — the company the lead came in to — never to
// whichever workspace the clicking operator has active. The operator must be
// a member of the thread's company (anyone else: 404, the thread is not
// confirmed to exist); the button names the company; the currency is the
// company's; and a random itinerary code that is already taken is retried,
// not mistaken for a concurrent commit of the same thread.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, userId: 'ua' as string | null, codeCollisions: 0, raceWinner: false }))

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => {
    const db = createMockClient()
    return {
      ...db,
      from: (t: string) => {
        const q = db.from(t)
        if (t !== 'itineraries') return q
        // The first N inserts hit a taken itinerary_code (23505) — no row
        // for this thread exists, so it is not a concurrent commit. With
        // raceWinner, another request's insert of THIS thread won instead.
        const insert = q.insert
        q.insert = (row: Record<string, unknown>) => {
          if (ctx.raceWinner) {
            ctx.raceWinner = false
            db.from('itineraries').insert({ id: 'it-winner', org_id: row.org_id, thread_id: row.thread_id, itinerary_code: 'ITN-S-2026-001', trip_name: 'Won' })
            const failed: any = { select: () => failed, single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_itineraries_thread_id_unique"' } }) }
            return failed
          }
          if (ctx.codeCollisions > 0) {
            ctx.codeCollisions--
            const failed: any = { select: () => failed, single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "itineraries_itinerary_code_key"' } }) }
            return failed
          }
          return insert(row)
        }
        return q
      },
    }
  },
}))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => ctx.userId,
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})

import { GET, POST } from '@/app/api/copilot/threads/[id]/commit-itinerary/route'

const req = (method = 'GET') => new NextRequest('http://x/api/copilot/threads/th-a/commit-itinerary', { method })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const itineraries = async () => ((await createMockClient().from('itineraries').select()) as { data: any[] }).data

beforeEach(() => {
  ctx.orgId = 'org-a'
  ctx.userId = 'ua'
  ctx.codeCollisions = 0
  ctx.raceWinner = false
  setMockTables({
    organizations: [
      { id: 'org-a', name: 'ATS', default_currency: 'JPY' },
      { id: 'org-b', name: 'Travel2Egypt', default_currency: null },
    ],
    // ua: ATS only. ub: Travel2Egypt only. both: a member of each.
    organization_members: [
      { org_id: 'org-a', user_id: 'ua', role: 'agent' },
      { org_id: 'org-b', user_id: 'ub', role: 'agent' },
      { org_id: 'org-a', user_id: 'both', role: 'agent' },
      { org_id: 'org-b', user_id: 'both', role: 'agent' },
    ],
    communication_threads: [
      { id: 'th-a', org_id: 'org-a', origin: 'concierge', brief_id: 'br-a', client_id: null, client_name: 'Aiko' },
    ],
    concierge_briefs: [
      { id: 'br-a', client_id: null, visitor_name: 'Aiko', visitor_email: 'aiko@example.com', visitor_phone: null,
        destinations: ['Cairo'], trip_length_days: 5, dates_specific: '2026-12-01', travelers_count: 2, brief_summary: 'Honeymoon' },
    ],
    itineraries: [],
  })
})

describe("the thread's company is the itinerary's", () => {
  it("an operator of the other company only is refused (404), and nothing is created", async () => {
    ctx.orgId = 'org-b'
    ctx.userId = 'ub'
    expect((await POST(req('POST'), params('th-a'))).status).toBe(404)
    expect(await itineraries()).toEqual([])
    const r = await (await GET(req(), params('th-a'))).json()
    expect(r).toMatchObject({ success: true, itinerary: null, org: null })
  })

  it("a member of the thread's company commits it there, in the company's currency", async () => {
    const res = await POST(req('POST'), params('th-a'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ success: true, org_id: 'org-a', org_name: 'ATS', was_new: true })
    expect(await itineraries()).toEqual([expect.objectContaining({ org_id: 'org-a', thread_id: 'th-a', currency: 'JPY' })])
  })

  it("a person in both companies, with the OTHER workspace active, still lands it in the thread's", async () => {
    ctx.orgId = 'org-b'
    ctx.userId = 'both'
    expect((await POST(req('POST'), params('th-a'))).status).toBe(201)
    expect((await itineraries()).map(i => i.org_id)).toEqual(['org-a'])
    // Committing again finds the same itinerary.
    const again = await POST(req('POST'), params('th-a'))
    expect(again.status).toBe(200)
    expect((await itineraries()).length).toBe(1)
  })

  it("GET names the thread's company for the button", async () => {
    const r = await (await GET(req(), params('th-a'))).json()
    expect(r).toMatchObject({ success: true, org: { id: 'org-a', name: 'ATS' }, itinerary: null })
  })

  it('a company without a default currency gets EUR', async () => {
    setMockTables({
      organizations: [{ id: 'org-b', name: 'Travel2Egypt', default_currency: null }],
      organization_members: [{ org_id: 'org-b', user_id: 'ub', role: 'agent' }],
      communication_threads: [{ id: 'th-b', org_id: 'org-b', origin: 'concierge', brief_id: 'br-b' }],
      concierge_briefs: [{ id: 'br-b', destinations: [], trip_length_days: 3 }],
      itineraries: [],
    })
    ctx.orgId = 'org-b'
    ctx.userId = 'ub'
    expect((await POST(req('POST'), params('th-b'))).status).toBe(201)
    expect((await itineraries())[0]).toMatchObject({ org_id: 'org-b', currency: 'EUR' })
  })
})

describe('a taken itinerary code', () => {
  it('is retried with a new code — not mistaken for a concurrent commit', async () => {
    ctx.codeCollisions = 2
    const res = await POST(req('POST'), params('th-a'))
    expect(res.status).toBe(201)
    expect(await itineraries()).toHaveLength(1)
    expect(ctx.codeCollisions).toBe(0)
  })

  it('a concurrent commit of the same thread returns the winner', async () => {
    ctx.raceWinner = true
    const res = await POST(req('POST'), params('th-a'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ itinerary_id: 'it-winner', was_new: false })
    expect(await itineraries()).toHaveLength(1)
  })
})
