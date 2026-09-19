// ============================================
// A rate's dates, as a person reads them
// ============================================
// The pricing grid shows one number per rate option and says nothing about
// when that number applies. Two seasons of one fare therefore render as two
// identical lines —
//
//     EgyptAir Cairo→Luxor (economy)
//     EgyptAir Cairo→Luxor (economy)
//
// — and picking the wrong one is silent. The grid also prices hotels and
// cruises from the base columns, which mirror the FIRST dated period, so a
// December quote can be showing the June rate with nothing on screen to say so.
//
// This is the shared vocabulary for saying which dates a shown price belongs
// to. It does NOT choose a rate: the grid still shows everything and still
// prices what the operator picked. It only stops the date being invisible.
//
// Pure, and used on both sides — the rates route builds the labels, the
// completeness gate compares them against the grid's start date.

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** A date-only string, or null if it is absent or unreadable. */
export function dateOnly(value: unknown): string | null {
  const iso = String(value ?? '').trim().slice(0, 10)
  if (!ISO.test(iso)) return null
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso
}

/** Inclusive at both ends, like every other window in the engine. An absent
 *  edge is open — it never excludes, the same rule the ticket resolver uses. */
export function withinWindow(
  date: string | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined
): boolean {
  const at = dateOnly(date)
  if (at == null) return true
  const start = dateOnly(from)
  const end = dateOnly(to)
  if (start && at < start) return false
  if (end && at > end) return false
  return true
}

/** "2026-06-01 – 2026-09-30", "from 2026-06-01", "until 2026-09-30", or null
 *  when the rate carries no dates at all (most of the catalogue). */
export function windowLabel(from: unknown, to: unknown): string | null {
  const start = dateOnly(from)
  const end = dateOnly(to)
  // An open end entered as the form's far-future default is not information.
  const meaningfulEnd = end && end < '2090-01-01' ? end : null
  if (start && meaningfulEnd) return `${start} – ${meaningfulEnd}`
  if (start) return `from ${start}`
  if (meaningfulEnd) return `until ${meaningfulEnd}`
  return null
}

/** One dated period of a hotel or ship, flattened for the grid. */
export interface OptionPeriod {
  name: string
  from: string
  to: string
}

/**
 * Which of a property's periods covers a date — the SHORTEST that does, the
 * same precedence lib/rates/rate-seasons applies, so a Christmas window inside
 * a broad winter one wins.
 *
 * Returns null when no period covers it: on this surface that is a warning,
 * not a hole, because the grid prices what the operator picked either way.
 */
export function periodCovering(
  periods: OptionPeriod[] | null | undefined,
  date: string | null | undefined
): OptionPeriod | null {
  const at = dateOnly(date)
  if (at == null || !periods?.length) return null
  let best: OptionPeriod | null = null
  let bestSpan = Infinity
  for (const p of periods) {
    const from = dateOnly(p.from)
    const to = dateOnly(p.to)
    if (!from || !to || at < from || at > to) continue
    const span = Date.parse(to) - Date.parse(from)
    if (span < bestSpan) {
      best = p
      bestSpan = span
    }
  }
  return best
}

/** A period as a line in a dropdown: its name and its dates. */
export function periodLabel(period: OptionPeriod): string {
  const dates = windowLabel(period.from, period.to)
  return period.name && dates ? `${period.name} ${dates}` : period.name || dates || ''
}
