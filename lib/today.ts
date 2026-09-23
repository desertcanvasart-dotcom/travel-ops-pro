// ============================================
// "TODAY", IN THE TIMEZONE THE USER IS STANDING IN
// ============================================
// `new Date().toISOString().split('T')[0]` is the idiom this codebase reached
// for, and it is wrong by up to a day. toISOString() converts to UTC first, so
// in Tokyo (UTC+9) every moment before 09:00 local reports YESTERDAY, and in
// Cairo (UTC+2/+3) every moment before 02:00 does.
//
// That is what the 29 Aug QA audit saw as "date fields across forms default to
// yesterday" (AUT-W04): expenses, commissions, payments and the auto invoice
// issue date all defaulted to 28 August on the 29th. For an operator in Japan
// that is most of the working morning, and it lands on financial records.
//
// This formats from the LOCAL calendar fields, which is what a date input
// means by a date: no instant, no zone, just the day the user is having.
//
// ONLY CORRECT IN THE BROWSER. On the server `new Date()` is the host's clock
// — UTC on Railway — and "local" there is not the operator's timezone but the
// datacentre's. Server-side defaults need an organisation timezone, which this
// app does not model yet; those sites are deliberately left alone.

/** Today as YYYY-MM-DD in the runtime's local timezone. */
export function todayLocal(date: Date = new Date()): string {
  return toLocalDateString(date)
}

/** Any Date as YYYY-MM-DD in the runtime's local timezone. */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Today as YYYY-MM-DD in a named IANA timezone — safe on the server, where the
 * host clock is UTC. Falls back to the UTC date for an unknown zone.
 */
export function todayInTimeZone(timeZone: string, date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/**
 * The business's "today" on the server: BUSINESS_TIMEZONE (e.g. Asia/Tokyo),
 * else UTC — the app does not model an organisation timezone yet, so this is
 * the one server-side knob. Use it for "is it due today / overdue" decisions.
 */
export function businessToday(date: Date = new Date()): string {
  return todayInTimeZone(process.env.BUSINESS_TIMEZONE || 'UTC', date)
}

/**
 * "Today" for a request: the caller's own calendar date when the browser sends
 * it (`?today=YYYY-MM-DD`), else the business timezone's. One server timezone
 * cannot be right for everyone — the ops board is read in Cairo, the dashboard
 * and tasks in Tokyo — and the server clock is UTC, so a UTC "today" showed
 * yesterday's trips until 03:00 in Cairo and put tasks a day behind until 09:00
 * in Japan. Only a date within a day of the server's is accepted: a real
 * timezone is never further away than that.
 */
export function todayFromRequest(url: string | URL, date: Date = new Date()): string {
  const sent = new URL(url).searchParams.get('today')
  if (sent && /^\d{4}-\d{2}-\d{2}$/.test(sent)) {
    const diffDays = Math.abs(Date.parse(`${sent}T12:00:00Z`) - date.getTime()) / 86_400_000
    if (diffDays <= 1.5) return sent
  }
  return businessToday(date)
}

/** A YYYY-MM-DD date moved by whole days (calendar arithmetic, no time zone). */
export function shiftDateISO(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
