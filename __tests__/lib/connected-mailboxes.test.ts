// Disconnecting Gmail left that address's conversations in Communicate, on
// client pages and on the dashboard (operator, 2026-10-11). They are kept,
// and shown only while their address is connected — and only the caller's
// organisation's mailboxes (a second company went live: each saw the other's
// mail, since gmail_tokens has no org_id and this was the only scope).
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  connectedMailboxes,
  connectedMailboxFilter,
  isMissingMailboxColumn,
  scopedToConnectedMailboxes,
} from '@/lib/email/connected-mailboxes'

// gmail_tokens rows, and organization_members rows (org_id, user_id). The
// fake answers .in('user_id', ids) / .eq('org_id', id) like PostgREST.
type Token = { user_id: string | null; email: string | null }
const tokens = (rows: Token[], members: Array<{ org_id: string; user_id: string }> = [
  ...new Set(rows.map(r => r.user_id).filter(Boolean) as string[]),
].map(user_id => ({ org_id: 'A', user_id }))) => ({
  from: (table: string) => ({
    select: () => ({
      eq: async (_col: string, org: string) => ({ data: table === 'organization_members' ? members.filter(m => m.org_id === org) : [], error: null }),
      in: async (_col: string, ids: string[]) => ({ data: table === 'gmail_tokens' ? rows.filter(r => r.user_id && ids.includes(r.user_id)) : [], error: null }),
    }),
  }),
})
const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

describe('connected mailboxes', () => {
  it('are the stored connections, addresses lowercased', async () => {
    expect(await connectedMailboxes(tokens([
      { user_id: 'u1', email: 'Office@Co.com' },
      { user_id: 'u2', email: '' },
    ]), 'A')).toEqual({ emails: ['office@co.com'], userIds: ['u1', 'u2'] })
  })

  it("only the organisation's members' mailboxes — never another company's", async () => {
    const db = tokens(
      [{ user_id: 'a1', email: 'ops@a.com' }, { user_id: 'b1', email: 'info@b.com' }],
      [{ org_id: 'A', user_id: 'a1' }, { org_id: 'B', user_id: 'b1' }],
    )
    expect(await connectedMailboxes(db, 'A')).toEqual({ emails: ['ops@a.com'], userIds: ['a1'] })
    expect(await connectedMailboxes(db, 'B')).toEqual({ emails: ['info@b.com'], userIds: ['b1'] })
    expect(await connectedMailboxes(db, null)).toEqual({ emails: [], userIds: [] })
    const build = vi.fn(async (_f: string | null) => ({ data: [], error: null }))
    await scopedToConnectedMailboxes(db, 'A', build)
    expect(build).toHaveBeenCalledWith('mailbox_email.in.("ops@a.com"),and(mailbox_email.is.null,user_id.in.("a1"))')
  })

  it('a conversation shows for a connected address, or — address unknown — a connected user', () => {
    expect(connectedMailboxFilter({ emails: ['office@co.com'], userIds: ['u1'] }))
      .toBe('mailbox_email.in.("office@co.com"),and(mailbox_email.is.null,user_id.in.("u1"))')
  })

  it('nothing connected: no email conversation shows', () => {
    expect(connectedMailboxFilter({ emails: [], userIds: [] })).toBe('id.is.null')
  })

  // Was: re-run UNSCOPED (build(null)) — every company's mail. Now scoped by
  // mailbox owner, the one scope that needs no new column.
  it('before the migration, lists the org members\' mailboxes by owner rather than failing', async () => {
    const build = vi.fn(async (filter: string | null) =>
      filter?.includes('mailbox_email') ? { data: null, error: { code: '42703', message: 'column email_conversations.mailbox_email does not exist' } } : { data: ['row'], error: null })
    const r = await scopedToConnectedMailboxes(tokens([{ user_id: 'u1', email: 'a@b.c' }]), 'A', build)
    expect(r).toEqual({ data: ['row'], error: null })
    expect(build).toHaveBeenLastCalledWith('user_id.in.("u1")')
    expect(build).not.toHaveBeenCalledWith(null)
    expect(isMissingMailboxColumn({ code: '42501', message: 'permission denied' })).toBe(false)
  })

  it('every list of email conversations is scoped', () => {
    for (const f of [
      'app/api/unified/conversations/route.ts',
      'app/api/unified/client/[clientId]/route.ts',
      'app/api/email/conversations/route.ts',
      'app/api/dashboard/attention/route.ts',
      'app/api/dashboard/summary/route.ts',
    ]) expect(src(f), f).toContain('scopedToConnectedMailboxes(supabase, orgId,')
  })

  it('new conversations record their address; the migration fills in the old ones', () => {
    expect(src('lib/email/sync-mailbox.ts')).toContain('mailbox_email: userEmail.toLowerCase()')
    expect(src('app/api/gmail/poll/route.ts')).toContain("mailbox_email: String(auth.email || '').toLowerCase() || null")
    const sql = src('migrations/20261128_email_conversation_mailbox.sql')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS mailbox_email text')
    expect(sql.match(/WHERE ec\.mailbox_email IS NULL/g)?.length).toBe(3)
  })
})
