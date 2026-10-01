// ============================================
// Departures, one row per programme
// ============================================
// The departures page lists programmes, not dates (operator, 2026-10-01):
// a season of weekly dates per programme made a flat list of hundreds. Each
// programme's dates are priced and run on its grid page.

export interface GroupableDeparture {
  id: string
  template_id: string | null
  tour_name: string
  tour_code: string | null
  duration_days: number
  start_date: string
  max_pax: number
  booked_pax: number
  status: string
  tour_template?: { template_name: string; template_code: string; duration_days: number } | null
}

export interface GroupableTemplate {
  id: string
  template_name: string
  template_code: string
  duration_days: number
}

export interface ProgrammeGroup<D extends GroupableDeparture = GroupableDeparture> {
  /** template id, or "custom:<tour name>" for a departure with no template. */
  key: string
  templateId: string | null
  name: string
  code: string | null
  durationDays: number
  /** In date order. */
  departures: D[]
}

/**
 * Every active programme (with or without departures), plus any departure
 * whose template is not in that list — an inactive one, or none at all.
 * Programmes with dates come first, by their next date; then the rest by name.
 */
export function buildProgrammeGroups<D extends GroupableDeparture>(templates: GroupableTemplate[], departures: D[]): ProgrammeGroup<D>[] {
  const byKey = new Map<string, ProgrammeGroup<D>>()
  for (const t of templates) {
    byKey.set(t.id, { key: t.id, templateId: t.id, name: t.template_name, code: t.template_code || null, durationDays: t.duration_days || 0, departures: [] })
  }
  for (const d of departures) {
    const key = d.template_id ?? `custom:${d.tour_name}`
    let g = byKey.get(key)
    if (!g) {
      g = {
        key,
        templateId: d.template_id,
        name: d.tour_template?.template_name ?? d.tour_name,
        code: d.tour_template?.template_code ?? d.tour_code ?? null,
        durationDays: d.tour_template?.duration_days ?? d.duration_days ?? 0,
        departures: [],
      }
      byKey.set(key, g)
    }
    g.departures.push(d)
  }
  const groups = [...byKey.values()]
  for (const g of groups) g.departures.sort((a, b) => a.start_date.localeCompare(b.start_date))
  return groups.sort((a, b) => {
    const an = a.departures[0]?.start_date
    const bn = b.departures[0]?.start_date
    if (an && bn) return an.localeCompare(bn) || a.name.localeCompare(b.name)
    if (an) return -1
    if (bn) return 1
    return a.name.localeCompare(b.name)
  })
}

/** What a programme row says about its dates. Cancelled dates hold no seats. */
export function summarise(departures: GroupableDeparture[]) {
  const live = departures.filter(d => d.status !== 'cancelled')
  return {
    count: departures.length,
    next: live[0]?.start_date ?? departures[0]?.start_date ?? null,
    last: live[live.length - 1]?.start_date ?? null,
    booked: live.reduce((n, d) => n + (d.booked_pax || 0), 0),
    seats: live.reduce((n, d) => n + (d.max_pax || 0), 0),
    guaranteed: departures.filter(d => d.status === 'guaranteed').length,
    full: departures.filter(d => d.status === 'full').length,
    cancelled: departures.length - live.length,
  }
}

export function shortDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
