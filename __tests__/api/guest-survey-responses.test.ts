// Guest surveys (Operate › Guest Surveys audit #4–#6).
//   #4 one link serves the whole party, and every submit replaced the
//      survey's answers: guest 2 erased guest 1. The public GET also echoed
//      the earlier guest's answers. Each submit is now its own response row,
//      and GET returns nobody's answers.
//   #5 a company without the guest questionnaire never gets a survey; the
//      list now says so instead of "none yet".
//   #6 the list stopped silently at 300; now it pages.
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
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => db.client }))
vi.mock('@/lib/auth/org-auth', () => ({
  orgAuth: async () => ({ error: null, status: 200, supabase: db.client, org_id: 'org-A', user: { id: 'u1' } }),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true }),
  getClientIdentifier: () => 'ip',
  rateLimitResponse: () => new Response(null, { status: 429 }),
}))

import { GET as publicGet, POST as publicPost } from '@/app/api/public/survey/[token]/route'
import { GET as staffGet } from '@/app/api/surveys/route'
import { attachResponses, overallSummary, surveyPageParam, MAX_RESPONSES_PER_SURVEY } from '@/lib/surveys/survey-responses'

const has = (ops: Op[], op: string) => ops.some(o => o.op === op)
const tokenParams = { params: Promise.resolve({ token: 'tok' }) } as never
const post = (body: unknown) =>
  publicPost(new NextRequest('http://x/api/public/survey/tok', { method: 'POST', body: JSON.stringify(body) }), tokenParams)

/** A tiny guest_surveys + guest_survey_responses store the routes write to. */
function store(survey: { id: string; org_id: string; status: string }) {
  const responses: Record<string, unknown>[] = []
  const surveyUpdates: Record<string, unknown>[] = []
  db.state.respond = (table, ops) => {
    if (table === 'guest_surveys') {
      const upd = ops.find(o => o.op === 'update')
      if (upd) { surveyUpdates.push(upd.args[0] as Record<string, unknown>); Object.assign(survey, upd.args[0]); return { error: null } }
      return { data: { ...survey, language: 'ja', trip_snapshot: { trip_name: 'Cairo', client_name: 'Yamada' }, responses: { ratings: { overall_satisfaction: 2 } } }, error: null }
    }
    if (table === 'guest_survey_responses') {
      const ins = ops.find(o => o.op === 'insert')
      if (ins) { responses.push(ins.args[0] as Record<string, unknown>); return { error: null } }
      return { count: responses.length, error: null }
    }
    return { data: null, error: null }
  }
  return { responses, surveyUpdates, survey }
}

beforeEach(() => { db.log.length = 0 })

describe('each guest’s answers are kept', () => {
  it('two submits on one link leave two responses, the first untouched', async () => {
    const s = store({ id: 's1', org_id: 'org-A', status: 'sent' })
    expect((await post({ ratings: { overall_satisfaction: 5 }, guest_name: 'Taro' })).status).toBe(200)
    expect((await post({ ratings: { overall_satisfaction: 3 }, guest_name: 'Hanako' })).status).toBe(200)
    expect(s.responses).toHaveLength(2)
    expect(s.responses[0]).toMatchObject({ survey_id: 's1', org_id: 'org-A', respondent_name: 'Taro', answers: { ratings: { overall_satisfaction: 5 } } })
    expect(s.responses[1]).toMatchObject({ respondent_name: 'Hanako', answers: { ratings: { overall_satisfaction: 3 } } })
    // The survey is never written with answers; it is marked submitted once.
    expect(s.surveyUpdates).toHaveLength(1)
    expect(s.surveyUpdates[0]).toMatchObject({ status: 'submitted' })
    expect(s.surveyUpdates[0]).not.toHaveProperty('responses')
  })

  it('refuses answers past the cap for one link', async () => {
    const s = store({ id: 's1', org_id: 'org-A', status: 'submitted' })
    for (let i = 0; i < MAX_RESPONSES_PER_SURVEY; i++) s.responses.push({})
    expect((await post({ ratings: {} })).status).toBe(409)
    expect(s.responses).toHaveLength(MAX_RESPONSES_PER_SURVEY)
  })

  it('GET says the survey was answered, but returns nobody’s answers', async () => {
    store({ id: 's1', org_id: 'org-A', status: 'submitted' })
    const body = await (await publicGet(new NextRequest('http://x'), tokenParams)).json()
    expect(body.data).toEqual({ language: 'ja', submitted: true, trip: { trip_name: 'Cairo', client_name: 'Yamada' } })
    const select = db.log.find(e => e.table === 'guest_surveys')!.ops.find(o => o.op === 'select')!.args[0]
    expect(select).not.toMatch(/responses/)
  })
})

describe('the staff list', () => {
  it('pages, reads each survey’s responses within the org, and says whether surveys are on', async () => {
    db.state.respond = (table, ops) => {
      if (table === 'guest_surveys') return { data: [{ id: 's1' }, { id: 's2' }], count: 120, error: null }
      if (table === 'guest_survey_responses') {
        return { data: [
          { id: 'r2', survey_id: 's1', respondent_name: null, answers: { ratings: { overall_satisfaction: 4 } }, submitted_at: '2026-05-02T00:00:00Z' },
          { id: 'r1', survey_id: 's1', respondent_name: 'Taro', answers: { ratings: { overall_satisfaction: 5 } }, submitted_at: '2026-05-01T00:00:00Z' },
        ], error: null }
      }
      if (table === 'organizations') return { data: { document_templates: ['ats-operations-sheet'] }, error: null }
      return { data: null, error: null }
    }
    const res = await staffGet(new NextRequest('http://x/api/surveys?page=3'))
    const body = await res.json()
    expect(body).toMatchObject({ success: true, total: 120, page: 3, pageSize: 50, enabled: false })
    expect(body.data[0].responses.map((r: { id: string }) => r.id)).toEqual(['r1', 'r2'])
    expect(body.data[1].responses).toEqual([])
    const surveys = db.log.find(e => e.table === 'guest_surveys')!.ops
    expect(surveys.find(o => o.op === 'range')!.args).toEqual([100, 149])
    expect(has(surveys, 'limit')).toBe(false)
    const resp = db.log.find(e => e.table === 'guest_survey_responses')!.ops
    expect(resp.some(o => o.op === 'eq' && o.args[0] === 'org_id' && o.args[1] === 'org-A')).toBe(true)
  })

  it('helpers: page param, grouping, and the overall mean of rated answers', () => {
    expect([surveyPageParam(null), surveyPageParam('0'), surveyPageParam('x'), surveyPageParam('4')]).toEqual([1, 1, 1, 4])
    expect(attachResponses([{ id: 'a' }], [])).toEqual([{ id: 'a', responses: [] }])
    expect(overallSummary([
      { answers: { ratings: { overall_satisfaction: 5 } } },
      { answers: { ratings: { overall_satisfaction: 4 } } },
      { answers: { ratings: { overall_satisfaction: 'na' } } },
      { answers: {} },
    ])).toEqual({ mean: 4.5, count: 2 })
    expect(overallSummary([{ answers: { ratings: { overall_satisfaction: 'na' } } }])).toBeNull()
  })
})
