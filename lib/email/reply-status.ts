// ============================================
// Is a customer waiting for an answer?
// ============================================
// email_conversations.awaiting_reply_since (migration 20261019) is the
// customer's first message after our last reply — NULL once anyone answers,
// from the app or from Gmail directly (the scheduled sync stores both). A
// conversation waiting longer than REPLY_OVERDUE_HOURS is overdue: it goes on
// the dashboard's Needs Attention list.
//
// Client-safe.

export const REPLY_OVERDUE_HOURS = 24

export function hoursWaiting(awaitingSince: string | null | undefined, now: Date = new Date()): number | null {
  if (!awaitingSince) return null
  const t = new Date(awaitingSince).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, (now.getTime() - t) / 3_600_000)
}

export const isReplyOverdue = (awaitingSince: string | null | undefined, now: Date = new Date()): boolean =>
  (hoursWaiting(awaitingSince, now) ?? -1) >= REPLY_OVERDUE_HOURS

/** "35m", "5h", "2d" — how long a customer has been waiting. */
export function waitingLabel(awaitingSince: string | null | undefined, now: Date = new Date()): string | null {
  const h = hoursWaiting(awaitingSince, now)
  if (h === null) return null
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`
  if (h < 48) return `${Math.floor(h)}h`
  return `${Math.floor(h / 24)}d`
}
