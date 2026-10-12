// ============================================
// Only the mail of mailboxes that are connected now
// ============================================
// Disconnecting Gmail deleted the login and nothing else: every conversation
// synced from that address stayed in Communicate, on client pages and on the
// dashboard (operator, 2026-10-11). The history is the company's — linked to
// leads, website orders and drafts — so it is not deleted: a conversation is
// shown only while the address it came from (email_conversations.
// mailbox_email, migration 20261128) is connected, and comes back when that
// address is connected again.
//
// A conversation whose address could not be worked out (mailbox_email NULL)
// follows the user who synced it: shown while that user has a connection.
//
// AND only the caller's organisation's mailboxes. gmail_tokens and
// email_conversations have no org_id (G1), and this was the only scope on
// every email list, so with a second company live each saw the other's mail.
// A mailbox is the organisation's when the login that connected it is a
// member (lib/auth/org-members — the rule the client page already applied).
// LIMIT: a login that belongs to BOTH companies has its mailbox shown in
// both; telling those apart needs gmail_tokens.org_id (a later migration).

import { orgMemberUserIds } from '@/lib/auth/org-members'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface ConnectedMailboxes {
  emails: string[]
  userIds: string[]
}

export async function connectedMailboxes(db: Db, orgId: string | null): Promise<ConnectedMailboxes> {
  const memberIds = orgId ? await orgMemberUserIds(db, orgId) : []
  if (memberIds.length === 0) return { emails: [], userIds: [] }
  const { data } = await db.from('gmail_tokens').select('user_id, email').in('user_id', memberIds)
  const emails = new Set<string>()
  const userIds = new Set<string>()
  for (const t of (data ?? []) as Array<{ user_id: string | null; email: string | null }>) {
    const e = String(t.email ?? '').trim().toLowerCase()
    if (e) emails.add(e)
    if (t.user_id) userIds.add(t.user_id)
  }
  return { emails: [...emails], userIds: [...userIds] }
}

const quote = (v: string) => `"${v.replace(/["\\]/g, '')}"`

/** A PostgREST `.or()` filter for "from a connected mailbox". Matches nothing
 *  when nothing is connected. */
export function connectedMailboxFilter(m: ConnectedMailboxes): string {
  const parts: string[] = []
  if (m.emails.length) parts.push(`mailbox_email.in.(${m.emails.map(quote).join(',')})`)
  if (m.userIds.length) parts.push(`and(mailbox_email.is.null,user_id.in.(${m.userIds.map(quote).join(',')}))`)
  return parts.length ? parts.join(',') : 'id.is.null'
}

/** Before migration 20261128 has run there is no mailbox_email column. */
export function isMissingMailboxColumn(error: unknown): boolean {
  const e = error as { message?: unknown; code?: unknown } | null
  return !!e && /mailbox_email/.test(String(e.message ?? '')) && (e.code === '42703' || e.code === 'PGRST204' || /does not exist|could not find/i.test(String(e.message ?? '')))
}

/**
 * Runs `build` scoped to the organisation's connected mailboxes; if the
 * column is not there yet, runs it again scoped by owner alone (user_id of a
 * member with a connection) rather than failing the page — never unscoped,
 * which would list every company's mail.
 */
export async function scopedToConnectedMailboxes<R extends { error: unknown }>(
  db: Db,
  orgId: string | null,
  build: (filter: string | null) => PromiseLike<R>
): Promise<R> {
  const mailboxes = await connectedMailboxes(db, orgId)
  const scoped = await build(connectedMailboxFilter(mailboxes))
  if (scoped.error && isMissingMailboxColumn(scoped.error)) {
    console.warn('[email] mailbox_email missing — run migration 20261128; listing by mailbox owner')
    return build(mailboxes.userIds.length ? `user_id.in.(${mailboxes.userIds.map(quote).join(',')})` : 'id.is.null')
  }
  return scoped
}
