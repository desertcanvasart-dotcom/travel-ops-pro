// ============================================
// Client follow-ups — shared vocabulary and date rules
// ============================================
// client_followups has no org_id: a follow-up is its client's, and the client
// carries the company (clients.org_id). The /api/followups routes reach a
// follow-up only through a clients!inner embed filtered to the active
// company, so a person in both companies never lists or changes the other
// one's (the browser read the table directly, and RLS admits every company
// the person belongs to).

import { shiftDateISO } from '@/lib/today'

/** What the Add Follow-up modal offers — the filters list the same. */
export const FOLLOWUP_TYPES = [
  'call', 'email', 'whatsapp', 'meeting', 'quote',
  'booking_confirmation', 'payment_reminder', 'feedback', 'other',
] as const
export const FOLLOWUP_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

/** The pending list is capped (soonest first) below PostgREST's max-rows. */
export const FOLLOWUP_LIST_LIMIT = 1000

/**
 * The new due date for "Snooze N days": N days after the current due date, or
 * N days after today when it is already overdue. Snoozing from today moved a
 * follow-up due in five days EARLIER, to tomorrow; snoozing from an overdue
 * date would leave it overdue.
 */
export function snoozeDate(dueDate: string, today: string, days: number): string {
  const due = String(dueDate).slice(0, 10)
  return shiftDateISO(due < today ? today : due, days)
}

/** A YYYY-MM-DD calendar date. */
export const isISODate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** The modal's own vocabulary, and a calendar date. Null when the body is fine. */
export function followupFieldsError(body: Record<string, unknown>, creating: boolean): string | null {
  if ((creating || body.followup_type !== undefined) && !FOLLOWUP_TYPES.includes(body.followup_type as never)) {
    return 'Unknown follow-up type'
  }
  if ((creating || body.due_date !== undefined) && !isISODate(body.due_date)) return 'A due date (YYYY-MM-DD) is required'
  // 'normal' is the column's old default; such a row must stay editable.
  if (body.priority !== undefined && body.priority !== 'normal' && !FOLLOWUP_PRIORITIES.includes(body.priority as never)) {
    return 'Unknown priority'
  }
  return null
}

/** The modal sends "<Type> - <Client>" in the user's language; else the type. */
export function followupTitle(body: Record<string, unknown>): string {
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  return (title || String(body.followup_type)).slice(0, 255)
}
