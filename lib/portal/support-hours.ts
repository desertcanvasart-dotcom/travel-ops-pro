// ============================================
// When the office answers, and what the traveller is told
// ============================================
// The office is in Egypt and the travellers are in Japan, six or seven hours
// ahead. A message sent in the Japanese evening lands in Cairo overnight. That
// is fine — as long as the traveller is TOLD, because the alternative is a
// chat box that looks ignored at exactly the moment somebody is anxious about
// a passport or a payment.
//
// So the portal states the hours, and the first message in a conversation gets
// an automatic acknowledgement saying when a reply is coming. The
// acknowledgement is stored as a real message rather than rendered as UI text:
// the traveller sees it in sequence, and the operator can see exactly what was
// promised and when.

/** days: 1 = Monday … 7 = Sunday, matching ISO. */
export interface SupportHours {
  timezone: string
  days: number[]
  from: string   // 'HH:MM'
  to: string     // 'HH:MM'
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Read the org's configured hours, or null when none are set. Nothing here
 *  invents a default: an office that has not stated its hours should promise
 *  nothing rather than promise wrongly. */
export function parseSupportHours(value: unknown): SupportHours | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const timezone = typeof v.timezone === 'string' && v.timezone.trim() ? v.timezone.trim() : null
  const from = typeof v.from === 'string' ? v.from.trim() : ''
  const to = typeof v.to === 'string' ? v.to.trim() : ''
  const days = Array.isArray(v.days)
    ? v.days.map(Number).filter(d => Number.isInteger(d) && d >= 1 && d <= 7)
    : []
  if (!timezone || !HHMM.test(from) || !HHMM.test(to) || days.length === 0) return null
  return { timezone, days, from, to }
}

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** The weekday (ISO 1-7) and minute-of-day in the OFFICE's timezone, not the
 *  server's and not the traveller's. Intl does the conversion so this holds
 *  across daylight saving without a date library. */
function officeClock(at: Date, timezone: string): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  const day = weekdays[get('weekday')] ?? 1
  // '24' at midnight in some locales; normalise so 24:00 reads as 00:00.
  const hour = Number(get('hour')) % 24
  return { day, minute: hour * 60 + Number(get('minute')) }
}

/** Is the office open right now? */
export function isOfficeOpen(hours: SupportHours | null, at: Date): boolean {
  if (!hours) return false
  const { day, minute } = officeClock(at, hours.timezone)
  if (!hours.days.includes(day)) return false
  return minute >= minutes(hours.from) && minute < minutes(hours.to)
}

const JA_DAYS = ['', '月', '火', '水', '木', '金', '土', '日']

/** "月〜金 9:00–17:00" — the run of days collapsed when it is contiguous,
 *  because "月・火・水・木・金" is a worse thing to read. */
export function describeHoursJa(hours: SupportHours | null): string | null {
  if (!hours) return null
  const days = [...hours.days].sort((a, b) => a - b)
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1)
  const label = days.length === 1
    ? JA_DAYS[days[0]]
    : contiguous
      ? `${JA_DAYS[days[0]]}〜${JA_DAYS[days[days.length - 1]]}`
      : days.map(d => JA_DAYS[d]).join('・')
  return `${label} ${hours.from}〜${hours.to}`
}

/**
 * The automatic acknowledgement, in Japanese, for the first message of a
 * conversation.
 *
 * Deliberately does NOT promise a time when no hours are configured — an
 * office that has not said when it answers should not have words put in its
 * mouth. It still confirms the message arrived, which is the part that stops
 * the traveller wondering whether the button worked.
 */
export function acknowledgementJa(hours: SupportHours | null, at: Date): string {
  const received = 'メッセージを受け付けました。'
  const described = describeHoursJa(hours)
  if (!described) {
    return `${received}担当者より順次ご返信いたします。`
  }
  if (isOfficeOpen(hours, at)) {
    return `${received}営業時間内ですので、担当者より順次ご返信いたします。（受付時間：${described} エジプト時間）`
  }
  return `${received}ただいま営業時間外のため、次の営業時間内に担当者よりご返信いたします。（受付時間：${described} エジプト時間）`
}
