// Notify every active owner/admin/manager of an org — used for customer-side
// events (a portal change request) where there is no single assigned operator.
// Notifications key on team_members.id (see the assign route), so this reads
// team_members, not organization_members.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotifications } from '@/lib/notifications'

export async function notifyOrgManagers(
  admin: SupabaseClient<any, any, any, any, any>,
  orgId: string,
  n: { title: string; message: string; link?: string | null }
): Promise<void> {
  try {
    const { data: members } = await admin
      .from('team_members')
      .select('id, role, is_active')
      .eq('org_id', orgId)
      .in('role', ['owner', 'admin', 'manager'])
      .eq('is_active', true)
    const recipients = (members ?? []).map(m => m.id).filter(Boolean)
    if (!recipients.length) return
    await createNotifications(recipients.map(id => ({
      team_member_id: id as string,
      type: 'booking_change_request',
      title: n.title,
      message: n.message,
      link: n.link ?? null,
    })))
  } catch (e) {
    // A missed notification must never fail the customer's request.
    console.error('notifyOrgManagers failed:', e)
  }
}
