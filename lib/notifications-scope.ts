// ============================================
// Whose notifications are these?
// ============================================
// A notification is addressed either to a login (user_id — the normal case
// since 20260823) or to a legacy team_members roster entry. The viewer owns
// a row when it names their user_id, or a roster entry linked to their
// user_id. Every read and every mark-read/delete goes through this filter;
// before it existed the bell showed everyone everything.
//
// And the active organisation's only (notifications.org_id, migration
// 20261203): a person in both companies sees, marks and deletes only the
// company they are working in. Their roster entry is that company's too —
// they have one per company.
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** This login's roster entries in the organisation (usually none). */
export async function linkedTeamMemberIds(db: Db, userId: string, orgId: string): Promise<string[]> {
  const { data } = await db.from('team_members').select('id').eq('user_id', userId).eq('org_id', orgId)
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
  orgId: string,
  where: { id?: string; unreadOnly?: boolean } = {}
): Promise<string[]> {
  const scope = notificationScopeFilter(userId, await linkedTeamMemberIds(db, userId, orgId))
  let q = db.from('notifications').select('id').eq('org_id', orgId).or(scope).limit(1000)
  if (where.id) q = q.eq('id', where.id)
  if (where.unreadOnly) q = q.eq('is_read', false)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as Array<{ id: string }>).map(r => r.id)
}

/**
 * Delete every one of the viewer's notifications in the organisation — the
 * bell's "Clear all". It used to delete only the ten rows the bell had loaded,
 * so older ones came straight back. Resolved in pages of ids (above), each
 * deleted by `id IN (...)`, until none are left. Returns how many went.
 */
export async function deleteOwnNotifications(db: Db, userId: string, orgId: string): Promise<number> {
  let deleted = 0
  // A bound, not an expectation: 1000 ids per page, 50 pages is far more than anyone has.
  for (let page = 0; page < 50; page++) {
    const ids = await ownNotificationIds(db, userId, orgId)
    if (!ids.length) break
    const { error } = await db.from('notifications').delete().in('id', ids)
    if (error) throw error
    deleted += ids.length
    if (ids.length < 1000) break
  }
  return deleted
}
