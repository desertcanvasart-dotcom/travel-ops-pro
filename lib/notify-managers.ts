// Notify every owner/admin/manager of an org — for events with no single
// assigned operator (a portal change request, a rate change). Recipients
// come from organization_members, the one role authority (PR #67). The
// previous version read team_members by an org_id column that table has
// never had, so the query errored on every call and — inside this same
// try/catch — no manager was ever notified.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotifications } from '@/lib/notifications'

export const MANAGER_ROLES = ['owner', 'admin', 'manager'] as const

export interface ManagerNotice {
  title: string
  message: string
  link?: string | null
  type?: string
  /** The person who caused the event — they do not need telling. */
  excludeUserId?: string | null
  send_email?: boolean
}

/** Logins holding a manager-or-above role in the org, minus the actor. */
export async function orgManagerUserIds(
  db: Pick<SupabaseClient<any, any, any, any, any>, 'from'>,
  orgId: string,
  excludeUserId?: string | null
): Promise<string[]> {
  const { data, error } = await db
    .from('organization_members')
    .select('user_id, role')
    .eq('org_id', orgId)
    .in('role', [...MANAGER_ROLES])
  if (error) throw error
  const ids = new Set<string>()
  for (const m of (data ?? []) as Array<{ user_id: string | null }>) {
    if (m.user_id && m.user_id !== excludeUserId) ids.add(m.user_id)
  }
  return [...ids]
}

export async function notifyOrgManagers(
  db: Pick<SupabaseClient<any, any, any, any, any>, 'from'>,
  orgId: string,
  n: ManagerNotice
): Promise<{ created: number; failed: number }> {
  try {
    const recipients = await orgManagerUserIds(db, orgId, n.excludeUserId)
    if (!recipients.length) return { created: 0, failed: 0 }
    return await createNotifications(recipients.map(user_id => ({
      user_id,
      type: n.type ?? 'booking_change_request',
      title: n.title,
      message: n.message,
      link: n.link ?? null,
      send_email: n.send_email ?? true,
    })))
  } catch (e) {
    // A missed notification must never fail the request that caused it.
    console.error('notifyOrgManagers failed:', e)
    return { created: 0, failed: 1 }
  }
}
