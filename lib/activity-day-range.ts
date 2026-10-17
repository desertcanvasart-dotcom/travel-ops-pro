// ============================================
// A calendar day, in the viewer's time zone, as an instant range
// ============================================
// The Activity Log shows each entry in the viewer's local time, so its From
// and To dates must mean the viewer's local days too. They meant UTC days:
// in Tokyo (UTC+9) filtering 14 October dropped 00:00–08:59 that morning and
// took in the 15th up to 08:59. The browser sends its IANA zone (`tz`, the
// same idea as lib/today's `?today=`) and the bounds are computed here; an
// unknown or missing zone falls back to UTC, the old behaviour.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Minutes the zone is ahead of UTC at `instant` (Tokyo: 540). */
function offsetMinutes(timeZone: string, instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - instant) / 60_000)
}

function validZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

/** The instant local midnight starts `day` in `tz`, as an ISO string. */
export function startOfDayIn(day: string, tz: string | null | undefined): string | null {
  if (!ISO_DAY.test(day)) return null
  const zone = validZone(tz)
  const midnightUtc = Date.parse(`${day}T00:00:00Z`)
  if (Number.isNaN(midnightUtc)) return null
  // Two passes: the offset at UTC midnight can differ from the offset at local
  // midnight on a daylight-saving changeover day.
  let t = midnightUtc - offsetMinutes(zone, midnightUtc) * 60_000
  t = midnightUtc - offsetMinutes(zone, t) * 60_000
  return new Date(t).toISOString()
}

/**
 * `from` and `to` (YYYY-MM-DD, inclusive) as `created_at >= gte` and
 * `created_at < lt`. Either side may be absent.
 */
export function dayRangeIn(
  from: string | null | undefined,
  to: string | null | undefined,
  tz: string | null | undefined,
): { gte: string | null; lt: string | null } {
  const gte = from ? startOfDayIn(from, tz) : null
  let lt: string | null = null
  if (to && ISO_DAY.test(to)) {
    const next = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    lt = startOfDayIn(next, tz)
  }
  return { gte, lt }
}
