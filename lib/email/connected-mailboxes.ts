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
// Which company: email_conversations.org_id and gmail_tokens.org_id
// (migration 20261204). Every list filters .eq('org_id', orgId) itself; this
// adds "and its mailbox is connected IN THIS COMPANY" — the connections that
// serve the organisation (gmail_tokens.org_id), not those of its members, so
// a person in both companies has their mailbox in the one it serves only.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface ConnectedMailboxes {
  emails: string[]
  userIds: string[]
}

/** The organisation's connected mailboxes; none without an organisation or
 *  when the read fails (a database error never widens what is shown). */
export async function connectedMailboxes(db: Db, orgId: string | null): Promise<ConnectedMailboxes> {
  if (!orgId) return { emails: [], userIds: [] }
  const { data, error } = await db.from('gmail_tokens').select('user_id, email').eq('org_id', orgId)
  if (error) return { emails: [], userIds: [] }
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

/**
 * Runs `build` with the "connected in this organisation" filter. `build`
 * scopes its query to the organisation (.eq('org_id', orgId)) itself.
 */
export async function scopedToConnectedMailboxes<R extends { error: unknown }>(
  db: Db,
  orgId: string | null,
  build: (filter: string) => PromiseLike<R>
): Promise<R> {
  return build(connectedMailboxFilter(await connectedMailboxes(db, orgId)))
}
