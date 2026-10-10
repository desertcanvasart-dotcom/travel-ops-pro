// ============================================
// What a PATCH may change on an email conversation
// ============================================
// /api/email/conversations PATCH spread the request body into the update, on
// the service-role client: user_id, thread_id, client_name — any column — was
// the caller's to set. Only these fields are taken; anything else in the body
// is ignored. A field of the wrong shape refuses the whole update (null) rather
// than writing half of it. client_id and assigned_team_member_id are checked
// against the organisation by the route (recordsInOrg / teamMemberInOrg).

import type { ConversationStatus } from '@/types/unified'

const STATUSES: ConversationStatus[] = ['active', 'archived', 'spam', 'blocked']

export interface ConversationUpdates {
  status?: ConversationStatus
  unread_count?: number
  assigned_team_member_id?: string | null
  is_hidden?: boolean
  client_id?: string | null
}

const uuidOrNull = (v: unknown) => v === null || (typeof v === 'string' && v.trim() !== '')

export function pickConversationUpdates(body: Record<string, unknown>): ConversationUpdates | null {
  const out: ConversationUpdates = {}
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as ConversationStatus)) return null
    out.status = body.status as ConversationStatus
  }
  if (body.unread_count !== undefined) {
    if (!Number.isInteger(body.unread_count) || (body.unread_count as number) < 0) return null
    out.unread_count = body.unread_count as number
  }
  if (body.assigned_team_member_id !== undefined) {
    if (!uuidOrNull(body.assigned_team_member_id)) return null
    out.assigned_team_member_id = body.assigned_team_member_id as string | null
  }
  if (body.is_hidden !== undefined) {
    if (typeof body.is_hidden !== 'boolean') return null
    out.is_hidden = body.is_hidden
  }
  if (body.client_id !== undefined) {
    if (!uuidOrNull(body.client_id)) return null
    out.client_id = body.client_id as string | null
  }
  return out
}
