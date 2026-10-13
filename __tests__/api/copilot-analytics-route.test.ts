import { describe, it, expect, vi, beforeEach } from 'vitest'
import { roleAllows } from '@/lib/auth/roles'

// GET /api/copilot/analytics — the route behind Home › Copilot Analytics.
//
// - The menu shows the screen to admin, manager and agent; the route used to
//   allow admin/manager only, so every agent load came back "Forbidden".
// - It reads with the service role (no RLS), so it must scope by org itself:
//   copilot_knowledge by org_id, drafts through their thread's org_id.
// - It reads at most DRAFT_CAP drafts and must say when it hit that cap.

type Call = { table: string; ops: Array<[string, unknown[]]> }
let calls: Call[]
let draftRows: any[]
let role: string | null
let orgId: string | null

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const q: any = {}
      for (const op of ['select', 'eq', 'in', 'is', 'gte', 'order', 'limit']) {
        q[op] = (...args: unknown[]) => (call.ops.push([op, args]), q)
      }
      q.then = (resolve: (v: unknown) => void) => {
        if (table === 'communication_drafts') {
          const limit = call.ops.find(([op]) => op === 'limit')?.[1][0] as number
          return resolve({ data: draftRows.slice(0, limit), error: null })
        }
        if (table === 'copilot_knowledge') return resolve({ data: [], count: 3, error: null })
        return resolve({ data: [], error: null })
      }
      return q
    },
  }),
}))

vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    requireRole: async (allowed: string[]) =>
      roleAllows(role, allowed) ? null : NextResponse.json({ success: false }, { status: 403 }),
    getCurrentOrgId: async () => orgId,
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})

const { GET, capRows, DRAFT_CAP } = await import('@/app/api/copilot/analytics/route')

const call = () => GET({ nextUrl: new URL('http://x/api/copilot/analytics?period=all') } as never)

const draft = (i: number) => ({
  id: `d${i}`, status: 'sent', send_channel: 'email', ai_flags: { pregenerated: false, tone: 'warm' },
  ai_confidence: 'high', context_used: { retrieved: [{ id: 'k1' }] }, was_edited: false,
  reviewed_by: null, created_at: '2026-10-01T00:00:00Z', sent_at: null,
})

beforeEach(() => {
  calls = []
  draftRows = [draft(1)]
  role = 'agent'
  orgId = 'org-1'
})

describe('copilot analytics: who may load it', () => {
  it.each(['admin', 'manager', 'agent', 'owner'])('%s gets the figures', async (r) => {
    role = r
    expect((await call()).status).toBe(200)
  })

  it.each(['viewer', null])('%s is refused', async (r) => {
    role = r
    expect((await call()).status).toBe(403)
  })

  it('refuses a caller with no org', async () => {
    orgId = null
    expect((await call()).status).toBe(403)
    expect(calls).toEqual([])
  })
})

describe('copilot analytics: org scoping', () => {
  it('scopes drafts through their thread with an inner join', async () => {
    await call()
    const drafts = calls.find((c) => c.table === 'communication_drafts')!
    const select = drafts.ops.find(([op]) => op === 'select')![1][0] as string
    expect(select).toContain('communication_threads!inner(org_id)')
    expect(drafts.ops).toContainEqual(['eq', ['communication_threads.org_id', 'org-1']])
  })

  it('scopes every copilot_knowledge read (title lookup and kb count) by org_id', async () => {
    await call()
    const kb = calls.filter((c) => c.table === 'copilot_knowledge')
    expect(kb.length).toBe(2)
    for (const c of kb) expect(c.ops).toContainEqual(['eq', ['org_id', 'org-1']])
  })
})

describe('copilot analytics: the draft cap', () => {
  it('capRows flags only a fetch that went past the cap', () => {
    expect(capRows([1, 2, 3], 3)).toEqual({ rows: [1, 2, 3], truncated: false })
    expect(capRows([1, 2, 3, 4], 3)).toEqual({ rows: [1, 2, 3], truncated: true })
  })

  it('asks for one row past the cap and reports truncated when it gets it', async () => {
    draftRows = Array.from({ length: DRAFT_CAP + 1 }, (_, i) => draft(i))
    const json = await (await call()).json()
    const drafts = calls.find((c) => c.table === 'communication_drafts')!
    expect(drafts.ops).toContainEqual(['limit', [DRAFT_CAP + 1]])
    expect(json.truncated).toBe(true)
    expect(json.draft_cap).toBe(DRAFT_CAP)
    expect(json.summary.total_generated).toBe(DRAFT_CAP)
  })

  it('is not truncated with exactly the cap', async () => {
    draftRows = Array.from({ length: DRAFT_CAP }, (_, i) => draft(i))
    const json = await (await call()).json()
    expect(json.truncated).toBe(false)
    expect(json.summary.total_generated).toBe(DRAFT_CAP)
  })
})
