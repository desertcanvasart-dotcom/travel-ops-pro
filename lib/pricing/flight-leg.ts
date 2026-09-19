// ============================================
// A day's flight or train leg: its route, and airport assistance at each end
// ============================================
// A ticket leg ran FROM the previous day's city TO this day's city. That
// cannot say NMS803's day 2 (operator, 2026-09-17): the party lands in Cairo
// on the overnight flight from Narita, connects to Luxor, and boards the ship
// — day 1 has no city (it is in the air) and day 2 is filed under "Nile
// Cruise". So a day may name its leg's own route (`leg_from` / `leg_to`) and
// whether it wants assistance at each airport (`leg_assist`).
//
// Client-safe: no database, no engine import.

export interface LegAssist {
  /** Assistance at the departure airport. */
  from?: boolean
  /** Assistance at the arrival airport. */
  to?: boolean
}

const AIRPORT_CODES: Record<string, string> = {
  cairo: 'CAI',
  giza: 'CAI',
  luxor: 'LXR',
  aswan: 'ASW',
  hurghada: 'HRG',
  'sharm el-sheikh': 'SSH',
  sharm: 'SSH',
  alexandria: 'ALY',
  'abu simbel': 'ABS',
}

/**
 * The airport code for a city — the FALLBACK, for an install whose airport
 * vocabulary is not filled in yet.
 *
 * This list is nine Egyptian cities, and it used to be the only answer in the
 * system: an agency anywhere else got 'CAI' for every airport it had, silently.
 * The real list is now the agency's own (Settings → Vocabulary → Airports,
 * lib/rates/airports.ts) and callers ask it FIRST. Unknown still reads as Cairo
 * here rather than throwing, because that is what the callers that reach this
 * line have always been given — but reaching it now means the list is empty,
 * not that the world is Egypt.
 */
export function getAirportCode(city: string): string {
  return AIRPORT_CODES[String(city ?? '').trim().toLowerCase()] || 'CAI'
}

/** The airport code for a city, or null when the city has no airport on file. */
export function knownAirportCode(city: string | null | undefined): string | null {
  return AIRPORT_CODES[String(city ?? '').trim().toLowerCase()] ?? null
}

/** The airport a typed route end names: a city on file, or a typed
 *  three-letter code (NRT). null = no airport — priced as a hole naming the
 *  place, never as Cairo (Greptile on #458). */
export function routeAirportCode(place: string | null | undefined): string | null {
  const known = knownAirportCode(place)
  if (known) return known
  const typed = String(place ?? '').trim()
  return /^[A-Za-z]{3}$/.test(typed) ? typed.toUpperCase() : null
}

const place = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim().slice(0, 80) : ''
  return s || undefined
}

export function sanitizeLegPlace(v: unknown): string | undefined {
  return place(v)
}

export function sanitizeLegAssist(v: unknown): LegAssist | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  const out: LegAssist = {}
  if (typeof r.from === 'boolean') out.from = r.from
  if (typeof r.to === 'boolean') out.to = r.to
  return Object.keys(out).length ? out : undefined
}

/**
 * Whether each end of a FLIGHT leg gets assistance.
 *
 * On the arrival day — the first day on the ground (the first day not spent
 * in the air), the SAME rule in the day editor and in pricing — the party is met where the international flight lands
 * (the leg's departure airport, already the day's Meet & Greet) and again at
 * the connection's destination: both default ON. On any other flight day
 * both default OFF, which is what every existing programme priced. A day
 * that says so explicitly wins.
 */
export function legAssistance(assist: LegAssist | undefined, isArrivalDay: boolean): { from: boolean; to: boolean } {
  return {
    from: assist?.from ?? isArrivalDay,
    to: assist?.to ?? isArrivalDay,
  }
}
