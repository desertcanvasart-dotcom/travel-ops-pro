// Communicate's Unified Inbox, the WhatsApp inbox and their agents (audit
// U4, U6–U12): what each screen did silently wrong, pinned here.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, userId: 'ua1' as string | null, role: 'admin', limited: false }))
const gmail = vi.hoisted(() => ({ modify: vi.fn(async (_a: unknown) => ({})), mailboxOrg: 'org-a' }))

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { roleAllows } = await import('@/lib/auth/roles')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => ctx.userId,
    getCurrentUserRole: async () => ctx.role,
    requireRole: async (allowed: string[]) =>
      roleAllows(ctx.role, allowed) ? null : NextResponse.json({ success: false, error: 'Forbidden — insufficient role' }, { status: 403 }),
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/rate-limit/ai-limit', () => ({
  guardAiRate: async () => (ctx.limited ? NextResponse.json({ success: false, error: 'Too many' }, { status: 429 }) : null),
}))
const generate = vi.hoisted(() => vi.fn())
vi.mock('@/lib/ai/whatsapp-ai-agent', () => ({
  WhatsAppAIAgent: class {
    gatherContext = async () => ({})
    generateResponse = generate
  },
}))
vi.mock('@/lib/gmail', () => ({
  getAuthenticatedGmail: async () => ({
    orgId: gmail.mailboxOrg,
    gmail: { users: { threads: { modify: gmail.modify, trash: vi.fn(), untrash: vi.fn() } } },
  }),
  GmailAuthError: class extends Error {},
}))
// The org's connected mailboxes (tested in connected-mailboxes.test): every
// stored conversation here is a connected one.
vi.mock('@/lib/email/connected-mailboxes', () => ({
  scopedToConnectedMailboxes: (_db: unknown, _org: string, build: (f: string) => unknown) =>
    build('is_hidden.is.null,is_hidden.eq.false,is_hidden.eq.true'),
}))

import { bookingThreadsPassFilters, channelCounts } from '@/lib/unified/inbox-filters'
import { createClientHref } from '@/lib/unified/create-client-link'
import { openChatsByMember, orgLoginForEmail, whatsappRevival } from '@/lib/whatsapp-org'
import { labelThreadInGmail } from '@/lib/email/conversation-trash'
import * as agents from '@/app/api/whatsapp/agents/route'
import * as emailConversations from '@/app/api/email/conversations/route'
import * as unified from '@/app/api/unified/conversations/route'
import * as draft from '@/app/api/whatsapp/ai-agent/draft/route'
import * as tripMessages from '@/app/api/itineraries/[id]/messages/route'

const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://x${url}`, { method: init?.method ?? 'GET', ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}) })
const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const rows = async (t: string) => (await createMockClient().from(t).select('*')).data as Array<Record<string, any>>

function tables() {
  setMockTables({
    organizations: [{ id: 'org-a', whatsapp_ai_enabled: true }, { id: 'org-b' }],
    organization_members: [
      { org_id: 'org-a', user_id: 'ua1', role: 'admin' },
      { org_id: 'org-a', user_id: 'ua2', role: 'agent' },
      { org_id: 'org-b', user_id: 'ub1', role: 'admin' },
    ],
    user_profiles: [
      { id: 'ua1', email: 'boss@a.test' },
      { id: 'ua2', email: 'Hana@A.test' },
      { id: 'ub1', email: 'other@b.test' },
    ],
    team_members: [
      { id: 'tm-a1', org_id: 'org-a', user_id: 'ua1', name: 'Boss', email: 'boss@a.test', is_active: true, is_available: true, current_conversations: 41 },
      { id: 'tm-b1', org_id: 'org-b', user_id: 'ub1', name: 'Other', email: 'other@b.test', is_active: true, is_available: true },
    ],
    whatsapp_conversations: [
      { id: 'wa-1', org_id: 'org-a', assigned_team_member_id: 'tm-a1', status: 'active', is_hidden: false, phone_number: '+1', last_message_at: '2026-10-01' },
      { id: 'wa-2', org_id: 'org-a', assigned_team_member_id: 'tm-a1', status: 'archived', is_hidden: false, phone_number: '+2', last_message_at: '2026-10-02' },
      { id: 'wa-3', org_id: 'org-a', assigned_team_member_id: 'tm-a1', status: 'active', is_hidden: true, phone_number: '+3', last_message_at: '2026-10-03' },
      { id: 'wa-4', org_id: 'org-a', assigned_team_member_id: null, status: 'active', is_hidden: false, phone_number: '+4', last_message_at: '2026-10-04' },
    ],
    portal_message_threads: [
      { id: 'pt-1', org_id: 'org-a', booking_id: 'bk-1', passenger_id: null, last_message_at: '2026-10-05', last_sender: 'customer',
        booking: { id: 'bk-1', booking_code: 'BK-001', trip_name: 'Kyoto', client_name: 'Sato', client_email: 'sato@x.test' } },
    ],
    trip_messages: [],
    email_conversations: [
      { id: 'em-1', org_id: 'org-a', user_id: 'ua1', thread_id: 't-1', status: 'active', is_hidden: false, unread_count: 2, client_email: 'c@x.test', last_message_at: '2026-10-06' },
      { id: 'em-2', org_id: 'org-a', user_id: 'ua1', thread_id: 't-2', status: 'archived', is_hidden: false, unread_count: 0, client_email: 'd@x.test', last_message_at: '2026-10-07' },
      { id: 'em-b', org_id: 'org-b', user_id: 'ub1', thread_id: 't-b', status: 'active', is_hidden: false, unread_count: 1, client_email: 'e@x.test', last_message_at: '2026-10-08' },
    ],
    whatsapp_messages: [{ conversation_id: 'wa-1', direction: 'inbound', message_body: 'Hello', sent_at: '2026-10-01' }],
    itineraries: [{ id: 'it-a', org_id: 'org-a' }],
  })
}

beforeEach(() => {
  ctx.orgId = 'org-a'
  ctx.userId = 'ua1'
  ctx.role = 'admin'
  ctx.limited = false
  gmail.mailboxOrg = 'org-a'
  gmail.modify.mockClear()
  generate.mockReset()
  tables()
})

describe('U12 unified inbox filters and tab counts', () => {
  it('portal and trip threads have no status or assignee: only All statuses / Active, never Unassigned', () => {
    expect(bookingThreadsPassFilters({ status: 'all', unassignedOnly: false })).toBe(true)
    expect(bookingThreadsPassFilters({ status: 'active', unassignedOnly: false })).toBe(true)
    expect(bookingThreadsPassFilters({ status: 'archived', unassignedOnly: false })).toBe(false)
    expect(bookingThreadsPassFilters({ status: 'spam', unassignedOnly: false })).toBe(false)
    expect(bookingThreadsPassFilters({ status: 'all', unassignedOnly: true })).toBe(false)
  })

  it('counts every channel', () => {
    expect(channelCounts([{ channel: 'email' }, { channel: 'email' }, { channel: 'portal' }])).toEqual({
      all: 3, whatsapp: 0, email: 2, portal: 1, trip: 0,
    })
  })

  it('the Email tab still reports the other tabs’ counts', async () => {
    const r = await (await unified.GET(req('/api/unified/conversations?channel=email&status=active'))).json()
    expect(r.conversations.map((c: { id: string }) => c.id)).toEqual(['em-1'])
    // wa-1 and wa-4 active and shown (wa-3 hidden, wa-2 archived); the portal thread; em-1.
    expect(r.counts).toEqual({ all: 4, whatsapp: 2, email: 1, portal: 1, trip: 0 })
  })

  it('Archived lists the archived email and WhatsApp conversations — no portal thread', async () => {
    const r = await (await unified.GET(req('/api/unified/conversations?status=archived'))).json()
    expect(r.conversations.map((c: { id: string }) => c.id).sort()).toEqual(['em-2', 'wa-2'])
  })

  it('Unassigned leaves portal threads out', async () => {
    const r = await (await unified.GET(req('/api/unified/conversations?unassigned_only=true&status=active'))).json()
    expect(r.conversations.map((c: { id: string }) => c.id).sort()).toEqual(['em-1', 'wa-4'])
  })

  it('the list opens on Active, shows real status labels, and the page reads ?conversation=', () => {
    const list = src('components/unified/UnifiedConversationList.tsx')
    expect(list).toContain("status: 'active',")
    expect(list).toContain("<option value=\"active\">{t('statusActive')}</option>")
    expect(list).not.toContain("<option value=\"active\">{tCommon('status')}</option>")
    expect(list).toContain('setCounts(data.counts ?? null)')
    expect(list).toContain('onSelectConversation(target)')
    expect(src('app/communications/page.tsx')).toContain(".get('conversation')")
  })
})

describe('U7 archive and read state change the stored conversation', () => {
  it('archive sets status archived and archives the thread in its own mailbox', async () => {
    const r = await emailConversations.PATCH(req('/x', { method: 'PATCH', body: { conversation_id: 'em-1', action: 'archive' } }))
    expect(r.status).toBe(200)
    expect((await rows('email_conversations')).find(c => c.id === 'em-1')).toMatchObject({ status: 'archived' })
    expect(gmail.modify).toHaveBeenCalledWith({ userId: 'me', id: 't-1', requestBody: { removeLabelIds: ['INBOX'] } })
  })

  it('unarchive, mark read and mark unread update the list’s figures too', async () => {
    await emailConversations.PATCH(req('/x', { method: 'PATCH', body: { conversation_id: 'em-2', action: 'unarchive' } }))
    expect((await rows('email_conversations')).find(c => c.id === 'em-2')).toMatchObject({ status: 'active' })
    await emailConversations.PATCH(req('/x', { method: 'PATCH', body: { conversation_id: 'em-1', action: 'mark_read' } }))
    expect((await rows('email_conversations')).find(c => c.id === 'em-1')).toMatchObject({ unread_count: 0 })
    await emailConversations.PATCH(req('/x', { method: 'PATCH', body: { conversation_id: 'em-1', action: 'mark_unread' } }))
    expect((await rows('email_conversations')).find(c => c.id === 'em-1')).toMatchObject({ unread_count: 1 })
    expect(gmail.modify).toHaveBeenCalledWith({ userId: 'me', id: 't-1', requestBody: { addLabelIds: ['UNREAD'] } })
  })

  it('a mailbox now serving another company is not touched; the change here still stands, with a warning', async () => {
    gmail.mailboxOrg = 'org-b'
    const r = await (await emailConversations.PATCH(req('/x', { method: 'PATCH', body: { conversation_id: 'em-1', action: 'archive' } }))).json()
    expect(r.success).toBe(true)
    expect(r.warning).toMatch(/Gmail could not be updated/)
    expect(gmail.modify).not.toHaveBeenCalled()
    expect(await labelThreadInGmail('ua1', 't-1', 'archive', 'org-a')).toMatchObject({ ok: false })
  })

  it('another company’s conversation is 404', async () => {
    expect((await emailConversations.PATCH(req('/x', { method: 'PATCH', body: { conversation_id: 'em-b', action: 'archive' } }))).status).toBe(404)
  })

  it('new mail brings an archived conversation back, in the sync and the poll', () => {
    expect(src('lib/email/sync-mailbox.ts')).toContain("if (!r.is_hidden && r.status === 'archived') deletedConversations.add(r.id)")
    const poll = src('app/api/gmail/poll/route.ts')
    expect(poll).toMatch(/\.update\(\{ status: 'active' \}\)[\s\S]{0,120}\.eq\('status', 'archived'\)/)
  })

  it('the thread acts through the conversation route, not the viewer’s Gmail', () => {
    const thread = src('components/unified/UnifiedMessageThread.tsx')
    expect(thread).not.toContain('/api/gmail/actions')
    expect(thread).toContain("patchEmailConversation(archived ? 'unarchive' : 'archive')")
    expect(thread).toContain("patchEmailConversation('mark_read')")
    expect(thread).toContain("patchEmailConversation('mark_unread')")
  })
})

describe('U8 Create Client from a portal or trip thread', () => {
  const base = { subject: null as string | null }
  it('pre-fills the client’s email, never the booking code', () => {
    const href = createClientHref({ ...base, channel: 'portal', contact_info: 'BK-001', client_email: 'sato@x.test' }, 'Sato')
    const q = new URLSearchParams(href.split('?')[1])
    expect(q.get('email')).toBe('sato@x.test')
    expect(href).not.toContain('BK-001')
    const none = new URLSearchParams(createClientHref({ ...base, channel: 'trip', contact_info: 'IT-9', client_email: null }, '').split('?')[1])
    expect(none.has('email')).toBe(false)
  })

  it('WhatsApp gives the phone, email the address', () => {
    expect(createClientHref({ ...base, channel: 'whatsapp', contact_info: '+8190', client_email: null }, '')).toContain('phone=%2B8190')
    expect(createClientHref({ ...base, channel: 'email', contact_info: 'a@b.test', client_email: null }, '')).toContain('email=a%40b.test')
  })
})

describe('U4 / U10 agents', () => {
  it('open chats are counted from the conversations: active, shown, assigned', () => {
    const m = openChatsByMember([
      { assigned_team_member_id: 'a', status: 'active', is_hidden: false },
      { assigned_team_member_id: 'a', status: 'archived', is_hidden: false },
      { assigned_team_member_id: 'a', status: 'active', is_hidden: true },
      { assigned_team_member_id: 'b', status: 'active', is_hidden: null },
      { assigned_team_member_id: null, status: 'active', is_hidden: false },
    ])
    expect(Object.fromEntries(m)).toEqual({ a: 1, b: 1 })
  })

  it('the agents list carries the counted figure, has_login, and who "me" is', async () => {
    const r = await (await agents.GET(req('/api/whatsapp/agents'))).json()
    expect(r.agents).toHaveLength(1)
    expect(r.agents[0]).toMatchObject({ id: 'tm-a1', current_conversations: 1, has_login: true })
    expect(r.agents[0]).not.toHaveProperty('user_id')
    expect(r.current_team_member_id).toBe('tm-a1')
  })

  it('an agent added with a colleague’s email is linked to that login (case-insensitive)', async () => {
    const r = await (await agents.POST(req('/x', { method: 'POST', body: { name: 'Hana', email: 'hana@a.test' } }))).json()
    expect(r.agent).toMatchObject({ org_id: 'org-a', user_id: 'ua2' })
    expect(r.linked_login).toBe(true)
  })

  it('another company’s login is never linked; no match means no login', async () => {
    expect(await orgLoginForEmail(createMockClient(), 'org-a', 'other@b.test')).toBeNull()
    const r = await (await agents.POST(req('/x', { method: 'POST', body: { name: 'Temp', email: 'temp@x.test' } }))).json()
    expect(r.agent).toMatchObject({ org_id: 'org-a', user_id: null })
    expect(r.linked_login).toBe(false)
  })

  it('an agent switching a colleague’s availability is told why, not a 500', async () => {
    ctx.role = 'agent'
    ctx.userId = 'ua2'
    const r = await agents.PATCH(req('/x', { method: 'PATCH', body: { id: 'tm-a1', is_available: false } }))
    expect(r.status).toBe(403)
    expect((await r.json()).error).toBe('You can only change your own availability')
  })

  it('a new WhatsApp chat no longer bumps the stored counter', () => {
    expect(src('app/api/whatsapp/conversations/route.ts')).not.toMatch(/current_conversations: \(memberData/)
  })

  it('the modals and the WhatsApp inbox surface failures and know the current agent', () => {
    const list = src('components/unified/UnifiedConversationList.tsx')
    expect(list).toContain("setNotice({ tone: 'error', text: await failure(res, t('agentAddFailed')) })")
    const wa = src('app/whatsapp-inbox/page.tsx')
    expect(wa).toContain('setCurrentAgentId(data.current_team_member_id ?? null)')
    expect(wa).not.toContain('{agent.max_conversations}')
  })
})

describe('a deleted WhatsApp conversation comes back when the customer writes', () => {
  it('hidden or archived revives; blocked stays; an ordinary one is not written', () => {
    expect(whatsappRevival({ is_hidden: true, status: 'active' })).toEqual({ is_hidden: false, hidden_at: null, hidden_by: null })
    expect(whatsappRevival({ is_hidden: false, status: 'archived' })).toEqual({ status: 'active' })
    expect(whatsappRevival({ is_hidden: true, status: 'blocked' })).toBeNull()
    expect(whatsappRevival({ is_hidden: false, status: 'active' })).toBeNull()
  })

  it('the webhook applies it to the existing conversation', () => {
    const hook = src('app/api/whatsapp/webhook/route.ts')
    expect(hook).toContain(".select('id, is_hidden, status')")
    expect(hook).toContain('const revive = whatsappRevival(existingConversation)')
  })
})

describe('U9 send and assign failures are shown', () => {
  it('the thread says so instead of swallowing it', () => {
    const thread = src('components/unified/UnifiedMessageThread.tsx')
    expect(thread).toContain("setSendNotice(json?.error || t('sendFailed'))")
    expect(thread).toContain("setSendNotice(data.error || t('assignFailed'))")
    // The assign routes answer with their own row: the unified conversation is kept.
    expect(thread).toMatch(/onConversationUpdate\?\.\(\{\s*\.\.\.conversation,\s*assigned_team_member_id: agentId/)
  })
})

describe('U6 the WhatsApp AI draft route', () => {
  it('is rate-limited like the other draft endpoints, before any model run', async () => {
    ctx.limited = true
    const r = await draft.POST(req('/x', { method: 'POST', body: { conversationId: 'wa-1' } }))
    expect(r.status).toBe(429)
    expect(generate).not.toHaveBeenCalled()
  })

  it('runs when under the limit', async () => {
    generate.mockResolvedValue({ success: true, reply: 'Hi', confidence: 0.9, escalate: false, shouldRespond: true })
    const r = await draft.POST(req('/x', { method: 'POST', body: { conversationId: 'wa-1' } }))
    expect(r.status).toBe(200)
    expect(generate).toHaveBeenCalledOnce()
  })
})

describe('U11 and small role gaps', () => {
  it('a viewer cannot read a trip chat', async () => {
    ctx.role = 'viewer'
    const r = await tripMessages.GET(req('/x'), { params: Promise.resolve({ id: 'it-a' }) })
    expect(r?.status).toBe(403)
  })

  it('/api/settings/email and /api/partners are staff-only, reads included', () => {
    const mw = src('middleware.ts')
    const block = mw.match(/const STAFF_ONLY_API_PREFIXES = \[([\s\S]*?)\n\]/)![1]
    const prefixes = [...block.split('\n').filter(l => !l.trim().startsWith('//')).join('\n').matchAll(/'([^']+)'/g)].map(m => m[1])
    expect(prefixes).toContain('/api/settings/email')
    expect(prefixes).toContain('/api/partners')
  })

  it('Email Inbox: an agent is not sent to Settings (which bounces them) to connect Gmail', () => {
    const inbox = src('app/inbox/page.tsx')
    expect(inbox).toMatch(/\{isAgent \? \([\s\S]{0,200}Ask an admin or manager to connect Gmail/)
  })

  it('the not-connected sync message no longer sends an agent to Settings', () => {
    const list = src('components/unified/UnifiedConversationList.tsx')
    expect(list).not.toContain('Go to Settings > Email')
    expect(list).toContain("setSyncMessage(t('syncNotConnected'))")
  })
})
