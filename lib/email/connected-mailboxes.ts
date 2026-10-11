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

type Db = { from: (table: string) => unknown }
type TokenQuery = { select: (cols: string) => PromiseLike<{ data: Array<{ user_id: string | null; email: string | null }> | null; error: unknown }> }

export interface ConnectedMailboxes {
  emails: string[]
  userIds: string[]
}

export async function connectedMailboxes(db: Db): Promise<ConnectedMailboxes> {
  const { data } = await (db.from('gmail_tokens') as TokenQuery).select('user_id, email')
  const emails = new Set<string>()
  const userIds = new Set<string>()
  for (const t of data ?? []) {
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
 * Runs `build` scoped to the connected mailboxes; if the column is not there
 * yet, runs it again unscoped (as before) rather than failing the page.
 */
export async function scopedToConnectedMailboxes<R extends { error: unknown }>(
  db: Db,
  build: (filter: string | null) => PromiseLike<R>
): Promise<R> {
  const filter = connectedMailboxFilter(await connectedMailboxes(db))
  const scoped = await build(filter)
  if (scoped.error && isMissingMailboxColumn(scoped.error)) {
    console.warn('[email] mailbox_email missing — run migration 20261128; listing unscoped')
    return build(null)
  }
  return scoped
}
