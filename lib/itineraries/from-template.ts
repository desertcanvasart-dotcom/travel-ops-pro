// ============================================
// Starting a trip from a programme
// ============================================
// The CRM's "New trip" used to hand back an empty form: name, dates, pax. But
// most trips ARE a programme the operator already sells, and starting from one
// is what makes the rest of the system work — the trip carries `template_id`,
// which is how the extras catalogue knows which options belong to this
// programme (docs/plans/extras-and-upgrades.md §5a/§6b).
//
// This is deliberately a LINK plus a couple of sensible defaults, not a day
// plan: building the days is what the quote flow and the generator do, and
// silently materialising a week of services from a dropdown would be a
// surprise, not a convenience.

export interface TripTemplate {
  id: string
  template_name: string
  template_code?: string | null
  duration_days?: number | null
}

/**
 * The last day of a trip that starts on `start` and runs `durationDays` days.
 *
 * Inclusive of the first day: a 5-day programme starting Monday ends Friday,
 * not Saturday. Returns null when either input is unusable rather than
 * inventing a date.
 */
export function deriveEndDate(start: unknown, durationDays: unknown): string | null {
  if (typeof start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null
  const days = Math.floor(Number(durationDays))
  if (!Number.isFinite(days) || days < 1) return null

  // UTC throughout: a local-time Date on a machine behind UTC turns
  // '2026-07-01' into 30 June, and the trip quietly loses a day.
  const startMs = Date.parse(`${start}T00:00:00Z`)
  if (!Number.isFinite(startMs)) return null
  return new Date(startMs + (days - 1) * 86400000).toISOString().slice(0, 10)
}

export interface TripFormFields {
  trip_name: string
  start_date: string
  end_date: string
}

export interface TemplateSelection {
  template_id: string | null
  trip_name: string
  end_date: string
}

/**
 * What choosing (or clearing) a programme does to the form.
 *
 * TWO RULES, both about not destroying the operator's own work:
 *
 *   The NAME is only filled in when it is still blank. Somebody who typed
 *   "Tanaka family — Nile, October" meant it, and a dropdown must not replace
 *   it with the catalogue's wording.
 *
 *   The END DATE is derived whenever the programme and a start date allow it,
 *   because the length IS the programme — picking an 8-day tour and keeping a
 *   5-day window would quote the wrong trip. It stays editable afterwards for
 *   the trip that genuinely runs long.
 *
 * Clearing the programme unlinks it and changes nothing else: the dates and the
 * name that are already there describe a real trip either way.
 */
export function applyTemplate(
  template: TripTemplate | null,
  current: TripFormFields
): TemplateSelection {
  if (!template) {
    return { template_id: null, trip_name: current.trip_name, end_date: current.end_date }
  }

  const derived = deriveEndDate(current.start_date, template.duration_days)

  return {
    template_id: template.id,
    trip_name: current.trip_name.trim() ? current.trip_name : template.template_name,
    end_date: derived ?? current.end_date,
  }
}

/** How a programme reads in the picker: code, name, and how long it runs. */
export function templateLabel(template: TripTemplate): string {
  const days = Math.floor(Number(template.duration_days))
  const length = Number.isFinite(days) && days > 0 ? ` · ${days} day${days === 1 ? '' : 's'}` : ''
  const code = template.template_code ? `${template.template_code} — ` : ''
  return `${code}${template.template_name}${length}`
}
