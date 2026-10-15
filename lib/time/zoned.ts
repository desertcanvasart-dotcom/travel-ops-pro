// ============================================
// A wall-clock time in a named time zone → the instant
// ============================================
// "Send at 9:00 Japan time" means 9:00 in Asia/Tokyo whatever zone the
// sender's computer is in (the office is in Egypt, the customers in Japan).
// Pure, Intl only — no time-zone library.

/** The zone's offset from UTC at `instant`, in minutes (Tokyo: +540). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000)
}

/**
 * "2026-10-16T09:00" in `timeZone` → the instant. Two passes, so a time on a
 * day the zone changes its offset (summer time) lands right.
 */
export function zonedTimeToUtc(local: string, timeZone: string): Date | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return null
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  let guess = new Date(wall - zoneOffsetMinutes(new Date(wall), timeZone) * 60000)
  guess = new Date(wall - zoneOffsetMinutes(guess, timeZone) * 60000)
  return Number.isNaN(guess.getTime()) ? null : guess
}

/** Today's date in `timeZone`, as YYYY-MM-DD. */
export function zonedToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** YYYY-MM-DD plus `days`. */
export function addDaysIso(date: string, days: number): string {
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10)
}

/** The instant of `hh:mm` on the next day in `timeZone` that is `weekday`
 *  (0 = Sunday … 6), or tomorrow when `weekday` is omitted. */
export function nextAt(timeZone: string, hhmm: string, weekday?: number, now: Date = new Date()): Date | null {
  const today = zonedToday(timeZone, now)
  let date = addDaysIso(today, 1)
  if (weekday !== undefined) {
    for (let i = 1; i <= 7; i++) {
      const candidate = addDaysIso(today, i)
      const [y, mo, d] = candidate.split('-').map(Number)
      if (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === weekday) { date = candidate; break }
    }
  }
  return zonedTimeToUtc(`${date}T${hhmm}`, timeZone)
}

/** The instant shown in `timeZone`, e.g. "Fri 16 Oct, 09:00". */
export function formatInZone(instant: Date, timeZone: string, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(instant)
}
