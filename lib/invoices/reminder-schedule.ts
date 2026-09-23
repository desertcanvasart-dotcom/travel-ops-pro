// ============================================
// Invoice reminders — which reminder, and when
// ============================================
// One rule for the manual reminder routes and the daily cron. The old maths
// was Math.floor((new Date(due_date) - Date.now()) / day): new Date('YYYY-MM-DD')
// is midnight UTC, and "now" is later that day, so an invoice due TODAY came out
// at -1 — "0 days overdue" — and one due tomorrow as "due today". Counting whole
// calendar days between two date strings has no time of day in it at all.

export type ReminderStage = 'before_due_7' | 'before_due_3' | 'on_due' | 'overdue_7' | 'overdue_14' | 'overdue_30'

const DAY_MS = 86_400_000
const utcMidnight = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)

/** Whole calendar days from `today` to `dueDate` (both YYYY-MM-DD).
 *  Due today → 0, tomorrow → 1, yesterday → -1. */
export function daysUntilDue(dueDate: string, today: string): number {
  return Math.round((utcMidnight(dueDate) - utcMidnight(today)) / DAY_MS)
}

/**
 * The reminder a balance gets, or null when it is too early for one. The copy
 * is fixed per stage ("あと7日", "あと3日"), so a bill 30 days out must NOT get
 * before_due_7 — it used to, because anything over 5 days out mapped to it.
 */
export function reminderStage(daysUntil: number): ReminderStage | null {
  if (daysUntil > 7) return null
  if (daysUntil > 3) return 'before_due_7'
  if (daysUntil > 0) return 'before_due_3'
  if (daysUntil === 0) return 'on_due'
  if (daysUntil >= -7) return 'overdue_7'
  if (daysUntil >= -14) return 'overdue_14'
  return 'overdue_30'
}

/** YYYY-MM-DD plus `days` (negative to subtract). */
export function addDaysISO(iso: string, days: number): string {
  return new Date(utcMidnight(iso) + days * DAY_MS).toISOString().slice(0, 10)
}

/** When a balance that is too early for a reminder should next be looked at:
 *  seven days before it falls due. */
export function firstReminderDate(dueDate: string): string {
  return addDaysISO(dueDate, -7)
}
