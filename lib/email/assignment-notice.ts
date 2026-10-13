// ============================================
// Tell a team member an email conversation was handed to them
// ============================================
// WhatsApp assignment has always notified the assignee
// (app/api/whatsapp/conversations/assign); email assignment told nobody, so
// a conversation given to a colleague sat unseen until they happened to look
// at the inbox. Same notification, same link into Communicate.
//
// No notice when nothing changed (same assignee again), when the assignment
// was cleared, or when the person assigned it to themselves — they know. The
// assignee must be an active member of this company's roster.

import { createNotification } from '@/lib/notifications'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface EmailAssignmentNotice {
  orgId: string
  conversationId: string
  previousAssigneeId: string | null | undefined
  newAssigneeId: string | null | undefined
  /** The signed-in user who made the change. */
  actorUserId: string | null
  clientName: string | null | undefined
  clientEmail: string | null | undefined
  subject: string | null | undefined
}

/** Whether this change should notify anyone at all (before any lookup). */
export function assignmentNeedsNotice(previous: string | null | undefined, next: string | null | undefined): next is string {
  return !!next && next !== previous
}

export async function notifyEmailAssignee(db: Db, n: EmailAssignmentNotice): Promise<boolean> {
  if (!assignmentNeedsNotice(n.previousAssigneeId, n.newAssigneeId)) return false
  const { data: member } = await db
    .from('team_members')
    .select('id, name, user_id')
    .eq('id', n.newAssigneeId)
    .eq('org_id', n.orgId)
    .eq('is_active', true)
    .maybeSingle()
  if (!member) return false
  if (n.actorUserId && member.user_id === n.actorUserId) return false

  const who = n.clientName || n.clientEmail || 'a customer'
  const result = await createNotification({
    org_id: n.orgId,
    user_id: member.user_id ?? null,
    team_member_id: member.id,
    type: 'email_assigned',
    title: 'Email Conversation Assigned',
    message: `You've been assigned an email conversation with ${who}${n.subject ? `: "${n.subject.substring(0, 100)}"` : ''}.`,
    link: `/communications?conversation=${n.conversationId}`,
  })
  if (!result.success) console.error('Email assignment notification failed:', result.error)
  return result.success
}
