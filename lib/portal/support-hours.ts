// ============================================
// When somebody answers, and what the traveller is told
// ============================================
// There are TWO offices, on different working weeks:
//
//   Tokyo / Osaka   Mon-Fri  09:00-17:00  Asia/Tokyo
//   Cairo           Sun-Thu  09:00-17:00  Africa/Cairo
//
// Which matters more than it first looks. A single Cairo office would leave a
// Japanese traveller writing in the evening waiting overnight; with a Japan
// office on Japanese hours, and Cairo's afternoon landing in the Japanese
// evening, the two together cover most of a Japanese waking day. Friday is
// Japan only, Sunday is Cairo only, and Saturday nobody.
//
// So "are we open" is asked of ALL offices, and when none are, the traveller is
// told WHEN the next one opens — in Japan time, because that is the clock they
// are reading. "We reply at 9am tomorrow" is a different message from "we are
// closed", and only one of them keeps somebody from worrying.

/** days: 1 = Monday … 7 = Sunday, matching ISO. */
export interface SupportOffice {
  label: string
  labelJa: string
  timezone: string
  days: number[]
  from: string   // 'HH:MM'
  to: string     // 'HH:MM'
}

/** The portal is Japanese-only, so hours are quoted in the traveller's clock. */
export const TRAVELLER_TIMEZONE = 'Asia/Tokyo'

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

function parseOffice(value: unknown): SupportOffice | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const timezone = typeof v.timezone === 'string' && v.timezone.trim() ? v.timezone.trim() : null
  const from = typeof v.from === 'string' ? v.from.trim() : ''
  const to = typeof v.to === 'string' ? v.to.trim() : ''
  const days = Array.isArray(v.days)
    ? [...new Set(v.days.map(Number).filter(d => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b)
    : []
  if (!timezone || !HHMM.test(from) || !HHMM.test(to) || to <= from || days.length === 0) return null
  const label = typeof v.label === 'string' && v.label.trim() ? v.label.trim() : timezone
  const labelJa = typeof v.labelJa === 'string' && v.labelJa.trim() ? v.labelJa.trim() : label
  return { label, labelJa, timezone, days, from, to }
}

/**
 * Read the configured offices. Returns [] when nothing usable is configured —
 * an office that has not stated its hours should promise nothing rather than
 * have hours guessed for it.
 *
 * Accepts a bare object as well as an array, so a single-office configuration
 * written before there were two does not silently stop working.
 */
export function parseSupportOffices(value: unknown): SupportOffice[] {
  const raw = Array.isArray(value) ? value : value ? [value] : []
  return raw.map(parseOffice).filter((o): o is SupportOffice => o !== null)
}

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** The weekday (ISO 1-7) and minute-of-day in a given zone. Intl does the
 *  conversion, so this stays correct across daylight saving without a date
 *  library — Cairo observes it, Tokyo does not. */
function clockIn(at: Date, timezone: string): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(at)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return {
    day: weekdays[get('weekday')] ?? 1,
    minute: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
  }
}

export function isOfficeOpen(office: SupportOffice, at: Date): boolean {
  const { day, minute } = clockIn(at, office.timezone)
  return office.days.includes(day) && minute >= minutes(office.from) && minute < minutes(office.to)
}

/** Is ANY office open? Which one does not matter to the traveller. */
export function isAnyOfficeOpen(offices: SupportOffice[], at: Date): boolean {
  return offices.some(o => isOfficeOpen(o, at))
}

const STEP_MS = 15 * 60 * 1000
const HORIZON_MS = 8 * 24 * 60 * 60 * 1000

/**
 * The next moment any office is open, or null if none is within a week.
 *
 * Walks forward in quarter-hours rather than doing calendar arithmetic per
 * zone. It is a rare path, the loop is under a thousand iterations, and it is
 * correct across daylight saving and differing working weeks by construction —
 * which hand-rolled date maths across two timezones is not.
 */
export function nextOpening(offices: SupportOffice[], at: Date): Date | null {
  if (offices.length === 0) return null
  for (let t = at.getTime() + STEP_MS; t <= at.getTime() + HORIZON_MS; t += STEP_MS) {
    const when = new Date(t)
    if (isAnyOfficeOpen(offices, when)) return when
  }
  return null
}

const JA_DAYS = ['', '月', '火', '水', '木', '金', '土', '日']

/**
 * "月〜金", and crucially "日〜木".
 *
 * The Egyptian working week runs Sunday to Thursday, which crosses the end of
 * the ISO week: Sunday is 7 and Monday is 1, so a plain ascending check reads
 * it as five scattered days and prints 日・月・火・水・木. The run is found by
 * trying each day as a start and walking forward with the week wrapping, which
 * is what "Sunday to Thursday" means to the person reading it.
 */
const dayLabel = (days: number[]): string => {
  if (days.length === 1) return JA_DAYS[days[0]]
  if (days.length === 7) return `${JA_DAYS[1]}〜${JA_DAYS[7]}`

  const set = new Set(days)
  const nextDay = (d: number) => (d === 7 ? 1 : d + 1)

  for (const start of days) {
    let cursor = start
    let covered = 1
    while (covered < days.length && set.has(nextDay(cursor))) {
      cursor = nextDay(cursor)
      covered++
    }
    if (covered === days.length) return `${JA_DAYS[start]}〜${JA_DAYS[cursor]}`
  }
  return days.map(d => JA_DAYS[d]).join('・')
}

/** One line per office: "東京・大阪 月〜金 9:00〜17:00（日本時間）". */
export function describeOfficesJa(offices: SupportOffice[]): string[] {
  return offices.map(o => `${o.labelJa} ${dayLabel(o.days)} ${o.from}〜${o.to}`)
}

/** "8月27日(火) 9:00" in the traveller's clock, not the office's. */
export function formatInTravellerTimeJa(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TRAVELLER_TIMEZONE,
    month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(at)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const weekdays: Record<string, string> = {
    Mon: '月', Tue: '火', Wed: '水', Thu: '木', Fri: '金', Sat: '土', Sun: '日',
  }
  // Number() strips the zero padding Intl adds when other fields are 2-digit:
  // "8月30日", not "08月30日".
  return `${Number(get('month'))}月${Number(get('day'))}日(${weekdays[get('weekday')] ?? ''}) ${Number(get('hour'))}:${get('minute')}`
}

/**
 * The automatic acknowledgement for the first message of a conversation.
 *
 * Out of hours it names the next opening in JAPAN time. "We will reply from
 * 9:00 on Tuesday" is a different message from "we are closed", and only one of
 * them stops somebody wondering whether they have been forgotten.
 */
export function acknowledgementJa(offices: SupportOffice[], at: Date): string {
  const received = 'メッセージを受け付けました。'
  if (offices.length === 0) return `${received}担当者より順次ご返信いたします。`
  if (isAnyOfficeOpen(offices, at)) return `${received}担当者より順次ご返信いたします。`

  const next = nextOpening(offices, at)
  if (!next) return `${received}担当者より順次ご返信いたします。`
  return `${received}ただいま受付時間外です。${formatInTravellerTimeJa(next)}（日本時間）以降に担当者よりご返信いたします。`
}
