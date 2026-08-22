// ============================================
// Whose notifications are these?
// ============================================
// A notification is addressed either to a login (user_id — the normal case
// since 20260823) or to a legacy team_members roster entry. The viewer owns
// a row when it names their user_id, or a roster entry linked to their
// user_id. Every read and every mark-read/delete goes through this filter;
// before it existed the bell showed everyone everything.
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Roster entries linked to this login (usually none). */
export async function linkedTeamMemberIds(db: Db, userId: string): Promise<string[]> {
  const { data } = await db.from('team_members').select('id').eq('user_id', userId)
  return ((data ?? []) as Array<{ id: string }>).map(r => r.id).filter(id => UUID.test(id))
}

/**
 * PostgREST `.or()` filter selecting the viewer's rows. Only UUIDs that came
 * from the database are interpolated — never request input — so the filter
 * string cannot be steered (see the clients-page .or() injection, 2026-07-02).
 */
export function notificationScopeFilter(userId: string, teamMemberIds: string[]): string {
  if (!UUID.test(userId)) throw new Error('notificationScopeFilter: userId is not a uuid')
  const safe = teamMemberIds.filter(id => UUID.test(id))
  return safe.length ? `user_id.eq.${userId},team_member_id.in.(${safe.join(',')})` : `user_id.eq.${userId}`
}

/**
 * Ids of the viewer's notifications matching `where`, resolved with a SELECT.
 * Mutations then target `id IN (...)`. PostgREST accepts the `or=` scope on
 * reads but rejects it on PATCH/DELETE for this column (42703, seen in prod
 * 2026-08-23), so no mutation may carry the scope filter directly.
 */
export async function ownNotificationIds(
  db: Db,
  userId: string,
  where: { id?: string; unreadOnly?: boolean } = {}
): Promise<string[]> {
  const scope = notificationScopeFilter(userId, await linkedTeamMemberIds(db, userId))
  let q = db.from('notifications').select('id').or(scope).limit(1000)
  if (where.id) q = q.eq('id', where.id)
  if (where.unreadOnly) q = q.eq('is_read', false)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as Array<{ id: string }>).map(r => r.id)
}
