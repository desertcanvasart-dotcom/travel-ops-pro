// ============================================
// Is this email conversation the caller's organisation's?
// ============================================
// email_conversations.org_id (migration 20261204) says whose it is. The by-id
// endpoints read, changed and trashed (in the owner's real Gmail) any
// conversation whose id they were given; they load it through this first,
// and answer 404 when it is null.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface OwnedEmailConversation {
  id: string
  org_id: string
  user_id: string | null
  thread_id: string | null
  mailbox_email: string | null
  status: string | null
  is_hidden: boolean | null
  assigned_team_member_id?: string | null
}

/** The conversation, or null when it does not exist or is another organisation's. */
export async function emailConversationInOrg(
  db: Db,
  orgId: string,
  conversationId: string,
): Promise<OwnedEmailConversation | null> {
  const { data, error } = await db
    .from('email_conversations')
    .select('id, org_id, user_id, thread_id, mailbox_email, status, is_hidden, assigned_team_member_id')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error || !data) return null
  return data as OwnedEmailConversation
}

// ── One conversation per Gmail thread, per mailbox, per company ─────────────
// A Gmail thread id is an id inside ONE mailbox, so the same id can be a
// conversation in each company's mailbox (UNIQUE (org_id, mailbox_email,
// thread_id), 20261204). A conversation stored before its address was
// recorded (mailbox_email NULL) belongs to the mailbox of the user who synced
// it, and is found by that.

export interface MailboxRef {
  orgId: string
  /** The mailbox address (any case). */
  mailboxEmail: string
  /** The user whose connection it is. */
  mailboxUserId: string
}

/** The filter for "this mailbox's conversations" (PostgREST `.or()`). */
export function mailboxConversationFilter(m: MailboxRef): string {
  const q = (v: string) => `"${v.replace(/["\\]/g, '')}"`
  const parts = [`and(mailbox_email.is.null,user_id.eq.${q(m.mailboxUserId)})`]
  if (m.mailboxEmail) parts.unshift(`mailbox_email.eq.${q(m.mailboxEmail.toLowerCase())}`)
  return parts.join(',')
}

/** This mailbox's conversation for a Gmail thread, or null. */
export async function findThreadConversation<T = { id: string }>(
  db: Db,
  m: MailboxRef,
  threadId: string,
  columns = 'id',
): Promise<T | null> {
  const { data, error } = await db
    .from('email_conversations')
    .select(columns)
    .eq('org_id', m.orgId)
    .eq('thread_id', threadId)
    .or(mailboxConversationFilter(m))
    .limit(1)
  if (error) throw new Error(`Could not read conversations: ${error.message}`)
  return ((data ?? []) as T[])[0] ?? null
}
