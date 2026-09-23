// ============================================
// Departure date generation
// ============================================
// Adding departure dates one at a time does not scale past a handful. These
// pure helpers turn a rule — a weekly pattern or a fixed interval across a date
// range — into the list of start dates the bulk endpoint then inserts (skipping
// any that already exist, via the (org_id, template_id, start_date) unique key).
// Kept pure and date-fns-based so the modal's preview and any test agree.

import { addDays, eachDayOfInterval, format, getDay, parseISO, isValid } from 'date-fns'

/** Safety cap: no rule should mint more than a year of daily departures in one
 *  go. The API enforces the same limit. */
export const MAX_GENERATED_DATES = 366

const iso = (d: Date): string => format(d, 'yyyy-MM-dd')

function boundedRange(startISO: string, endISO: string): { start: Date; end: Date } | null {
  if (!startISO || !endISO) return null
  const start = parseISO(startISO)
  const end = parseISO(endISO)
  if (!isValid(start) || !isValid(end) || end < start) return null
  return { start, end }
}

/**
 * Every date in [startISO, endISO] whose weekday is selected.
 * `weekdays` are JS weekday numbers: 0 = Sunday … 6 = Saturday.
 */
export function datesByWeekday(startISO: string, endISO: string, weekdays: readonly number[]): string[] {
  const range = boundedRange(startISO, endISO)
  if (!range || weekdays.length === 0) return []
  const want = new Set(weekdays)
  return eachDayOfInterval(range)
    .filter(d => want.has(getDay(d)))
    .slice(0, MAX_GENERATED_DATES)
    .map(iso)
}

/**
 * Dates from startISO up to and including endISO, one every `stepDays` days.
 * A step of the tour's own length gives back-to-back departures.
 */
export function datesByInterval(startISO: string, endISO: string, stepDays: number): string[] {
  const range = boundedRange(startISO, endISO)
  if (!range || !Number.isFinite(stepDays) || stepDays < 1) return []
  const step = Math.floor(stepDays)
  const out: string[] = []
  for (let d = range.start; d <= range.end && out.length < MAX_GENERATED_DATES; d = addDays(d, step)) {
    out.push(iso(d))
  }
  return out
}

/** Normalise, validate and de-duplicate a hand-picked list to yyyy-MM-dd. */
export function normaliseDates(dates: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const raw of dates) {
    if (!raw) continue
    const d = parseISO(raw.slice(0, 10))
    if (!isValid(d)) continue
    seen.add(iso(d))
  }
  return [...seen].sort().slice(0, MAX_GENERATED_DATES)
}

/**
 * Add whole months to a yyyy-MM-dd date string, timezone-independent. Parsing
 * the string as local midnight and printing it with toISOString() (UTC) moved
 * the result a day earlier anywhere east of UTC — in Japan the default range
 * ended one day short. Doing the arithmetic in UTC end to end avoids that.
 * Day overflow rolls forward like Date does (Jan 31 + 1 month → Mar 3).
 */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10)
}
