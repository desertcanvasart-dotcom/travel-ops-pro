// ============================================
// A programme day's transport, as the operator sets it
// ============================================
// Every day's transport used to be derived and never shown: airport transfer
// on arrival, a road transfer on a city change, a half- or full-day vehicle by
// how many attractions, nothing on a cruise-package day. Attractions could be
// seen and changed on the day; transport could not (operator, 2026-09-16).
//
// `transport_lines` on the programme day is the operator's own list. ABSENT =
// the rules decide (unchanged). PRESENT (even empty) = exactly these lines,
// and the rules stay out of that day — the list is what the day editor showed
// and the operator changed, so nothing is added behind their back. "Reset to
// automatic" removes the field.
//
// Client-safe: no database, no engine import.

export const TRANSPORT_SERVICE_TYPES = [
  'airport_transfer',
  'airport_with_sightseeing',
  'city_transfer',
  'city_tour',
  'half_day',
  'day_tour',
  'extended_day_tour',
  'intercity',
  'intercity_with_sightseeing',
  'sound_light',
  'dinner_transfer',
] as const

export type TransportLineType = (typeof TRANSPORT_SERVICE_TYPES)[number]

export interface TransportLine {
  service_type: TransportLineType
  /** Where the vehicle is booked; absent = the day's city. */
  city?: string
  /** Road transfers only: from and to; absent = yesterday's city → today's. */
  from?: string
  to?: string
}

export const isRoadTransfer = (t: string): boolean => t === 'intercity' || t === 'intercity_with_sightseeing'

/** Sightseeing lines are priced by the area the day's attractions are in. */
export const isSightseeing = (t: string): boolean =>
  ['airport_with_sightseeing', 'city_tour', 'half_day', 'day_tour', 'extended_day_tour', 'intercity_with_sightseeing'].includes(t)

/** The duration the transport rate table is keyed by — the same the rules use. */
export function durationFor(t: TransportLineType): 'half_day' | 'full_day' | 'one_way' {
  if (t === 'half_day') return 'half_day'
  if (t === 'day_tour' || t === 'extended_day_tour' || t === 'city_tour') return 'full_day'
  return 'one_way'
}

const place = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim().slice(0, 80) : ''
  return s || undefined
}

/** The stored list, cleaned. undefined = not set (the rules decide); an empty
 *  array = the operator removed every line (no transport that day). */
export function sanitizeTransportLines(input: unknown): TransportLine[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out: TransportLine[] = []
  for (const raw of input.slice(0, 12)) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const type = String(r.service_type ?? '')
    if (!(TRANSPORT_SERVICE_TYPES as readonly string[]).includes(type)) continue
    const line: TransportLine = { service_type: type as TransportLineType }
    const city = place(r.city)
    if (city) line.city = city
    if (isRoadTransfer(type)) {
      const from = place(r.from)
      const to = place(r.to)
      if (from) line.from = from
      if (to) line.to = to
    }
    out.push(line)
  }
  return out
}
