// ============================================
// Who belongs to an organisation
// ============================================
// Tables without an org_id of their own (gmail_tokens, email_conversations —
// G1) belong to an organisation through the login that owns the row: a
// mailbox is the org's when its owner (user_id) is a member. These are the
// two questions every such check asks; a read that fails answers "nobody",
// so a database error never widens what a caller sees.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** The user ids of an organisation's members. */
export async function orgMemberUserIds(db: Db, orgId: string): Promise<string[]> {
  const { data, error } = await db
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)
  if (error) return []
  return ((data ?? []) as { user_id: string | null }[])
    .map(m => m.user_id)
    .filter((id): id is string => !!id)
}

/** Whether a login is a member of an organisation. */
export async function isOrgMember(db: Db, orgId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const { data, error } = await db
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .limit(1)
  if (error) return false
  return (data?.length ?? 0) > 0
}
