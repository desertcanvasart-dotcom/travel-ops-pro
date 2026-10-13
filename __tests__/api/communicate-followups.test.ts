// The five Communicate gaps left after the audit, closed:
//   1. a notification link opens its conversation however old it is;
//   2. assigning an email conversation notifies the assignee;
//   3. Copilot drafts are written on the server, not by an open screen;
//   4. notification email choices are kept per company;
//   5. the landing page no longer sells an AI agent drawer that doesn't exist.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, userId: 'ua1' as string | null, role: 'admin', cronOk: true }))
const notify = vi.hoisted(() => vi.fn(async (_n: Record<string, unknown>) => ({ success: true, emailed: false })))
const drafter = vi.hoisted(() => vi.fn(async (_db: unknown, _i: Record<string, unknown>) => ({ ok: true, draft: {}, alreadyExisted: false })))

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient() }))
vi.mock('@/lib/supabase-secure', () => ({
  getAuthenticatedUser: async () => (ctx.userId ? { user: { id: ctx.userId }, error: null } : { user: null, error: 'no' }),
}))
vi.mock('@/lib/auth/current-org', async () => {
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
vi.mock('@/lib/notifications', () => ({ createNotification: notify }))
vi.mock('@/lib/cron/auth', () => ({ cronAuthorized: () => ctx.cronOk, internalCronToken: () => 't' }))
vi.mock('@/lib/support/job-runs', () => ({ withJobRun: (_n: string, _db: unknown, h: unknown) => h }))
vi.mock('@/lib/copilot/generate-draft', () => ({ draftForInboxMessage: drafter }))
vi.mock('@/lib/gmail', () => ({ getAuthenticatedGmail: async () => null, GmailAuthError: class extends Error {} }))
vi.mock('@/lib/email/connected-mailboxes', () => ({
  scopedToConnectedMailboxes: (_db: unknown, _org: string, build: (f: string) => unknown) =>
    build('is_hidden.is.null,is_hidden.eq.false'),
}))

import { preferencesForOrg, withOrgPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/notification-preferences'
import { assignmentNeedsNotice } from '@/lib/email/assignment-notice'
import * as prefsRoute from '@/app/api/settings/notifications/route'
import * as emailConversations from '@/app/api/email/conversations/route'
import * as unified from '@/app/api/unified/conversations/route'
import * as copilotCron from '@/app/api/cron/copilot-drafts/route'
import { CRON_JOBS } from '@/lib/cron/scheduler'
import { JOB_NAMES, SCHEDULED_IN_PROCESS } from '@/lib/support/job-names.mjs'

const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://x${url}`, { method: init?.method ?? 'GET', ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}) })
const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const rows = async (t: string) => (await createMockClient().from(t).select('*')).data as Array<Record<string, any>>

const OLD_EMAIL = '30000000-0000-4000-8000-000000000001'
const OTHER_CO_EMAIL = '30000000-0000-4000-8000-000000000002'
const recent = new Date().toISOString()
const longAgo = new Date(Date.now() - 5 * 86_400_000).toISOString()

function tables() {
  setMockTables({
    team_members: [
      { id: 'tm-a1', org_id: 'org-a', user_id: 'ua1', name: 'Boss', is_active: true },
      { id: 'tm-a2', org_id: 'org-a', user_id: 'ua2', name: 'Hana', is_active: true },
      { id: 'tm-b1', org_id: 'org-b', user_id: 'ub1', name: 'Other', is_active: true },
    ],
    email_conversations: [
      { id: 'em-1', org_id: 'org-a', user_id: 'ua1', thread_id: 't1', status: 'active', is_hidden: false, client_name: 'Sato', client_email: 'sato@x.test', subject: 'Kyoto in May', assigned_team_member_id: null, last_message_at: recent },
      { id: OLD_EMAIL, org_id: 'org-a', user_id: 'ua1', thread_id: 't2', status: 'archived', is_hidden: false, client_name: 'Old', client_email: 'old@x.test', subject: 'Last year', last_message_at: '2025-01-01T00:00:00Z' },
      { id: OTHER_CO_EMAIL, org_id: 'org-b', user_id: 'ub1', thread_id: 't3', status: 'active', is_hidden: false, client_name: 'Theirs', last_message_at: recent },
    ],
    whatsapp_conversations: [],
    portal_message_threads: [],
    trip_messages: [],
    itineraries: [],
    clients: [],
    user_settings: [],
    communication_inbox: [
      { id: 'in-1', thread_id: 'th-a', status: 'draft_pending', received_at: recent },
      { id: 'in-2', thread_id: 'th-b', status: 'draft_pending', received_at: recent },
      { id: 'in-old', thread_id: 'th-a', status: 'draft_pending', received_at: longAgo },
      { id: 'in-done', thread_id: 'th-a', status: 'draft_ready', received_at: recent },
      { id: 'in-new', thread_id: 'th-a', status: 'new', received_at: recent },
    ],
    communication_threads: [{ id: 'th-a', org_id: 'org-a' }, { id: 'th-b', org_id: 'org-b' }],
  })
}

beforeEach(() => {
  ctx.orgId = 'org-a'; ctx.userId = 'ua1'; ctx.role = 'admin'; ctx.cronOk = true
  notify.mockClear(); drafter.mockClear()
  tables()
})

describe('1. a notification link opens its conversation however old', () => {
  it('the inbox API returns one conversation by id, even outside the newest loaded', async () => {
    const res = await unified.GET(req(`/api/unified/conversations?conversation_id=${OLD_EMAIL}`))
    const body = await res.json()
    expect(body.conversations.map((c: any) => c.id)).toEqual([OLD_EMAIL])
  })

  it('never another company’s, and a malformed id finds nothing', async () => {
    const theirs = await (await unified.GET(req(`/api/unified/conversations?conversation_id=${OTHER_CO_EMAIL}`))).json()
    expect(theirs.conversations).toEqual([])
    const bad = await unified.GET(req(`/api/unified/conversations?conversation_id=em-1'),or(id.neq.x`))
    expect(bad.status).toBe(200)
    expect((await bad.json()).conversations).toEqual([])
  })

  it('the list looks the conversation up when it is not loaded', () => {
    const s = src('components/unified/UnifiedConversationList.tsx')
    expect(s).toContain('/api/unified/conversations?conversation_id=')
  })
})

describe('2. assigning an email conversation notifies the assignee', () => {
  it('only a real change to someone needs a notice', () => {
    expect(assignmentNeedsNotice(null, 'tm-a2')).toBe(true)
    expect(assignmentNeedsNotice('tm-a1', 'tm-a2')).toBe(true)
    expect(assignmentNeedsNotice('tm-a2', 'tm-a2')).toBe(false)
    expect(assignmentNeedsNotice('tm-a2', null)).toBe(false)
  })

  it('notifies a colleague, with a link that opens the conversation', async () => {
    const res = await emailConversations.PATCH(req('/api/email/conversations', {
      method: 'PATCH', body: { conversation_id: 'em-1', action: 'assign', assigned_team_member_id: 'tm-a2' },
    }))
    expect(res.status).toBe(200)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toMatchObject({
      org_id: 'org-a', user_id: 'ua2', team_member_id: 'tm-a2', type: 'email_assigned',
      link: '/communications?conversation=em-1',
    })
    expect(String(notify.mock.calls[0][0].message)).toContain('Sato')
  })

  it('no notice for assigning to yourself, or unassigning', async () => {
    await emailConversations.PATCH(req('/api/email/conversations', {
      method: 'PATCH', body: { conversation_id: 'em-1', action: 'assign', assigned_team_member_id: 'tm-a1' },
    }))
    await emailConversations.PATCH(req('/api/email/conversations', {
      method: 'PATCH', body: { conversation_id: 'em-1', action: 'unassign' },
    }))
    expect(notify).not.toHaveBeenCalled()
  })

  it('the type has a label, icon and email style', () => {
    expect(JSON.parse(src('messages/en.json')).notifications.types.email_assigned).toBeTruthy()
    expect(JSON.parse(src('messages/ja.json')).notifications.types.email_assigned).toBeTruthy()
    expect(src('lib/notifications.ts')).toContain('email_assigned:')
    expect(src('components/NotificationBell.tsx')).toContain("case 'email_assigned'")
  })
})

describe('3. Copilot drafts are written on the server', () => {
  it('drafts every company’s waiting messages, scoped to each thread’s company', async () => {
    const res = await copilotCron.GET(req('/api/cron/copilot-drafts'))
    expect(await res.json()).toMatchObject({ ok: true, drafted: 2, failed: 0 })
    const calls = drafter.mock.calls.map(c => c[1])
    expect(calls.map(c => c.inboxMessageId).sort()).toEqual(['in-1', 'in-2'])
    expect(calls.find(c => c.inboxMessageId === 'in-2')).toMatchObject({ orgId: 'org-b', tone: 'professional', pregenerated: true })
  })

  it('leaves old, drafted and deliberate (concierge) messages alone', async () => {
    await copilotCron.GET(req('/api/cron/copilot-drafts'))
    const ids = drafter.mock.calls.map(c => c[1].inboxMessageId)
    expect(ids).not.toContain('in-old')
    expect(ids).not.toContain('in-done')
    expect(ids).not.toContain('in-new')
  })

  it('one failure does not stop the rest', async () => {
    drafter.mockImplementationOnce(async () => { throw new Error('model down') })
    const body = await (await copilotCron.GET(req('/api/cron/copilot-drafts'))).json()
    expect(body).toMatchObject({ drafted: 1, failed: 1 })
  })

  it('fails closed without the cron credential', async () => {
    ctx.cronOk = false
    expect((await copilotCron.GET(req('/api/cron/copilot-drafts'))).status).toBe(401)
    expect(drafter).not.toHaveBeenCalled()
  })

  it('runs every minute in-process, and the browser poller is gone', () => {
    expect(CRON_JOBS.find(j => j.name === 'copilot-drafts')?.schedule).toBe('* * * * *')
    expect(JOB_NAMES).toContain('copilot-drafts')
    expect(SCHEDULED_IN_PROCESS).toContain('copilot-drafts')
    expect(existsSync(join(process.cwd(), 'lib/hooks/use-copilot-poller.ts'))).toBe(false)
    expect(src('app/copilot/page.tsx')).not.toContain('useCopilotPoller')
    expect(src('app/api/copilot/drafts/route.ts')).toContain('draftForInboxMessage')
  })
})

describe('4. notification email choices are per company', () => {
  it('a company with no choice of its own starts from the one saved before', () => {
    const stored = { ...DEFAULT_NOTIFICATION_PREFERENCES, email_enabled: false }
    expect(preferencesForOrg(stored, 'org-a').email_enabled).toBe(false)
    const split = withOrgPreferences(stored, 'org-b', { ...DEFAULT_NOTIFICATION_PREFERENCES, email_enabled: true })
    expect(preferencesForOrg(split, 'org-b').email_enabled).toBe(true)
    expect(preferencesForOrg(split, 'org-a').email_enabled).toBe(false)
  })

  it('saving in one company leaves the other as it was', async () => {
    const off = { ...DEFAULT_NOTIFICATION_PREFERENCES, email_enabled: false }
    ctx.orgId = 'org-a'
    expect((await prefsRoute.PUT(req('/api/settings/notifications', { method: 'PUT', body: off }))).status).toBe(200)
    ctx.orgId = 'org-b'
    await prefsRoute.PUT(req('/api/settings/notifications', { method: 'PUT', body: { ...off, email_enabled: true, task_overdue: false } }))

    ctx.orgId = 'org-a'
    expect(await (await prefsRoute.GET(req('/api/settings/notifications'))).json()).toMatchObject({ email_enabled: false, task_overdue: true })
    ctx.orgId = 'org-b'
    expect(await (await prefsRoute.GET(req('/api/settings/notifications'))).json()).toMatchObject({ email_enabled: true, task_overdue: false })
    expect((await rows('user_settings')).filter(r => r.user_id === 'ua1')).toHaveLength(1)
  })

  it('the send path reads the choice of the notification’s company', () => {
    expect(src('lib/notifications.ts')).toContain('getNotificationPreferences(supabaseAdmin, prefsUserId, org_id)')
  })
})

describe('5. the landing page describes what exists', () => {
  it('no AI agent drawer, live-availability replies or multi-variant suggestions', () => {
    const s = src('app/page.tsx')
    expect(s).not.toContain('draft drawer')
    expect(s).not.toContain('checks live')
    expect(s).not.toContain('Multi-variant reply')
    expect(src('app/(public)/docs/capacity-departures/page.tsx')).not.toContain('replies accurately')
  })
})
