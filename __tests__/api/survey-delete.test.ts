// Guest Surveys had no way to remove a survey. A trip deleted after its
// survey was made leaves the survey with itinerary_id NULL: the daily job
// never sends it and it stayed "Pending" for good (operator, 2026-10-19).
// An unanswered survey can now be deleted; one with guests' answers cannot.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Op = { op: string; args: unknown[] }
const db = vi.hoisted(() => {
  const log: { table: string; ops: { op: string; args: unknown[] }[] }[] = []
  const state = { respond: (() => ({ data: null, error: null })) as (table: string, ops: { op: string; args: unknown[] }[]) => any }
  function chain(table: string) {
    const entry = { table, ops: [] as { op: string; args: unknown[] }[] }
    log.push(entry)
    const proxy: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: any) => resolve(state.respond(table, entry.ops))
        if (prop === 'single' || prop === 'maybeSingle') {
          return async () => { entry.ops.push({ op: prop, args: [] }); return state.respond(table, entry.ops) }
        }
        return (...args: unknown[]) => { entry.ops.push({ op: prop, args }); return proxy }
      },
    })
    return proxy
  }
  return { log, state, client: { from: (t: string) => chain(t) } }
})
vi.mock('@/lib/auth/org-auth', () => ({
  orgAuth: async () => ({ error: null, status: 200, supabase: db.client, org_id: 'org-A', user: { id: 'u1' } }),
}))

import { DELETE } from '@/app/api/surveys/[id]/route'

const del = (id: string) => DELETE(new NextRequest(`http://x/api/surveys/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) })
const deletes = () => db.log.filter(e => e.table === 'guest_surveys' && e.ops.some((o: Op) => o.op === 'delete'))

/** answers: how many responses the survey has; owned: whether it is org-A's. */
function world({ answers, owned }: { answers: number; owned: boolean }) {
  db.state.respond = (table, ops) => {
    if (table === 'guest_survey_responses') return { count: answers, error: null }
    if (table === 'guest_surveys' && ops.some(o => o.op === 'delete')) {
      const scoped = ops.some(o => o.op === 'eq' && o.args[0] === 'org_id' && o.args[1] === 'org-A')
      return { data: owned && scoped ? { id: 's1' } : null, error: null }
    }
    return { data: null, error: null }
  }
}

beforeEach(() => { db.log.length = 0 })

describe('DELETE /api/surveys/[id]', () => {
  it('deletes an unanswered survey of the company', async () => {
    world({ answers: 0, owned: true })
    const res = await del('s1')
    expect(res.status).toBe(200)
    expect(deletes()).toHaveLength(1)
  })

  it('refuses one with guests’ answers, and deletes nothing', async () => {
    world({ answers: 2, owned: true })
    const res = await del('s1')
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/answers/)
    expect(deletes()).toHaveLength(0)
  })

  it('another company’s survey is not found', async () => {
    world({ answers: 0, owned: false })
    expect((await del('s1')).status).toBe(404)
  })

  it('counts answers within the company only', async () => {
    world({ answers: 0, owned: true })
    await del('s1')
    const count = db.log.find(e => e.table === 'guest_survey_responses')!
    expect(count.ops).toContainEqual({ op: 'eq', args: ['org_id', 'org-A'] })
    expect(count.ops).toContainEqual({ op: 'eq', args: ['survey_id', 's1'] })
  })
})
