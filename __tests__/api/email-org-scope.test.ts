// Email by company (migration 20261204). gmail_tokens, email_conversations,
// email_messages and email_templates carry org_id; the routes run on the
// service-role client (RLS does not apply) and must read, change and stamp
// only the caller's company's rows. Two companies' fixtures: ATS (org-a) must
// never see Travel2Egypt's (org-t) mail through any of these routes.
//
// The hotfix scoped mail by mailbox OWNER membership, so a person in both
// companies had their mailbox — and its mail — shown in both. Now a
// connection serves the one company it was connected for.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, userId: 'ua1' as string | null }))

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
vi.mock('@/lib/templates/template-scope', () => ({
  visibleToOrg: (orgId: string) => `org_id.eq.${orgId}`,
  orgReplacedDefaults: async () => [],
  withOrgCopies: (rows: unknown[]) => rows,
}))

import * as emailConversations from '@/app/api/email/conversations/route'
import * as emailMessages from '@/app/api/email/messages/route'
import * as leadsDismiss from '@/app/api/email/leads/dismiss/route'
import * as emailTemplates from '@/app/api/email/templates/route'
import * as unifiedClient from '@/app/api/unified/client/[clientId]/route'
import * as webOrders from '@/app/api/intake/web-orders/route'

const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://x${url}`, { method: init?.method ?? 'GET', ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}) })
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })
const ids = (rows: Array<{ id: string }>) => rows.map(r => r.id).sort()

// ATS: ua1. Travel2Egypt: ut1. 'both' is a member of both companies and
// connected their mailbox to Travel2Egypt.
function tables() {
  setMockTables({
    organization_members: [
      { org_id: 'org-a', user_id: 'ua1' }, { org_id: 'org-t', user_id: 'ut1' },
      { org_id: 'org-a', user_id: 'both' }, { org_id: 'org-t', user_id: 'both' },
    ],
    gmail_tokens: [
      { user_id: 'ua1', org_id: 'org-a', email: 'yoyaku@ats-hj.com' },
      { user_id: 'ut1', org_id: 'org-t', email: 'info@travel2egypt.org' },
      { user_id: 'both', org_id: 'org-t', email: 'owner@travel2egypt.org' },
    ],
    clients: [
      { id: 'cl-a', org_id: 'org-a', email: 'aiko@x.example', status: 'lead', lead_source: 'email' },
      { id: 'cl-t', org_id: 'org-t', email: 'taro@x.example', status: 'lead', lead_source: 'email' },
    ],
    email_conversations: [
      { id: 'ca', org_id: 'org-a', user_id: 'ua1', mailbox_email: 'yoyaku@ats-hj.com', thread_id: 'shared', status: 'active', is_hidden: false, client_id: 'cl-a', last_message_at: '2' },
      { id: 'ct', org_id: 'org-t', user_id: 'ut1', mailbox_email: 'info@travel2egypt.org', thread_id: 'shared', status: 'active', is_hidden: false, client_id: 'cl-t', last_message_at: '1' },
      // The person in both companies: their mailbox serves Travel2Egypt.
      { id: 'c-both', org_id: 'org-t', user_id: 'both', mailbox_email: 'owner@travel2egypt.org', thread_id: 'tb', status: 'active', is_hidden: false, client_id: null, last_message_at: '3' },
    ],
    email_messages: [
      { id: 'ma', org_id: 'org-a', conversation_id: 'ca', message_id: 'g1', thread_id: 'shared', sent_at: '1', body_text: 'ATS mail' },
      { id: 'mt', org_id: 'org-t', conversation_id: 'ct', message_id: 'g1', thread_id: 'shared', sent_at: '1', body_text: 'T2E private mail' },
    ],
    email_templates: [
      { id: 'tpl-a', org_id: 'org-a', user_id: 'both', name: 'ATS one' },
      { id: 'tpl-t', org_id: 'org-t', user_id: 'both', name: 'T2E one' },
    ],
    message_templates: [],
    whatsapp_conversations: [],
    web_order_intakes: [
      { id: 'wo-a', org_id: 'org-a', email_message_id: 'ma' },
      { id: 'wo-t', org_id: 'org-t', email_message_id: 'mt' },
    ],
    email_lead_dismissals: [],
    itineraries: [], b2c_quotes: [], invoices: [],
  })
}

beforeEach(() => {
  ctx.orgId = 'org-a'
  ctx.userId = 'ua1'
  tables()
})

describe('lists', () => {
  it("ATS lists only its own mail — never Travel2Egypt's, not even the mailbox of someone in both companies", async () => {
    const a = await (await emailConversations.GET(req('/api/email/conversations'))).json()
    expect(ids(a.conversations)).toEqual(['ca'])
    ctx.orgId = 'org-t'; ctx.userId = 'ut1'
    const t = await (await emailConversations.GET(req('/api/email/conversations'))).json()
    expect(ids(t.conversations)).toEqual(['c-both', 'ct'])
  })

  it("a client's page lists only its company's conversations", async () => {
    const r = await (await unifiedClient.GET(req('/x'), params({ clientId: 'cl-a' }))).json()
    expect(r.email_conversations.map((c: { id: string }) => c.id)).toEqual(['ca'])
    expect((await unifiedClient.GET(req('/x'), params({ clientId: 'cl-t' }))).status).toBe(404)
  })

  it("legacy templates: the user's own in this company only", async () => {
    ctx.userId = 'both'
    const a = await (await emailTemplates.GET(req('/api/email/templates'))).json()
    expect(a.templates.map((t: { id: string }) => t.id)).toEqual(['tpl-a'])
    ctx.orgId = 'org-t'
    const t = await (await emailTemplates.GET(req('/api/email/templates'))).json()
    expect(t.templates.map((x: { id: string }) => x.id)).toEqual(['tpl-t'])
  })
})

describe('by id and by Gmail thread', () => {
  it('the same Gmail thread id in both companies: each reads only its own messages', async () => {
    const a = await (await emailMessages.GET(req('/api/email/messages?thread_id=shared'))).json()
    expect(a.messages.map((m: { id: string }) => m.id)).toEqual(['ma'])
    expect((await emailMessages.GET(req('/api/email/messages?conversation_id=ct'))).status).toBe(404)
    ctx.orgId = 'org-t'
    const t = await (await emailMessages.GET(req('/api/email/messages?thread_id=shared'))).json()
    expect(t.messages.map((m: { id: string }) => m.id)).toEqual(['mt'])
  })

  it("Travel2Egypt's conversation cannot be archived from ATS", async () => {
    const r = await emailConversations.PATCH(req('/api/email/conversations', { method: 'PATCH', body: { conversation_id: 'c-both', action: 'archive' } }))
    expect(r.status).toBe(404)
  })

  it("'Not a lead' on another company's conversation is 404, and its lead stays", async () => {
    const r = await leadsDismiss.POST(req('/api/email/leads/dismiss', { method: 'POST', body: { conversationId: 'ct' } }))
    expect(r.status).toBe(404)
    const { createMockClient: db } = await import('../_mock-supabase')
    const { data: lead } = await db().from('clients').select('id').eq('id', 'cl-t').maybeSingle()
    expect(lead).not.toBeNull()
    const { data: conv } = await db().from('email_conversations').select('client_id').eq('id', 'ct').maybeSingle()
    expect(conv.client_id).toBe('cl-t')
  })

  it("a website order looked up by Gmail message id is this company's", async () => {
    const r = await (await webOrders.GET(req('/api/intake/web-orders?messageId=g1'))).json()
    expect(r.intake?.id).toBe('wo-a')
  })
})
