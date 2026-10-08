// ============================================
// Whose Gmail sends an organization's mail
// ============================================
// Supplier vouchers went out through "the first connected Gmail account" —
// the first row of gmail_tokens, whichever organization it belonged to. With
// more than one organization on the platform, one org's vouchers could be
// sent from another org's mailbox. The sender is now the user's own
// connected account, else an account connected by a member of the same
// organization (an office that shares one mailbox keeps working), never an
// account outside it.

type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** The user id whose Gmail should send for this org, or null when no member has one. */
export async function orgGmailSenderId(db: Db, orgId: string, userId: string | null): Promise<string | null> {
  const { data: members } = await db
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
  const memberIds: string[] = (members ?? []).map((m: { user_id: string }) => m.user_id)
  if (memberIds.length === 0) return null

  const { data: tokens } = await db
    .from('gmail_tokens')
    .select('user_id')
    .in('user_id', memberIds)
  const connected = new Set<string>((tokens ?? []).map((t: { user_id: string }) => t.user_id))

  if (userId && connected.has(userId)) return userId
  // The longest-standing member with a mailbox: a stable choice, not whichever row came back first.
  return memberIds.find(id => connected.has(id)) ?? null
}
