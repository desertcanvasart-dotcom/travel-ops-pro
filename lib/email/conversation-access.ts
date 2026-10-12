// ============================================
// Is this email conversation the caller's organisation's?
// ============================================
// email_conversations has no org_id (G1). A conversation belongs to the
// mailbox it was synced from (user_id, the Gmail owner), and that mailbox to
// the organisation its owner is a member of — the rule the lists apply
// (lib/email/connected-mailboxes). The by-id endpoints read, changed and
// trashed (in the owner's real Gmail) any conversation whose id they were
// given; they now load it through this first, and answer 404 when it is null.
// LIMIT: a login in BOTH companies owns a mailbox visible to both until
// gmail_tokens gets an org_id (a later migration).

import { isOrgMember } from '@/lib/auth/org-members'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface OwnedEmailConversation {
  id: string
  user_id: string | null
  thread_id: string | null
  status: string | null
  is_hidden: boolean | null
}

/** The conversation, or null when it does not exist or is another organisation's. */
export async function emailConversationInOrg(
  db: Db,
  orgId: string,
  conversationId: string,
): Promise<OwnedEmailConversation | null> {
  const { data, error } = await db
    .from('email_conversations')
    .select('id, user_id, thread_id, status, is_hidden')
    .eq('id', conversationId)
    .maybeSingle()
  if (error || !data) return null
  const conv = data as OwnedEmailConversation
  return (await isOrgMember(db, orgId, conv.user_id)) ? conv : null
}
