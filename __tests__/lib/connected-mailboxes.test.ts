// Disconnecting Gmail left that address's conversations in Communicate, on
// client pages and on the dashboard (operator, 2026-10-11). They are kept,
// and shown only while their address is connected.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  connectedMailboxes,
  connectedMailboxFilter,
  isMissingMailboxColumn,
  scopedToConnectedMailboxes,
} from '@/lib/email/connected-mailboxes'

const tokens = (rows: Array<{ user_id: string | null; email: string | null }>) => ({
  from: () => ({ select: async () => ({ data: rows, error: null }) }),
})
const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

describe('connected mailboxes', () => {
  it('are the stored connections, addresses lowercased', async () => {
    expect(await connectedMailboxes(tokens([
      { user_id: 'u1', email: 'Office@Co.com' },
      { user_id: 'u2', email: '' },
    ]))).toEqual({ emails: ['office@co.com'], userIds: ['u1', 'u2'] })
  })

  it('a conversation shows for a connected address, or — address unknown — a connected user', () => {
    expect(connectedMailboxFilter({ emails: ['office@co.com'], userIds: ['u1'] }))
      .toBe('mailbox_email.in.("office@co.com"),and(mailbox_email.is.null,user_id.in.("u1"))')
  })

  it('nothing connected: no email conversation shows', () => {
    expect(connectedMailboxFilter({ emails: [], userIds: [] })).toBe('id.is.null')
  })

  it('before the migration, lists as before rather than failing', async () => {
    const build = vi.fn(async (filter: string | null) =>
      filter ? { data: null, error: { code: '42703', message: 'column email_conversations.mailbox_email does not exist' } } : { data: ['row'], error: null })
    const r = await scopedToConnectedMailboxes(tokens([{ user_id: 'u1', email: 'a@b.c' }]), build)
    expect(r).toEqual({ data: ['row'], error: null })
    expect(build).toHaveBeenLastCalledWith(null)
    expect(isMissingMailboxColumn({ code: '42501', message: 'permission denied' })).toBe(false)
  })

  it('every list of email conversations is scoped', () => {
    for (const f of [
      'app/api/unified/conversations/route.ts',
      'app/api/unified/client/[clientId]/route.ts',
      'app/api/email/conversations/route.ts',
      'app/api/dashboard/attention/route.ts',
      'app/api/dashboard/summary/route.ts',
    ]) expect(src(f), f).toContain('scopedToConnectedMailboxes(supabase,')
  })

  it('new conversations record their address; the migration fills in the old ones', () => {
    expect(src('lib/email/sync-mailbox.ts')).toContain('mailbox_email: userEmail.toLowerCase()')
    expect(src('app/api/gmail/poll/route.ts')).toContain("mailbox_email: String(auth.email || '').toLowerCase() || null")
    const sql = src('migrations/20261128_email_conversation_mailbox.sql')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS mailbox_email text')
    expect(sql.match(/WHERE ec\.mailbox_email IS NULL/g)?.length).toBe(3)
  })
})
