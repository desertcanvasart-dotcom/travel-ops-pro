// A second company (ATS) went live beside Travel2Egypt on one install. These
// routes run on the service-role client — RLS does not apply — and read or
// acted on any id they were given, or listed every company's rows. Each test
// is two companies' fixtures: company A must never list, read, change or
// delete company B's.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, userId: 'ua1' as string | null }))
const gmail = vi.hoisted(() => ({ moves: [] as Array<[unknown, unknown, unknown]> }))
const notify = vi.hoisted(() => ({ calls: [] as unknown[] }))

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient(), supabaseServer: createMockClient() }))
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
vi.mock('@/lib/email/conversation-trash', () => ({
  moveThreadInGmail: async (...a: [unknown, unknown, unknown]) => { gmail.moves.push(a); return { ok: true } },
}))
vi.mock('@/lib/notifications', () => ({
  createNotification: async (n: unknown) => { notify.calls.push(n); return { success: true, notification: n } },
  createNotifications: async (ns: unknown[]) => { notify.calls.push(...ns); return ns.length },
}))

import * as emailConversations from '@/app/api/email/conversations/route'
import * as emailMessages from '@/app/api/email/messages/route'
import * as agents from '@/app/api/whatsapp/agents/route'
import * as draftById from '@/app/api/copilot/drafts/[id]/route'
import * as copilotInbox from '@/app/api/copilot/inbox/route'
import * as commitItinerary from '@/app/api/copilot/threads/[id]/commit-itinerary/route'
import * as notifications from '@/app/api/notifications/route'
import * as assign from '@/app/api/itineraries/[id]/assign/route'
import * as generateTasks from '@/app/api/itineraries/[id]/generate-tasks/route'
import * as profiles from '@/app/api/profiles/route'
import * as dayById from '@/app/api/itineraries/[id]/days/[dayId]/route'

const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://x${url}`, { method: init?.method ?? 'GET', ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}) })
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })

// Company A: logins ua1, ua2. Company B: ub1.
const MEMBERS = [
  { org_id: 'org-a', user_id: 'ua1', role: 'admin', created_at: '1' },
  { org_id: 'org-a', user_id: 'ua2', role: 'agent', created_at: '2' },
  { org_id: 'org-b', user_id: 'ub1', role: 'admin', created_at: '1' },
]
function tables(extra: Record<string, Record<string, unknown>[]> = {}) {
  setMockTables({
    organization_members: MEMBERS.map(m => ({ ...m })),
    organizations: [{ id: 'org-a' }, { id: 'org-b' }],
    email_conversations: [
      { id: 'ca', user_id: 'ua2', thread_id: 'ta', status: 'trashed', is_hidden: true },
      { id: 'ca-private', user_id: 'ua2', thread_id: 'tp', status: 'active', is_hidden: true },
      { id: 'cb', user_id: 'ub1', thread_id: 'tb', status: 'trashed', is_hidden: true },
    ],
    email_messages: [
      { id: 'ma', conversation_id: 'ca', thread_id: 'ta', sent_at: '1', body_text: 'A mail' },
      { id: 'mb', conversation_id: 'cb', thread_id: 'tb', sent_at: '1', body_text: 'B private mail' },
    ],
    // Each team member is one company's (team_members.org_id, 20261203).
    team_members: [
      { id: 'tm-a', org_id: 'org-a', user_id: 'ua2', name: 'A agent', is_active: true, is_available: true },
      { id: 'tm-b', org_id: 'org-b', user_id: 'ub1', name: 'B agent', is_active: true, is_available: true },
      { id: 'tm-none', org_id: 'org-b', user_id: null, name: 'B, no login', is_active: true, is_available: true },
    ],
    whatsapp_conversations: [
      { id: 'wa', org_id: 'org-a', assigned_team_member_id: 'tm-a' },
      { id: 'wb', org_id: 'org-b', assigned_team_member_id: 'tm-a' },
    ],
    communication_threads: [
      { id: 'th-a', org_id: 'org-a', channel: 'email' },
      { id: 'th-b', org_id: 'org-b', channel: 'email' },
      { id: 'th-null', org_id: null, channel: 'email' },
    ],
    communication_inbox: [
      { id: 'in-a', thread_id: 'th-a', message_body: 'A', received_at: '1' },
      { id: 'in-b', thread_id: 'th-b', message_body: 'B', received_at: '1' },
    ],
    communication_drafts: [
      { id: 'd-a', thread_id: 'th-a', inbox_message_id: 'in-a', status: 'pending' },
      { id: 'd-b', thread_id: 'th-b', inbox_message_id: 'in-b', status: 'pending' },
      { id: 'd-null', thread_id: 'th-null', inbox_message_id: 'in-b', status: 'pending' },
    ],
    itineraries: [
      { id: 'it-a', org_id: 'org-a', thread_id: 'th-a', itinerary_code: 'A-1', assigned_to: null },
      { id: 'it-b', org_id: 'org-b', thread_id: 'th-b', itinerary_code: 'B-1', assigned_to: null },
    ],
    itinerary_days: [
      { id: 'day-a', itinerary_id: 'it-a', city: 'Cairo' },
      { id: 'day-b', itinerary_id: 'it-b', city: 'Luxor' },
    ],
    user_profiles: [
      { id: 'ua1', email: 'ua1@a', role: 'admin', is_active: true, created_at: '1' },
      { id: 'ua2', email: 'ua2@a', role: 'agent', is_active: true, created_at: '2' },
      { id: 'ub1', email: 'ub1@b', role: 'admin', is_active: true, created_at: '3' },
    ],
    ...extra,
  })
}

beforeEach(() => {
  ctx.orgId = 'org-a'
  ctx.userId = 'ua1'
  gmail.moves.length = 0
  notify.calls.length = 0
  tables()
})

describe('email conversations by id (fix 3)', () => {
  it("GET messages: another company's conversation or thread is 404, never its bodies", async () => {
    const b = await emailMessages.GET(req('/api/email/messages?conversation_id=cb'))
    expect(b.status).toBe(404)
    const bt = await emailMessages.GET(req('/api/email/messages?thread_id=tb'))
    expect(bt.status).toBe(404)
    const a = await (await emailMessages.GET(req('/api/email/messages?conversation_id=ca'))).json()
    expect(a.messages.map((m: { id: string }) => m.id)).toEqual(['ma'])
    const at = await (await emailMessages.GET(req('/api/email/messages?thread_id=ta'))).json()
    expect(at.messages.map((m: { id: string }) => m.id)).toEqual(['ma'])
  })

  it("PATCH: another company's conversation is 404 and unchanged", async () => {
    const r = await emailConversations.PATCH(req('/api/email/conversations', { method: 'PATCH', body: { conversation_id: 'cb', action: 'archive' } }))
    expect(r.status).toBe(404)
    const r2 = await emailConversations.PATCH(req('/api/email/conversations', { method: 'PATCH', body: { conversation_id: 'cb', action: 'unhide' } }))
    expect(r2.status).toBe(404)
    expect(gmail.moves).toEqual([])
  })

  it("PATCH unhide restores only Communicate's Trash — never mail hidden to keep it private", async () => {
    const hidden = await emailConversations.PATCH(req('/api/email/conversations', { method: 'PATCH', body: { conversation_id: 'ca-private', action: 'unhide' } }))
    expect(hidden.status).toBe(404)
    expect(gmail.moves).toEqual([])
    const trashed = await emailConversations.PATCH(req('/api/email/conversations', { method: 'PATCH', body: { conversation_id: 'ca', action: 'unhide' } }))
    expect(trashed.status).toBe(200)
    expect((await trashed.json()).conversation).toMatchObject({ id: 'ca', is_hidden: false, status: 'active' })
    expect(gmail.moves).toEqual([['ua2', 'ta', 'untrash']])
  })

  it("DELETE: another company's conversation is 404 — not trashed here nor in its owner's Gmail", async () => {
    const r = await emailConversations.DELETE(req('/api/email/conversations?id=cb', { method: 'DELETE' }))
    expect(r.status).toBe(404)
    expect(gmail.moves).toEqual([])
    const own = await emailConversations.DELETE(req('/api/email/conversations?id=ca-private', { method: 'DELETE' }))
    expect(own.status).toBe(200)
    expect(gmail.moves).toEqual([['ua2', 'tp', 'trash']])
  })
})

describe('unused unsafe write handlers are gone (fix 4)', () => {
  it('POST conversations; POST, PUT, PATCH messages', () => {
    expect('POST' in emailConversations).toBe(false)
    expect('POST' in emailMessages).toBe(false)
    expect('PUT' in emailMessages).toBe(false)
    expect('PATCH' in emailMessages).toBe(false)
  })
})

describe('lists scoped to the caller org (fixes 1, 2, 23)', () => {
  const code = (f: string) => src(f).replace(/^\s*\/\/.*$/gm, '')
  it('Communicate lists only the org portal threads', () => {
    expect(code('app/api/unified/conversations/route.ts'))
      .toMatch(/from\('portal_message_threads'\)[\s\S]*?\.eq\('org_id', orgId\)[\s\S]*?portalQuery\.limit\(limit\)/)
  })
  it('every email list passes the caller org to the mailbox scope', () => {
    for (const f of ['app/api/unified/conversations/route.ts', 'app/api/email/conversations/route.ts', 'app/api/dashboard/summary/route.ts', 'app/api/dashboard/attention/route.ts', 'app/api/unified/client/[clientId]/route.ts']) {
      expect(code(f), f).toMatch(/scopedToConnectedMailboxes\(supabase, orgId,/)
    }
  })
  it('the dashboard follow-ups count is scoped through the client', () => {
    expect(code('app/api/dashboard/summary/route.ts'))
      .toMatch(/from\('client_followups'\)\s*\n\s*\.select\('id, due_date, clients!inner\(org_id\)'\)\s*\n\s*\.eq\('clients\.org_id', orgId\)/)
  })
})

describe('gmail send uses only the org stored conversation (fix 5)', () => {
  it('a thread stored only in another company mailbox is foreign: no guard, no stored threading', () => {
    const r = src('app/api/gmail/send/route.ts')
    expect(r).toContain('const inOrg = stored.filter(c => c.user_id && memberIds.includes(c.user_id))')
    expect(r).toContain('foreignThread = stored.length > 0 && !conv')
    expect(r).toContain('if (threadId && !foreignThread && !confirmDuplicate) {')
  })
})

describe('WhatsApp team members (fix 6)', () => {
  it("GET lists only the org's team — never another company's", async () => {
    const r = await (await agents.GET(req('/api/whatsapp/agents'))).json()
    expect(r.agents.map((a: { id: string }) => a.id)).toEqual(['tm-a'])
    // The login is not shown (the mock returns whole rows, so read the select).
    expect(src('app/api/whatsapp/agents/route.ts')).toMatch(/\.select\('id, name, email, phone, avatar_url, role, is_active/)
  })

  it("PATCH and DELETE of another company's member are 404 and change nothing", async () => {
    const p = await agents.PATCH(req('/api/whatsapp/agents', { method: 'PATCH', body: { id: 'tm-b', is_available: false } }))
    expect(p.status).toBe(404)
    const d = await agents.DELETE(req('/api/whatsapp/agents?id=tm-b', { method: 'DELETE' }))
    expect(d.status).toBe(404)
  })

  it("a member without a login is the company's that created it — another company's is 404", async () => {
    const p = await agents.PATCH(req('/api/whatsapp/agents', { method: 'PATCH', body: { id: 'tm-none', is_available: false } }))
    expect(p.status).toBe(404)
    ctx.orgId = 'org-b'
    ctx.userId = 'ub1'
    const own = await agents.PATCH(req('/api/whatsapp/agents', { method: 'PATCH', body: { id: 'tm-none', is_available: false } }))
    expect(own.status).toBe(200)
  })

  it("deactivating the org's member unassigns only the org's conversations", async () => {
    const d = await agents.DELETE(req('/api/whatsapp/agents?id=tm-a', { method: 'DELETE' }))
    expect(d.status).toBe(200)
    expect(src('app/api/whatsapp/agents/route.ts')).toMatch(/\.eq\('assigned_team_member_id', id\)\s*\n(\s*\/\/.*\n)*\s*\.eq\('org_id', orgId\)/)
  })
})

describe('copilot (fix 9, 10)', () => {
  it("a draft of another company's thread — or of a thread with no org — is 404", async () => {
    expect((await draftById.GET(req('/x'), params({ id: 'd-b' }))).status).toBe(404)
    expect((await draftById.GET(req('/x'), params({ id: 'd-null' }))).status).toBe(404)
    const own = await (await draftById.GET(req('/x'), params({ id: 'd-a' }))).json()
    expect(own.thread.id).toBe('th-a')
  })

  it("approving another company's draft is 404; approving your own records who reviewed it", async () => {
    const b = await draftById.PUT(req('/x', { method: 'PUT', body: { action: 'approve' } }), params({ id: 'd-b' }))
    expect(b.status).toBe(404)
    const a = await (await draftById.PUT(req('/x', { method: 'PUT', body: { action: 'approve' } }), params({ id: 'd-a' }))).json()
    expect(a.draft).toMatchObject({ status: 'approved', reviewed_by: 'ua1' })
  })

  it("another company's inbox messages are 404", async () => {
    expect((await copilotInbox.GET(req('/api/copilot/inbox?thread_id=th-b'))).status).toBe(404)
    const own = await (await copilotInbox.GET(req('/api/copilot/inbox?thread_id=th-a'))).json()
    expect(own.messages.map((m: { id: string }) => m.id)).toEqual(['in-a'])
  })

  it("the itinerary spawned from another company's thread is not read, and its brief cannot be committed here", async () => {
    const r = await (await commitItinerary.GET(req('/x'), params({ id: 'th-b' }))).json()
    expect(r.itinerary).toBeNull()
    expect((await commitItinerary.POST(req('/x', { method: 'POST' }), params({ id: 'th-b' }))).status).toBe(404)
  })

  it('every list and by-id copilot route is scoped (source)', () => {
    const code = (f: string) => src(f).replace(/^\s*\/\/.*$/gm, '')
    expect(code('app/api/copilot/threads/route.ts')).toContain(".eq('org_id', orgId)")
    expect(code('app/api/copilot/threads/count/route.ts')).toContain(".eq('communication_threads.org_id', orgId)")
    expect(code('app/api/copilot/drafts/route.ts')).toContain('copilotThreadInOrg<')
    expect(code('app/api/copilot/drafts/[id]/regenerate/route.ts')).toContain('copilotThreadInOrg<')
  })
})

describe('notifying a team member (fix 13, 14)', () => {
  it("POST /api/notifications to another company's team member is 404 and sends nothing", async () => {
    const r = await notifications.POST(req('/api/notifications', { method: 'POST', body: { team_member_id: 'tm-b', title: 'hi', type: 'task_assigned' } }))
    expect(r.status).toBe(404)
    expect(notify.calls).toEqual([])
  })

  it("assigning a trip to another company's team member is 404 and nobody is told", async () => {
    const r = await assign.PUT(req('/x', { method: 'PUT', body: { assigned_to: 'tm-b' } }), params({ id: 'it-a' }))
    expect(r.status).toBe(404)
    expect(notify.calls).toEqual([])
  })

  it("generating tasks for another company's team member is refused before anything is written", async () => {
    const r = await generateTasks.POST(req('/x', { method: 'POST', body: { assignments: { dept1: 'tm-b' } } }), params({ id: 'it-a' }))
    expect(r.status).toBe(404)
    expect((await r.json()).error).toMatch(/not a team member of this organization/)
    expect(notify.calls).toEqual([])
  })
})

describe('profiles (fix 18)', () => {
  it("lists only the org's members", async () => {
    const r = await (await profiles.GET(req('/api/profiles'))).json()
    expect(r.data.map((p: { id: string }) => p.id).sort()).toEqual(['ua1', 'ua2'])
  })
})

describe('itinerary day by id (fix 24)', () => {
  it("another company's day under your own itinerary id is 404 and unchanged", async () => {
    const r = await dayById.PUT(req('/x', { method: 'PUT', body: { city: 'Hacked' } }), params({ id: 'it-a', dayId: 'day-b' }))
    expect(r.status).toBe(404)
    const own = await dayById.PUT(req('/x', { method: 'PUT', body: { city: 'Giza' } }), params({ id: 'it-a', dayId: 'day-a' }))
    expect((await own.json()).data).toMatchObject({ id: 'day-a', city: 'Giza' })
  })
})
