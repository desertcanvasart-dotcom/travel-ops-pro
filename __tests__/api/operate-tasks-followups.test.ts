// Operate › Tasks and Operate › Follow-ups (audit claude/audit-operate).
// Two companies' fixtures (ATS = org-a, Travel2Egypt = org-b), one person in
// both. The mock answers like hosted PostgREST: a response carries at most
// 1000 rows, while count: 'exact' counts them all.
//
// Tasks: the summary cards are exact past 1000 tasks and describe one
// population (done tasks out of Due Today / High Priority as of Overdue); the
// list says how many matched; Archive Done archives every done task of the
// company; a deactivated member cannot be newly assigned; a failed save says so.
//
// Follow-ups: list, cards and every write go through /api/followups, scoped
// to the active company through the client and gated on the active company's
// role; notes show the saved description; snooze moves later from the due
// date; the filters offer everything the modal does; a follow-up due today
// gives its scheduler one in-app reminder.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { businessToday, shiftDateISO } from '@/lib/today'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, userId: 'u-both' as string | null, role: 'agent' }))
const mail = vi.hoisted(() => ({ sent: [] as unknown[] }))

const MAX_ROWS = 1000
// The mock's .limit() slices before counting; PostgREST counts first. Here
// limit only caps the rows returned, and every response is capped at max-rows.
function cappedClient() {
  const base = createMockClient()
  return {
    ...base,
    from: (table: string) => {
      const b = base.from(table)
      let lim = Infinity
      b.limit = (n: number) => ((lim = n), b)
      const then = b.then
      b.then = (ok: (r: unknown) => unknown, err: (e: unknown) => unknown) =>
        then((r: { data: unknown[] }) => ok({ ...r, data: r.data.slice(0, Math.min(lim, MAX_ROWS)) }), err)
      return b
    },
  }
}

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => cappedClient(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => cappedClient(), supabaseServer: cappedClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  const { roleAllows } = await import('@/lib/auth/roles')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => ctx.userId,
    getCurrentUserRole: async () => ctx.role,
    requireRole: async (allowed: string[]) =>
      roleAllows(ctx.role, allowed) ? null : NextResponse.json({ success: false }, { status: 403 }),
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/email-send', () => ({ sendEmailInternal: async (p: unknown) => { mail.sent.push(p); return { success: true } } }))
vi.mock('@/lib/cron/auth', () => ({ cronAuthorized: () => true }))
vi.mock('@/lib/support/job-runs', () => ({
  withJobRun: (_n: string, _db: unknown, handler: (r: NextRequest) => Promise<Response>) => handler,
}))

import * as tasks from '@/app/api/tasks/route'
import * as taskById from '@/app/api/tasks/[id]/route'
import * as archiveDone from '@/app/api/tasks/archive-done/route'
import * as followups from '@/app/api/followups/route'
import * as followupById from '@/app/api/followups/[id]/route'
import * as taskReminders from '@/app/api/cron/task-reminders/route'
import { taskSummary } from '@/lib/tasks/summary'
import { FOLLOWUP_PRIORITIES, FOLLOWUP_TYPES, snoozeDate } from '@/lib/followups'
import { INACTIVE_ASSIGNEE } from '@/lib/org-refs'

const TODAY = '2026-10-13'
const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://x${url}`, { method: init?.method ?? 'GET', ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const table = async (t: string) => (await createMockClient().from(t).select('*')).data as Array<Record<string, any>>
const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

const CL_A = { id: 'cl-a', org_id: 'org-a', client_code: 'A-1', first_name: 'Aki', last_name: 'Sato', email: 'a@x', phone: '1' }
const CL_B = { id: 'cl-b', org_id: 'org-b', client_code: 'B-1', first_name: 'Omar', last_name: 'Nabil', email: 'b@x', phone: '2' }
const fu = (id: string, client: typeof CL_A, due: string, extra: Record<string, unknown> = {}) =>
  ({ id, client_id: client.id, clients: client, followup_type: 'call', title: id, description: null, due_date: due, priority: 'medium', status: 'pending', ...extra })

function fixtures(taskRows: Array<Record<string, unknown>> = []) {
  setMockTables({
    organizations: [{ id: 'org-a' }, { id: 'org-b' }],
    organization_members: [
      { org_id: 'org-a', user_id: 'u-both', role: 'agent' },
      { org_id: 'org-b', user_id: 'u-both', role: 'agent' },
      { org_id: 'org-b', user_id: 'u-b', role: 'admin' },
    ],
    team_members: [
      { id: 'tm-a', org_id: 'org-a', is_active: true },
      { id: 'tm-gone', org_id: 'org-a', is_active: false },
    ],
    clients: [CL_A, CL_B],
    tasks: taskRows,
    client_followups: [
      fu('f-a-today', CL_A, TODAY, { priority: 'urgent', followup_type: 'payment_reminder', description: 'Ask about the deposit' }),
      fu('f-a-soon', CL_A, '2026-10-18'),
      fu('f-a-over', CL_A, '2026-10-01'),
      fu('f-a-done', CL_A, TODAY, { status: 'completed' }),
      fu('f-b-today', CL_B, TODAY),
    ],
    notifications: [],
  })
}

beforeEach(() => {
  ctx.orgId = 'org-a'
  ctx.userId = 'u-both'
  ctx.role = 'agent'
  mail.sent.length = 0
  fixtures()
})

// ---------------------------------------------------------------- Tasks

describe('tasks — summary cards and list (#2, #4)', () => {
  // 1500 open tasks plus a few of each kind, all of company A; one of B's.
  function many() {
    const rows: Array<Record<string, unknown>> = []
    for (let i = 0; i < 1500; i++) {
      rows.push({ id: `t${i}`, org_id: 'org-a', status: 'todo', priority: 'low', archived: false, due_date: '2026-11-01', created_at: String(i).padStart(5, '0') })
    }
    rows.push(
      { id: 'done-today-high', org_id: 'org-a', status: 'done', priority: 'high', archived: false, due_date: TODAY, created_at: '9' },
      { id: 'open-today-urgent', org_id: 'org-a', status: 'in_progress', priority: 'urgent', archived: false, due_date: TODAY, created_at: '9' },
      { id: 'open-overdue', org_id: 'org-a', status: 'todo', priority: 'medium', archived: null, due_date: '2026-10-01', created_at: '9' },
      { id: 'done-overdue', org_id: 'org-a', status: 'done', priority: 'medium', archived: false, due_date: '2026-10-01', created_at: '9' },
      { id: 'archived', org_id: 'org-a', status: 'done', priority: 'urgent', archived: true, due_date: TODAY, created_at: '9' },
      { id: 'other-company', org_id: 'org-b', status: 'todo', priority: 'urgent', archived: false, due_date: TODAY, created_at: '9' },
    )
    return rows
  }

  it('counts every task of the company exactly, past the 1000-row cap', async () => {
    fixtures(many())
    const s = await taskSummary(cappedClient(), 'org-a', TODAY)
    expect(s).toEqual({
      total: 1504, todo: 1501, in_progress: 1, done: 2,
      overdue: 1,          // done-overdue is not overdue
      due_today: 1,        // done-today-high is done: not "due today"
      high_priority: 1,    // nor high priority — the same open population
      archived: 1,
    })
  })

  it('the list says how many matched when it shows fewer', async () => {
    fixtures(many())
    const r = await (await tasks.GET(req(`/api/tasks?today=${TODAY}`))).json()
    expect(r.data).toHaveLength(1000)
    expect(r.matched).toBe(1504)
    expect(r.summary.total).toBe(1504)
  })

  it('the cards are count-only queries (no rows travel)', () => {
    const s = src('lib/tasks/summary.ts')
    expect(s).toMatch(/count: 'exact', head: true/)
    expect(src('app/api/tasks/route.ts')).not.toMatch(/allTasks/)
  })
})

describe('tasks — Archive Done archives every done task of the company (#5)', () => {
  it('whatever the filters; never the other company', async () => {
    fixtures([
      { id: 'd1', org_id: 'org-a', status: 'done', priority: 'low', archived: false },
      { id: 'd2', org_id: 'org-a', status: 'done', priority: 'high', archived: null },
      { id: 'open', org_id: 'org-a', status: 'todo', priority: 'high', archived: false },
      { id: 'db', org_id: 'org-b', status: 'done', priority: 'low', archived: false },
    ])
    const r = await (await archiveDone.POST()).json()
    expect(r).toMatchObject({ success: true, archived: 2 })
    const rows = await table('tasks')
    expect(rows.filter(t => t.archived === true).map(t => t.id).sort()).toEqual(['d1', 'd2'])
    expect(rows.find(t => t.id === 'db')!.archived).toBe(false)
  })

  it('a viewer is refused', async () => {
    ctx.role = 'viewer'
    expect((await archiveDone.POST()).status).toBe(403)
  })

  it('the screen calls it, and confirms with the company-wide count', () => {
    const page = src('app/tasks/page.tsx')
    expect(page).toMatch(/fetch\('\/api\/tasks\/archive-done', \{ method: 'POST' \}\)/)
    expect(page).toMatch(/const archivableDoneCount = summary\?\.done \?\? 0/)
  })
})

describe('tasks — a deactivated member cannot be newly assigned (#6)', () => {
  beforeEach(() => fixtures([{ id: 'task-old', org_id: 'org-a', title: 'Old', status: 'todo', assigned_to: 'tm-gone', archived: false }]))

  it('a new task for them is refused with a clear message', async () => {
    const r = await tasks.POST(req('/x', { method: 'POST', body: { title: 'T', assigned_to: 'tm-gone' } }))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe(INACTIVE_ASSIGNEE)
    expect((await tasks.POST(req('/x', { method: 'POST', body: { title: 'T', assigned_to: 'tm-a' } }))).status).toBe(200)
  })

  it('re-assigning to them is refused; editing a task they already hold is not', async () => {
    fixtures([
      { id: 'task-old', org_id: 'org-a', title: 'Old', status: 'todo', assigned_to: 'tm-gone', archived: false },
      { id: 'task-new', org_id: 'org-a', title: 'New', status: 'todo', assigned_to: 'tm-a', archived: false },
    ])
    expect((await taskById.PUT(req('/x', { method: 'PUT', body: { assigned_to: 'tm-gone' } }), params('task-new'))).status).toBe(400)
    expect((await taskById.PUT(req('/x', { method: 'PUT', body: { title: 'Renamed', assigned_to: 'tm-gone' } }), params('task-old'))).status).toBe(200)
  })
})

describe('tasks — a failed save is shown (#3)', () => {
  it('handleSubmit alerts the API error', () => {
    const page = src('app/tasks/page.tsx')
    const submit = page.slice(page.indexOf('const handleSubmit'), page.indexOf('const handleStatusChange'))
    expect(submit).toMatch(/\} else \{[\s\S]*dialog\.alert\(t\('saveFailed'\), data\?\.error \|\| t\('saveFailed'\)/)
  })
})

// ---------------------------------------------------------------- Follow-ups

describe('follow-ups — the active company only, on its role (#1, #2, #7)', () => {
  it("lists the active company's pending follow-ups and counts them on the server", async () => {
    const r = await (await followups.GET(req(`/api/followups?today=${TODAY}`))).json()
    expect(r.data.map((f: { id: string }) => f.id)).toEqual(['f-a-over', 'f-a-today', 'f-a-soon'])
    expect(r.data[1].client).toMatchObject({ first_name: 'Aki', client_code: 'A-1' })
    expect(r.counts).toEqual({ today: 1, week: 2, overdue: 1, total: 3 })
    ctx.orgId = 'org-b'
    const b = await (await followups.GET(req(`/api/followups?today=${TODAY}`))).json()
    expect(b.data.map((f: { id: string }) => f.id)).toEqual(['f-b-today'])
  })

  it('from/limit give the dashboard its upcoming few', async () => {
    const r = await (await followups.GET(req(`/api/followups?today=${TODAY}&from=${TODAY}&limit=1`))).json()
    expect(r.data.map((f: { id: string }) => f.id)).toEqual(['f-a-today'])
  })

  it('the role is the active company\'s membership role: a viewer is refused', async () => {
    ctx.role = 'viewer'
    expect((await followups.GET(req('/api/followups'))).status).toBe(403)
    expect((await followupById.PATCH(req('/x', { method: 'PATCH', body: { action: 'complete' } }), params('f-a-today'))).status).toBe(403)
  })

  it("another company's follow-up cannot be completed, snoozed, edited or deleted", async () => {
    for (const body of [{ action: 'complete' }, { action: 'snooze', days: 1 }, { priority: 'high' }]) {
      expect((await followupById.PATCH(req('/x', { method: 'PATCH', body }), params('f-b-today'))).status).toBe(404)
    }
    expect((await followupById.DELETE(req('/x', { method: 'DELETE' }), params('f-b-today'))).status).toBe(404)
    expect((await table('client_followups')).find(f => f.id === 'f-b-today')).toMatchObject({ status: 'pending', due_date: TODAY })
  })

  it('complete stamps who and when; delete removes', async () => {
    expect((await followupById.PATCH(req('/x', { method: 'PATCH', body: { action: 'complete' } }), params('f-a-today'))).status).toBe(200)
    expect((await table('client_followups')).find(f => f.id === 'f-a-today')).toMatchObject({ status: 'completed', completed_by: 'u-both' })
    expect((await followupById.DELETE(req('/x', { method: 'DELETE' }), params('f-a-soon'))).status).toBe(200)
    expect((await table('client_followups')).some(f => f.id === 'f-a-soon')).toBe(false)
  })

  it("a new follow-up must be for the company's client; its scheduler owns it", async () => {
    const body = { client_id: 'cl-a', followup_type: 'feedback', due_date: '2026-10-20', priority: 'urgent', title: 'Feedback - Aki', description: 'How was Kyoto?' }
    expect((await followups.POST(req('/x', { method: 'POST', body }))).status).toBe(200)
    expect((await table('client_followups')).find(f => f.title === 'Feedback - Aki')).toMatchObject({ assigned_to: 'u-both', status: 'pending', description: 'How was Kyoto?' })
    expect((await followups.POST(req('/x', { method: 'POST', body: { ...body, client_id: 'cl-b' } }))).status).toBe(404)
    expect((await followups.POST(req('/x', { method: 'POST', body: { ...body, followup_type: 'telepathy' } }))).status).toBe(400)
  })

  it('no screen writes or lists client_followups from the browser any more', () => {
    for (const f of ['app/followups/page.tsx', 'components/AddFollowupModal.tsx', 'app/dashboard/page.tsx']) {
      expect(src(f), f).not.toMatch(/from\('client_followups'\)/)
    }
    const client = src('app/clients/[id]/page.tsx')
    expect(client).not.toMatch(/from\('client_followups'\)\s*\.(update|insert|delete)/)
    expect(client).toMatch(/fetch\(`\/api\/followups\/\$\{followupId\}`/)
  })
})

describe('follow-ups — snooze moves later (#4)', () => {
  it('from the due date, or from today when already overdue', () => {
    expect(snoozeDate('2026-10-18', TODAY, 1)).toBe('2026-10-19')
    expect(snoozeDate('2026-10-23', TODAY, 7)).toBe('2026-10-30')
    expect(snoozeDate('2026-10-01', TODAY, 1)).toBe('2026-10-14')
    expect(snoozeDate(TODAY, TODAY, 7)).toBe('2026-10-20')
  })

  it('the route applies it and re-arms the reminder', async () => {
    const rows = await table('client_followups')
    rows.find(f => f.id === 'f-a-soon')!.reminder_sent = true
    await followupById.PATCH(req(`/x?today=${TODAY}`, { method: 'PATCH', body: { action: 'snooze', days: 1 } }), params('f-a-soon'))
    expect((await table('client_followups')).find(f => f.id === 'f-a-soon')).toMatchObject({ due_date: '2026-10-19', reminder_sent: false })
    expect((await followupById.PATCH(req('/x', { method: 'PATCH', body: { action: 'snooze', days: 0 } }), params('f-a-soon'))).status).toBe(400)
  })
})

describe('follow-ups — the screen (#3, #6)', () => {
  const page = src('app/followups/page.tsx')

  it('shows the saved notes (description), not a column that does not exist', () => {
    expect(page).toMatch(/followup\.description && \(/)
    expect(page).not.toMatch(/followup\.notes/)
  })

  it('filters offer every priority and type the modal does; urgent has its colour', () => {
    expect(page).toMatch(/FOLLOWUP_PRIORITIES\]\.reverse\(\)\.map/)
    expect(page).toMatch(/FOLLOWUP_TYPES\.map\(type =>/)
    expect([...FOLLOWUP_PRIORITIES]).toEqual(['low', 'medium', 'high', 'urgent'])
    const modal = src('components/AddFollowupModal.tsx')
    for (const type of FOLLOWUP_TYPES) expect(modal).toContain(`'${type}'`)
    expect(page).toMatch(/case 'urgent':\s*return 'bg-danger text-white/)
  })

  it('the cards are the server\'s counts', () => {
    expect(page).toMatch(/setStats\(result\.counts\)/)
  })
})

describe('follow-ups — due-day reminder (#5)', () => {
  beforeEach(() => {
    const today = businessToday()
    setMockTables({
      organizations: [{ id: 'org-a' }, { id: 'org-b' }],
      organization_members: [
        { org_id: 'org-a', user_id: 'u-both' },
        { org_id: 'org-b', user_id: 'u-both' },
      ],
      clients: [CL_A, CL_B],
      tasks: [],
      notifications: [],
      client_followups: [
        fu('due-a', CL_A, today, { assigned_to: 'u-both', send_reminder: true, reminder_sent: false }),
        fu('due-b', CL_B, today, { assigned_to: 'u-both', send_reminder: true, reminder_sent: false }),
        fu('tomorrow', CL_A, shiftDateISO(today, 1), { assigned_to: 'u-both', reminder_sent: false }),
        fu('muted', CL_A, today, { assigned_to: 'u-both', send_reminder: false }),
        fu('nobody', CL_A, today, { assigned_to: null }),
        fu('left', CL_A, today, { assigned_to: 'u-gone', reminder_sent: false }),
        fu('done', CL_A, today, { assigned_to: 'u-both', status: 'completed' }),
      ],
    })
  })

  it("one in-app notification per follow-up, in its client's company, never emailed", async () => {
    ctx.orgId = null
    const r = await (await taskReminders.GET(req('/api/cron/task-reminders'))).json()
    expect(r.results.followups).toBe(2)
    const sent = (await table('notifications')).filter(n => n.type === 'followup_due')
    expect(sent.map(n => [n.org_id, n.user_id, n.link]).sort()).toEqual([
      ['org-a', 'u-both', '/followups'],
      ['org-b', 'u-both', '/followups'],
    ])
    expect(mail.sent).toEqual([])
    const rows = await table('client_followups')
    expect(rows.filter(f => f.reminder_sent === true).map(f => f.id).sort()).toEqual(['due-a', 'due-b'])

    // Once per due date.
    const again = await (await taskReminders.GET(req('/api/cron/task-reminders'))).json()
    expect(again.results.followups).toBe(0)
  })
})
