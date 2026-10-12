// A connected mailbox serves ONE company (gmail_tokens.org_id, 20261204): the
// workspace active when Connect was pressed. The connect route signs that
// company into the OAuth state; the callback (Google redirecting back, no
// trustworthy workspace of its own) stamps it. Connecting again from the
// other company moves the connection there. And the live poller stores what
// it finds under the mailbox's company, never reusing the other company's
// conversation for the same Gmail thread id.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, any>
const h = vi.hoisted(() => {
  const state = { tables: {} as Record<string, Row[]>, seq: 0 }
  function from(table: string) {
    const rows = (state.tables[table] ??= [])
    const filters: Array<(r: Row) => boolean> = []
    let op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
    let payload: Row | null = null
    let done: Row[] | null = null
    const run = () => {
      if (done) return done
      const matched = () => rows.filter(r => filters.every(f => f(r)))
      if (op === 'insert') { const row = { id: `${table}-${++state.seq}`, ...payload }; rows.push(row); return (done = [row]) }
      if (op === 'upsert') {
        const existing = rows.find(r => r.user_id === payload!.user_id)
        if (existing) Object.assign(existing, payload)
        else rows.push({ id: `${table}-${++state.seq}`, created_at: `t${state.seq}`, ...payload })
        return (done = [])
      }
      if (op === 'delete') { const m = matched(); state.tables[table] = rows.filter(r => !m.includes(r)); return (done = m) }
      if (op === 'update') { const m = matched(); for (const r of m) Object.assign(r, payload); return (done = m) }
      return (done = matched())
    }
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
      or: (expr: string) => {
        // mailbox_email.eq."x",and(mailbox_email.is.null,user_id.eq."u")
        const email = /mailbox_email\.eq\."([^"]*)"/.exec(expr)?.[1]
        const user = /user_id\.eq\."([^"]*)"/.exec(expr)?.[1]
        filters.push(r => (email !== undefined && r.mailbox_email === email) || (r.mailbox_email == null && r.user_id === user))
        return q
      },
      limit: () => q,
      insert: (p: Row) => { op = 'insert'; payload = p; return q },
      update: (p: Row) => { op = 'update'; payload = p; return q },
      upsert: (p: Row) => { op = 'upsert'; payload = p; return q },
      delete: () => { op = 'delete'; return q },
      single: async () => { const r = run(); return r[0] ? { data: r[0], error: null } : { data: null, error: { message: 'none' } } },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    }
    return q
  }
  return { state, client: { from } }
})
const ctx = vi.hoisted(() => ({ orgId: 'org-a', userId: 'both' }))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase-secure', () => ({ getAuthenticatedUser: async () => ({ user: { id: ctx.userId } }) }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => ctx.orgId,
  getCurrentUserId: async () => ctx.userId,
}))
vi.mock('@/lib/crypto/token-cipher', () => ({ encryptToken: (v: string) => `enc:${v}` }))
const gmailApi = vi.hoisted(() => ({
  history: { history: [{ messagesAdded: [{ message: { id: 'g9' } }] }], historyId: '2' } as Row,
  message: {
    id: 'g9', threadId: 'shared-thread', snippet: 'hello', labelIds: ['INBOX'],
    payload: { headers: [{ name: 'From', value: 'Guest <guest@cust.example>' }, { name: 'To', value: 'yoyaku@ats-hj.com' }, { name: 'Subject', value: 'Trip' }, { name: 'Date', value: '2026-10-12T00:00:00Z' }] },
  },
}))
vi.mock('@/lib/gmail', () => ({
  getAuthUrl: (state: string) => `https://accounts.example/auth?state=${encodeURIComponent(state)}`,
  getTokensFromCode: async () => ({ access_token: 'at', refresh_token: 'rt', scope: '' }),
  getUserEmail: async () => 'owner@travel2egypt.org',
  GMAIL_SCOPES: [],
  GmailAuthError: class extends Error {},
}))
vi.mock('@/lib/gmail-mailbox', () => ({
  getMailboxGmail: async () => ({
    mailboxUserId: 'ua1', shared: false, email: 'yoyaku@ats-hj.com', orgId: 'org-a', emailAddress: 'yoyaku@ats-hj.com',
    gmail: { users: {
      history: { list: async () => ({ data: gmailApi.history }) },
      messages: { get: async () => ({ data: gmailApi.message }) },
      getProfile: async () => ({ data: { historyId: '1' } }),
    } },
  }),
}))

import { POST as connect } from '@/app/api/gmail/connect/route'
import { GET as callback } from '@/app/api/auth/google/callback/route'
import { GET as poll } from '@/app/api/gmail/poll/route'
import { signState, verifyState, resetStateSecretForTests } from '@/lib/oauth-state'

process.env.OAUTH_STATE_SECRET = 'test-secret'
resetStateSecretForTests()

const back = (state: string, nonce = 'n1') =>
  new NextRequest(`http://x/api/auth/google/callback?code=c&state=${encodeURIComponent(state)}`, { headers: { cookie: `oauth_state_nonce=${nonce}` } })
const tokens = () => h.state.tables.gmail_tokens ?? []

beforeEach(() => {
  ctx.orgId = 'org-a'; ctx.userId = 'both'
  h.state.tables = {
    organization_members: [{ org_id: 'org-a', user_id: 'both' }, { org_id: 'org-t', user_id: 'both' }, { org_id: 'org-a', user_id: 'ua1' }],
    gmail_tokens: [],
    organizations: [{ id: 'org-a', office_email_addresses: [] }, { id: 'org-t', office_email_addresses: [] }],
    clients: [], suppliers: [], b2b_partners: [],
  }
})

describe('connecting Gmail', () => {
  it('signs the active workspace into the state', async () => {
    const res = await connect(new Request('http://x/api/gmail/connect', { method: 'POST' }))
    const { authUrl } = await res.json()
    const state = new URL(authUrl).searchParams.get('state')!
    const [user, nonce, org] = verifyState(state)!.split(':')
    expect([user, org]).toEqual(['both', 'org-a'])
    expect(nonce).toBeTruthy()
  })

  it('the callback stamps the company from the state', async () => {
    const res = await callback(back(signState('both:n1:org-a')))
    expect(res.headers.get('location')).toContain('/communications?gmail=connected')
    expect(tokens()).toMatchObject([{ user_id: 'both', org_id: 'org-a', email: 'owner@travel2egypt.org' }])
  })

  it('connecting again from the other company moves the connection there, as a new one', async () => {
    h.state.tables.gmail_tokens = [{ id: 'old', user_id: 'both', org_id: 'org-t', email: 'owner@travel2egypt.org', created_at: '2026-01-01' }]
    await callback(back(signState('both:n1:org-a')))
    expect(tokens()).toHaveLength(1)
    expect(tokens()[0]).toMatchObject({ user_id: 'both', org_id: 'org-a' })
    expect(tokens()[0].id).not.toBe('old')
  })

  it('a state without a company, or for a company the person is not in, is refused', async () => {
    expect((await callback(back(signState('both:n1')))).headers.get('location')).toContain('error=invalid_state')
    expect((await callback(back(signState('both:n1:org-x')))).headers.get('location')).toContain('error=invalid_state')
    expect(tokens()).toEqual([])
  })
})

describe('the live poller', () => {
  it("stores under the mailbox's company and never reuses the other company's conversation for the same thread id", async () => {
    h.state.tables.email_conversations = [{ id: 'conv-t', org_id: 'org-t', mailbox_email: 'info@travel2egypt.org', user_id: 'ut1', thread_id: 'shared-thread' }]
    h.state.tables.email_messages = [{ id: 'm-t', org_id: 'org-t', message_id: 'g9', conversation_id: 'conv-t' }]
    const res = await poll(new NextRequest('http://x/api/gmail/poll?historyId=1'))
    expect(res.status).toBe(200)
    const convs = h.state.tables.email_conversations
    expect(convs).toHaveLength(2)
    const mine = convs.find(c => c.org_id === 'org-a')!
    expect(mine).toMatchObject({ thread_id: 'shared-thread', mailbox_email: 'yoyaku@ats-hj.com', user_id: 'ua1' })
    expect(h.state.tables.email_messages.filter(m => m.org_id === 'org-a')).toMatchObject([{ message_id: 'g9', conversation_id: mine.id }])
    // Travel2Egypt's rows are untouched.
    expect(convs.find(c => c.id === 'conv-t')).toEqual({ id: 'conv-t', org_id: 'org-t', mailbox_email: 'info@travel2egypt.org', user_id: 'ut1', thread_id: 'shared-thread' })
  })
})
