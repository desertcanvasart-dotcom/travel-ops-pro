// C2: the Concierge Leads list is the newest 200 briefs. The tab counts were
// counted from those 200 rows (silently low past the cap), and a failed read
// answered success with no rows — it looked like "no leads". Counts now come
// from the database, `total` says how many there are, and a failed read is a
// 500 the page shows.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ client: null as unknown }))

vi.mock('@/lib/auth/org-auth', () => ({
  orgAuth: async () => ({ error: null, status: 200, supabase: ctx.client, org_id: 'org-a', user: { id: 'u1' } }),
}))

import { GET } from '@/app/api/concierge-briefs/route'

const brief = (n: number, org: string, review_status: string) => ({
  id: `b${org}${n}`, org_id: org, review_status, received_at: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(),
})

beforeEach(() => {
  const rows = [
    ...Array.from({ length: 230 }, (_, i) => brief(i, 'org-a', i < 210 ? 'needs_review' : 'responded')),
    ...Array.from({ length: 5 }, (_, i) => brief(i, 'org-b', 'needs_review')),
  ]
  setMockTables({ concierge_briefs: rows })
  ctx.client = createMockClient()
})

describe('GET /api/concierge-briefs', () => {
  it('lists the newest 200 and counts every brief of the company', async () => {
    const res = await GET(new NextRequest('http://x/api/concierge-briefs'))
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(200)
    expect(body.limit).toBe(200)
    expect(body.total).toBe(230)
    expect(body.counts).toEqual({ needs_review: 210, in_progress: 0, responded: 20, archived: 0 })
  })

  it('a failed read is a 500, not an empty list', async () => {
    const failing = { from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q,
        then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'boom' }, count: null }).then(r) }
      return q
    } }
    ctx.client = failing
    const res = await GET(new NextRequest('http://x/api/concierge-briefs'))
    expect(res.status).toBe(500)
    expect((await res.json()).success).toBe(false)
  })
})

describe('the Concierge Leads page', () => {
  const page = readFileSync(join(process.cwd(), 'app/concierge-briefs/page.tsx'), 'utf8')
  it('uses the API counts and says when the list is capped', () => {
    expect(page).toContain('const counts = serverCounts ??')
    expect(page).toContain("t.key === 'all' ? allCount")
    expect(page).toMatch(/Showing the newest \{briefs\.length\} of \{total\} briefs/)
  })
  it('shows a load error', () => {
    expect(page).toContain('{loadError && (')
  })
})
