// Disconnecting Gmail left that address's conversations in Communicate, on
// client pages and on the dashboard (operator, 2026-10-11). They are kept,
// and shown only while their address is connected — and only the caller's
// organisation's: each connection serves one company (gmail_tokens.org_id,
// 20261204), so a person in both companies has their mailbox in one of them.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  connectedMailboxes,
  connectedMailboxFilter,
  scopedToConnectedMailboxes,
} from '@/lib/email/connected-mailboxes'

// gmail_tokens rows with the company each serves. The fake answers
// .eq('org_id', id) like PostgREST.
type Token = { user_id: string | null; email: string | null; org_id: string }
const tokens = (rows: Token[], fail = false) => ({
  from: () => ({
    select: () => ({
      eq: async (_col: string, org: string) => (fail ? { data: null, error: { message: 'down' } } : { data: rows.filter(r => r.org_id === org), error: null }),
    }),
  }),
})
const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

describe('connected mailboxes', () => {
  it('are the stored connections, addresses lowercased', async () => {
    expect(await connectedMailboxes(tokens([
      { user_id: 'u1', email: 'Office@Co.com', org_id: 'A' },
      { user_id: 'u2', email: '', org_id: 'A' },
    ]), 'A')).toEqual({ emails: ['office@co.com'], userIds: ['u1', 'u2'] })
  })

  it("only the connections that serve the organisation — never another company's", async () => {
    const db = tokens([
      { user_id: 'a1', email: 'ops@a.com', org_id: 'A' },
      { user_id: 'b1', email: 'info@b.com', org_id: 'B' },
      // A person in both companies, who connected their mailbox to B.
      { user_id: 'both', email: 'owner@b.com', org_id: 'B' },
    ])
    expect(await connectedMailboxes(db, 'A')).toEqual({ emails: ['ops@a.com'], userIds: ['a1'] })
    expect(await connectedMailboxes(db, 'B')).toEqual({ emails: ['info@b.com', 'owner@b.com'], userIds: ['b1', 'both'] })
    expect(await connectedMailboxes(db, null)).toEqual({ emails: [], userIds: [] })
    const build = vi.fn(async (_f: string) => ({ data: [], error: null }))
    await scopedToConnectedMailboxes(db, 'A', build)
    expect(build).toHaveBeenCalledWith('mailbox_email.in.("ops@a.com"),and(mailbox_email.is.null,user_id.in.("a1"))')
  })

  it('a failed read shows nothing rather than widening', async () => {
    expect(await connectedMailboxes(tokens([{ user_id: 'a1', email: 'ops@a.com', org_id: 'A' }], true), 'A')).toEqual({ emails: [], userIds: [] })
  })

  it('a conversation shows for a connected address, or — address unknown — a connected user', () => {
    expect(connectedMailboxFilter({ emails: ['office@co.com'], userIds: ['u1'] }))
      .toBe('mailbox_email.in.("office@co.com"),and(mailbox_email.is.null,user_id.in.("u1"))')
  })

  it('nothing connected: no email conversation shows', () => {
    expect(connectedMailboxFilter({ emails: [], userIds: [] })).toBe('id.is.null')
  })

  it('every list of email conversations is scoped to the organisation and its connected mailboxes', () => {
    for (const f of [
      'app/api/unified/conversations/route.ts',
      'app/api/unified/client/[clientId]/route.ts',
      'app/api/email/conversations/route.ts',
      'app/api/dashboard/attention/route.ts',
      'app/api/dashboard/summary/route.ts',
    ]) {
      const code = src(f)
      expect(code, f).toContain('scopedToConnectedMailboxes(supabase, orgId,')
      const list = code.slice(code.indexOf("from('email_conversations')"))
      expect(list.slice(0, 1200), f).toContain(".eq('org_id', orgId)")
    }
  })

  it('new conversations record their address and company; the migrations fill in the old ones', () => {
    const sync = src('lib/email/sync-mailbox.ts')
    expect(sync).toContain('mailbox_email: userEmail.toLowerCase()')
    expect(sync).toContain('org_id: orgId,')
    const poll = src('app/api/gmail/poll/route.ts')
    expect(poll).toContain('mailbox_email: mailbox.mailboxEmail || null')
    expect(poll).toContain('org_id: orgId,')
    const sql = src('migrations/20261128_email_conversation_mailbox.sql')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS mailbox_email text')
    expect(sql.match(/WHERE ec\.mailbox_email IS NULL/g)?.length).toBe(3)
  })
})
