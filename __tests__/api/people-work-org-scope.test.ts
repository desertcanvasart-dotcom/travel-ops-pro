// team_members, departments, tasks and notifications carry org_id since
// migration 20261203. These routes run on the service role — RLS does not
// apply — and listed, edited and deleted every company's staff, departments
// and tasks; the bell of a person in both companies showed both; the task
// reminder cron emailed from whichever company's mailbox came first. Two
// companies' fixtures: company A must never list, read, change or delete
// company B's, and everything A writes is stamped A.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { businessToday, shiftDateISO } from '@/lib/today'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, userId: 'ua1' as string | null }))
const mail = vi.hoisted(() => ({ sent: [] as Array<{ to: string; orgId?: string | null }> }))

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/supabase-server', () => {
  const withAuth = () => ({ ...createMockClient(), auth: { getUser: async () => ({ data: { user: { id: ctx.userId } } }) } })
  return { createServerClient: withAuth, supabaseServer: withAuth() }
})
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => ctx.userId,
    getCurrentUserRole: async () => 'admin',
    requireRole: async () => null,
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/email-send', () => ({
  sendEmailInternal: async (input: { to: string; orgId?: string | null }) => {
    mail.sent.push({ to: input.to, orgId: input.orgId })
    return { success: true }
  },
}))
vi.mock('@/lib/cron/auth', () => ({ cronAuthorized: () => true }))
vi.mock('@/lib/support/job-runs', () => ({
  withJobRun: (_name: string, _db: unknown, handler: (r: NextRequest) => Promise<Response>) => handler,
}))

import * as teamMembers from '@/app/api/team-members/route'
import * as teamMemberById from '@/app/api/team-members/[id]/route'
import * as departments from '@/app/api/departments/route'
import * as departmentById from '@/app/api/departments/[id]/route'
import * as tasks from '@/app/api/tasks/route'
import * as taskById from '@/app/api/tasks/[id]/route'
import * as notifications from '@/app/api/notifications/route'
import * as notificationById from '@/app/api/notifications/[id]/route'
import * as markAllRead from '@/app/api/notifications/mark-all-read/route'
import * as agents from '@/app/api/whatsapp/agents/route'
import * as waAssign from '@/app/api/whatsapp/conversations/assign/route'
import * as taskReminders from '@/app/api/cron/task-reminders/route'
import { createMockClient as db } from '../_mock-supabase'

const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://x${url}`, { method: init?.method ?? 'GET', ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}) })
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })
const ids = (rows: Array<{ id: string }>) => rows.map(r => r.id).sort()
const table = async (t: string) => (await db().from(t).select('*')).data as Array<Record<string, any>>

// The notification scope interpolates only uuids, so the person in both
// companies and their roster rows have real ones.
const BOTH = '00000000-0000-4000-8000-0000000000b0'
const TM_BOTH_A = '00000000-0000-4000-8000-0000000000ba'
const TM_BOTH_B = '00000000-0000-4000-8000-0000000000bb'

const today = businessToday()
const tomorrow = shiftDateISO(today, 1)

// Company A: ua1. Company B: ub1. BOTH is a member of both, with a
// team-members row in each (the migration's one row per company).
function tables() {
  setMockTables({
    organizations: [{ id: 'org-a' }, { id: 'org-b' }],
    organization_members: [
      { org_id: 'org-a', user_id: 'ua1', role: 'admin', created_at: '1' },
      { org_id: 'org-a', user_id: 'ua3', role: 'agent', created_at: '4' },
      { org_id: 'org-b', user_id: 'ub1', role: 'admin', created_at: '1' },
      { org_id: 'org-a', user_id: BOTH, role: 'agent', created_at: '2' },
      { org_id: 'org-b', user_id: BOTH, role: 'agent', created_at: '3' },
    ],
    user_profiles: [
      { id: 'ua1', email: 'ua1@a.test', full_name: 'A one' },
      { id: BOTH, email: 'both@x.test', full_name: 'Both' },
    ],
    departments: [
      { id: 'dep-a', org_id: 'org-a', name: 'Reservation', service_types: ['accommodation'], is_active: true },
      { id: 'dep-b', org_id: 'org-b', name: 'Aviation', service_types: ['flight'], is_active: true },
    ],
    team_members: [
      { id: 'tm-a', org_id: 'org-a', user_id: 'ua1', name: 'A one', email: 'ua1@a.test', is_active: true, is_available: true },
      { id: 'tm-b', org_id: 'org-b', user_id: 'ub1', name: 'B one', email: 'ub1@b.test', is_active: true, is_available: true },
      { id: TM_BOTH_A, org_id: 'org-a', user_id: BOTH, name: 'Both', email: 'both@x.test', is_active: true, is_available: true },
      { id: TM_BOTH_B, org_id: 'org-b', user_id: BOTH, name: 'Both', email: 'both@x.test', is_active: true, is_available: true },
    ],
    itineraries: [{ id: 'it-a', org_id: 'org-a' }, { id: 'it-b', org_id: 'org-b' }],
    clients: [{ id: 'cl-a', org_id: 'org-a' }],
    tasks: [
      { id: 'task-a', org_id: 'org-a', title: 'A', status: 'todo', archived: false, assigned_to: TM_BOTH_A, due_date: tomorrow,
        assigned_member: { id: TM_BOTH_A, org_id: 'org-a', user_id: BOTH, is_active: true, name: 'Both', email: 'both@x.test' } },
      { id: 'task-b', org_id: 'org-b', title: 'B', status: 'todo', archived: false, assigned_to: TM_BOTH_B, due_date: tomorrow,
        assigned_member: { id: TM_BOTH_B, org_id: 'org-b', user_id: BOTH, is_active: true, name: 'Both', email: 'both@x.test' } },
    ],
    notifications: [
      { id: 'n-a', org_id: 'org-a', user_id: BOTH, is_read: false, created_at: '2' },
      { id: 'n-b', org_id: 'org-b', user_id: BOTH, is_read: false, created_at: '1' },
      { id: 'n-b-roster', org_id: 'org-b', team_member_id: TM_BOTH_B, is_read: false, created_at: '3' },
    ],
    whatsapp_conversations: [{ id: 'wa', org_id: 'org-a', phone_number: '+1', client_name: 'Kenji' }],
  })
}

beforeEach(() => {
  ctx.orgId = 'org-a'
  ctx.userId = 'ua1'
  mail.sent.length = 0
  tables()
})

describe('team members', () => {
  it("lists only the company's own", async () => {
    const r = await (await teamMembers.GET(req('/api/team-members'))).json()
    expect(ids(r.data)).toEqual([TM_BOTH_A, 'tm-a'].sort())
  })

  it('a new member is stamped with the company; another company’s department is refused', async () => {
    const ok = await (await teamMembers.POST(req('/x', { method: 'POST', body: { name: 'New', department_id: 'dep-a' } }))).json()
    expect(ok.data).toMatchObject({ org_id: 'org-a', name: 'New', department_id: 'dep-a' })
    const bad = await teamMembers.POST(req('/x', { method: 'POST', body: { name: 'New', department_id: 'dep-b' } }))
    expect(bad.status).toBe(404)
  })

  it("another company's member is 404 — not read, edited or deactivated", async () => {
    expect((await teamMemberById.GET(req('/x'), params({ id: 'tm-b' }))).status).toBe(404)
    expect((await teamMemberById.PUT(req('/x', { method: 'PUT', body: { name: 'Hacked' } }), params({ id: 'tm-b' }))).status).toBe(404)
    expect((await teamMemberById.DELETE(req('/x', { method: 'DELETE' }), params({ id: 'tm-b' }))).status).toBe(404)
    const b = (await table('team_members')).find(m => m.id === 'tm-b')!
    expect(b).toMatchObject({ name: 'B one', is_active: true })
    // Moving your own member into another company's department is refused too.
    expect((await teamMemberById.PUT(req('/x', { method: 'PUT', body: { department_id: 'dep-b' } }), params({ id: 'tm-a' }))).status).toBe(404)
    expect((await teamMemberById.PUT(req('/x', { method: 'PUT', body: { name: 'A renamed' } }), params({ id: 'tm-a' }))).status).toBe(200)
  })
})

describe('WhatsApp agents (the same table)', () => {
  it('a new agent is the company’s; one without a login still can be created', async () => {
    const r = await (await agents.POST(req('/x', { method: 'POST', body: { name: 'No login' } }))).json()
    expect(r.agent).toMatchObject({ org_id: 'org-a', name: 'No login', user_id: null })
  })

  it("linking another company's login is refused", async () => {
    const r = await agents.POST(req('/x', { method: 'POST', body: { name: 'B', user_id: 'ub1' } }))
    expect(r.status).toBe(400)
    const own = await (await agents.POST(req('/x', { method: 'POST', body: { name: 'A', user_id: 'ua3' } }))).json()
    expect(own.agent).toMatchObject({ org_id: 'org-a', user_id: 'ua3' })
    // A login with a row in this company already gets no second one.
    expect((await agents.POST(req('/x', { method: 'POST', body: { name: 'Again', user_id: 'ua1' } }))).status).toBe(400)
  })

  it("an email used by another company's member does not block this one", async () => {
    const r = await agents.POST(req('/x', { method: 'POST', body: { name: 'Same address', email: 'ub1@b.test' } }))
    expect(r.status).toBe(200)
  })
})

describe('departments', () => {
  it("lists only the company's own", async () => {
    const r = await (await departments.GET(req('/api/departments'))).json()
    expect(ids(r.data)).toEqual(['dep-a'])
  })

  it('one owner per service type is per company — and a new department is stamped', async () => {
    // Company B owns 'flight'; company A may route it to its own department.
    const r = await departments.POST(req('/x', { method: 'POST', body: { name: 'Flights', service_types: ['flight'] } }))
    expect(r.status).toBe(201)
    expect((await r.json()).data).toMatchObject({ org_id: 'org-a', name: 'Flights' })
    // But not twice within the company.
    const again = await departments.POST(req('/x', { method: 'POST', body: { name: 'Hotels', service_types: ['accommodation'] } }))
    expect(again.status).toBe(400)
  })

  it("another company's department is 404 — not edited or deleted", async () => {
    expect((await departmentById.PUT(req('/x', { method: 'PUT', body: { name: 'Hacked' } }), params({ id: 'dep-b' }))).status).toBe(404)
    expect((await departmentById.DELETE(req('/x?reassign_to=none', { method: 'DELETE' }), params({ id: 'dep-b' }))).status).toBe(404)
    expect((await table('departments')).find(d => d.id === 'dep-b')).toMatchObject({ name: 'Aviation' })
  })
})

describe('tasks', () => {
  it("lists and counts only the company's own", async () => {
    const r = await (await tasks.GET(req('/api/tasks'))).json()
    expect(ids(r.data)).toEqual(['task-a'])
    expect(r.summary.total).toBe(1)
  })

  it('a new task is stamped; an assignee, department or trip of another company is refused', async () => {
    const ok = await (await tasks.POST(req('/x', { method: 'POST', body: { title: 'T', assigned_to: 'tm-a', department_id: 'dep-a', linked_type: 'itinerary', linked_id: 'it-a' } }))).json()
    expect(ok.data).toMatchObject({ org_id: 'org-a', title: 'T' })
    for (const body of [
      { title: 'T', assigned_to: 'tm-b' },
      { title: 'T', department_id: 'dep-b' },
      { title: 'T', linked_type: 'itinerary', linked_id: 'it-b' },
      { title: 'T', linked_type: 'nonsense', linked_id: 'it-a' },
    ]) {
      expect((await tasks.POST(req('/x', { method: 'POST', body }))).status, JSON.stringify(body)).toBe(404)
    }
  })

  it("another company's task is 404 — not read, edited or deleted", async () => {
    expect((await taskById.GET(req('/x'), params({ id: 'task-b' }))).status).toBe(404)
    expect((await taskById.PUT(req('/x', { method: 'PUT', body: { title: 'Hacked' } }), params({ id: 'task-b' }))).status).toBe(404)
    expect((await taskById.DELETE(req('/x', { method: 'DELETE' }), params({ id: 'task-b' }))).status).toBe(404)
    expect((await table('tasks')).find(t => t.id === 'task-b')).toMatchObject({ title: 'B' })
    // Re-assigning your own task to another company's member is refused.
    expect((await taskById.PUT(req('/x', { method: 'PUT', body: { assigned_to: 'tm-b' } }), params({ id: 'task-a' }))).status).toBe(404)
    expect((await taskById.PUT(req('/x', { method: 'PUT', body: { title: 'Mine' } }), params({ id: 'task-a' }))).status).toBe(200)
  })
})

describe('notifications: a person in both companies sees only the active one', () => {
  beforeEach(() => { ctx.userId = BOTH })

  it('the bell lists and counts the active company only', async () => {
    const a = await (await notifications.GET(req('/api/notifications'))).json()
    expect(ids(a.data)).toEqual(['n-a'])
    expect(a.unreadCount).toBe(1)
    ctx.orgId = 'org-b'
    const b = await (await notifications.GET(req('/api/notifications'))).json()
    expect(ids(b.data)).toEqual(['n-b', 'n-b-roster'])
  })

  it("marking and deleting another company's notification is 404; mark-all touches the active company only", async () => {
    expect((await notificationById.PUT(req('/x', { method: 'PUT', body: { is_read: true } }), params({ id: 'n-b' }))).status).toBe(404)
    expect((await notificationById.DELETE(req('/x', { method: 'DELETE' }), params({ id: 'n-b' }))).status).toBe(404)
    const r = await (await markAllRead.PUT(req('/x', { method: 'PUT' }))).json()
    expect(r.count).toBe(1)
    const rows = await table('notifications')
    expect(rows.find(n => n.id === 'n-a')!.is_read).toBe(true)
    expect(rows.filter(n => n.org_id === 'org-b').every(n => n.is_read === false)).toBe(true)
  })

  it('a notification sent from the screen is stamped with the active company', async () => {
    ctx.userId = 'ua1'
    const r = await notifications.POST(req('/x', { method: 'POST', body: { team_member_id: TM_BOTH_A, type: 'task_assigned', title: 'Hi', send_email: false } }))
    expect(r.status).toBe(200)
    expect((await r.json()).data).toMatchObject({ org_id: 'org-a', team_member_id: TM_BOTH_A })
    // Naming another company's task is refused.
    const bad = await notifications.POST(req('/x', { method: 'POST', body: { user_id: 'ua1', type: 'task_assigned', title: 'Hi', related_task_id: 'task-b' } }))
    expect(bad.status).toBe(404)
  })
})

describe('WhatsApp assignment notifies once, in the company', () => {
  it('one notification stamped with the company; no server-to-server fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await waAssign.POST(req('/x', { method: 'POST', body: { conversation_id: 'wa', team_member_id: TM_BOTH_A } }))
    expect(r.status).toBe(200)
    const rows = (await table('notifications')).filter(n => n.type === 'whatsapp_assigned')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ org_id: 'org-a', team_member_id: TM_BOTH_A, user_id: BOTH })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mail.sent).toEqual([{ to: 'both@x.test', orgId: 'org-a' }])
    fetchSpy.mockRestore()
  })

  it("another company's team member cannot be assigned", async () => {
    const r = await waAssign.POST(req('/x', { method: 'POST', body: { conversation_id: 'wa', team_member_id: 'tm-b' } }))
    expect(r.status).toBe(400)
    expect(await table('notifications')).toHaveLength(3)
  })
})

describe('task reminders cron', () => {
  it("each company's reminder is its own notification, emailed from its own mailbox", async () => {
    ctx.orgId = null
    ctx.userId = null
    const r = await (await taskReminders.GET(req('/api/cron/task-reminders'))).json()
    expect(r.results.dueSoon).toBe(2)
    const sent = (await table('notifications')).filter(n => n.type === 'task_due_soon')
    expect(sent.map(n => [n.related_task_id, n.org_id, n.team_member_id]).sort()).toEqual([
      ['task-a', 'org-a', TM_BOTH_A],
      ['task-b', 'org-b', TM_BOTH_B],
    ])
    expect(mail.sent.map(m => m.orgId).sort()).toEqual(['org-a', 'org-b'])
  })

  it("a task whose assignee is another company's row is not reminded", async () => {
    const rows = await table('tasks')
    rows.find(t => t.id === 'task-b')!.assigned_member.org_id = 'org-a'
    const r = await (await taskReminders.GET(req('/api/cron/task-reminders'))).json()
    expect(r.results.dueSoon).toBe(1)
  })
})

describe('the rest of the code paths are scoped (source)', () => {
  const code = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/^\s*\/\/.*$/gm, '')
  it('generate-tasks reads its own departments and tasks and stamps what it writes', () => {
    const c = code('app/api/itineraries/[id]/generate-tasks/route.ts')
    expect(c).toMatch(/from\('departments'\)\s*\n\s*\.select\('id, name, service_types'\)\s*\n\s*\.eq\('org_id', orgId\)/)
    expect(c).toMatch(/\.insert\(creates\.map\(\(\{ task, checklist \}\) => \(\{\s*\n\s*org_id: orgId,/)
    expect(c).toContain("update(fields).eq('id', action.id).eq('org_id', orgId)")
    expect(c).toMatch(/org_id: orgId,\s*\n\s*team_member_id: assigneeId,/)
  })
  it('lookups of "my team-members row" by login name the company', () => {
    expect(code('app/api/trip-events/route.ts')).toMatch(/\.eq\('user_id', user\?\.id \?\? ''\)\s*\n\s*\.eq\('org_id', org_id\)/)
    expect(code('app/api/itineraries/[id]/messages/route.ts')).toContain(".eq('user_id', a.user.id).eq('org_id', a.orgId)")
    expect(code('lib/portal/chat-reply.ts')).toMatch(/\.eq\('user_id', args\.userId\)\s*\n\s*\.eq\('org_id', args\.orgId\)/)
    expect(code('lib/email/own-address.ts')).toContain("db.from('team_members').select('email').eq('org_id', orgId)")
  })
  it('department routing reads only the company’s trips', () => {
    expect(code('app/api/departments/routing/route.ts')).toContain(".eq('itinerary_days.itineraries.org_id', orgId)")
  })
  it('every createNotification(s) caller names the organisation', () => {
    for (const f of [
      'app/api/itineraries/[id]/assign/route.ts',
      'app/api/cron/rate-change-digest/route.ts',
      'lib/notify-managers.ts',
    ]) expect(code(f), f).toMatch(/org_id: (orgId|org\.id),/)
  })
})
