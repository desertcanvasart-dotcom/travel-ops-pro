// ============================================
// The company mailbox: whose Gmail reads and sends for an organisation
// ============================================
// Supplier vouchers went out through "the first connected Gmail account" —
// the first row of gmail_tokens, whichever organization it belonged to. With
// more than one organization on the platform, one org's vouchers could be
// sent from another org's mailbox.
//
// A connected mailbox now serves ONE organisation (gmail_tokens.org_id,
// migration 20261204: the workspace active when it was connected). The ONE
// rule, shared by reading (lib/gmail-mailbox: the inbox, poll, labels,
// attachments) and sending (vouchers, reminders, replies):
//
//   - the user's own connection, when it serves this organisation;
//   - else the organisation's longest-standing connection (created_at, then
//     id) — a stable choice. updated_at is rewritten on every token refresh
//     (lib/gmail.ts), so "the most recently updated" flipped between
//     mailboxes and the inbox read one while the vouchers went from another.
//
// Never a connection that serves another organisation — including the
// user's own, when they belong to both companies and connected it to the
// other one.

type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface OrgMailbox {
  /** The user whose stored Gmail connection is used. */
  user_id: string
  /** The mailbox address. */
  email: string
  /** True when it is a colleague's connection, not the user's own. */
  shared: boolean
}

/** The organisation's mailbox for this user (see above), or null when the
 *  organisation has none connected. With `ownOnly`, only the user's own. */
export async function orgMailbox(
  db: Db,
  orgId: string,
  userId: string | null,
  opts: { ownOnly?: boolean } = {},
): Promise<OrgMailbox | null> {
  const { data, error } = await db
    .from('gmail_tokens')
    .select('user_id, email, created_at, id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) return null
  const rows = ((data ?? []) as { user_id: string | null; email: string | null }[]).filter(t => !!t.user_id)
  const own = userId ? rows.find(t => t.user_id === userId) : undefined
  if (own) return { user_id: own.user_id!, email: own.email || '', shared: false }
  if (opts.ownOnly || rows.length === 0) return null
  return { user_id: rows[0].user_id!, email: rows[0].email || '', shared: true }
}

/** The user id whose Gmail should send for this org, or null when none is connected. */
export async function orgGmailSenderId(db: Db, orgId: string, userId: string | null): Promise<string | null> {
  return (await orgMailbox(db, orgId, userId))?.user_id ?? null
}

/** Whether this user's stored connection serves this organisation. */
export async function mailboxServesOrg(db: Db, orgId: string, mailboxUserId: string | null | undefined): Promise<boolean> {
  if (!mailboxUserId) return false
  const { data, error } = await db
    .from('gmail_tokens')
    .select('user_id')
    .eq('user_id', mailboxUserId)
    .eq('org_id', orgId)
    .limit(1)
  if (error) return false
  return (data?.length ?? 0) > 0
}
