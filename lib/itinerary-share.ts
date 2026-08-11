// ============================================
// SHAREABLE ITINERARY LINKS
// ============================================
// The traveller gets a URL instead of (only) a PDF: one branded page that
// always shows the current itinerary. Two invariants live in this file:
//
// 1. TOKENS ARE UNGUESSABLE. 192 bits of crypto randomness, base64url. The
//    public page resolves them through the service role, so revocation cannot
//    be bypassed and the share table itself is never browser-queryable.
//
// 2. THE CLIENT VIEW IS AN ALLOWLIST. toClientItinerary() copies named fields
//    only — it never spreads. Whatever internal columns the queries happen to
//    return (supplier_cost, profit, margin_percent, partner_commission_amount,
//    assigned_*_id, internal notes), the page receives none of them. A
//    blocklist would silently leak every column added later; an allowlist
//    fails closed. The tests feed it a row containing the whole cost base and
//    assert none of it survives.

/** itinerary_days.day_type — the CHECK-constrained vocabulary (see 20260627). */
export type ShareDayType = 'arrival' | 'tour' | 'transfer' | 'cruise' | 'free' | 'departure'

const DAY_TYPES: readonly string[] = ['arrival', 'tour', 'transfer', 'cruise', 'free', 'departure']

export interface ClientItinerary {
  tripName: string
  code: string
  startDate: string | null
  endDate: string | null
  totalDays: number | null
  numAdults: number
  numChildren: number
  numInfants: number
  currency: string | null
  /** The CLIENT price. The one money field on this page. */
  totalPrice: number | null
  tier: string | null
  /** Operator-authored and already client-facing (they appear on quote PDFs). */
  inclusions: string[]
  exclusions: string[]
  days: ClientDay[]
}

export interface ClientDay {
  dayNumber: number
  date: string | null
  title: string | null
  description: string | null
  city: string | null
  overnightCity: string | null
  attractions: string[]
  /** Null when the row predates day_type or carries an unknown value. */
  dayType: ShareDayType | null
  lunchIncluded: boolean
  dinnerIncluded: boolean
  hotelIncluded: boolean
  hasSightseeing: boolean
  /** Airport/flight legs the traveller needs; internal transport is omitted. */
  flightFrom: string | null
  airportArrival: string | null
  airportDeparture: string | null
}

/** 24 crypto-random bytes as base64url — 192 bits, URL-safe, no padding. */
export function generateShareToken(): string {
  const bytes = new Uint8Array(24)
  globalThis.crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Tokens we mint are 32 chars of base64url; reject anything else up front. */
export function isValidShareToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32}$/.test(token)
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/**
 * inclusions/exclusions are jsonb and have been written both as a string[] and
 * as a newline-joined string over this app's life. Normalise both shapes; drop
 * anything else rather than rendering "[object Object]" at a client.
 */
const strList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  if (typeof v === 'string') return v.split('\n').map(s => s.trim()).filter(Boolean)
  return []
}

/**
 * The traveller-facing projection. Named copies only — see the header.
 *
 * Deliberately absent: `notes` (the operator's special-request scratchpad —
 * internal even when it started as the client's own words),
 * `generation_warnings` (AI diagnostics), `guide_notes`/`hotel_notes`/etc
 * (supplier-facing instructions), and every assigned_*_id (supplier identities
 * a client has no business seeing).
 */
export function toClientItinerary(
  itinerary: Record<string, unknown>,
  days: Array<Record<string, unknown>>
): ClientItinerary {
  return {
    tripName: str(itinerary.trip_name) ?? 'Your trip',
    code: str(itinerary.itinerary_code) ?? '',
    startDate: str(itinerary.start_date),
    endDate: str(itinerary.end_date),
    totalDays: num(itinerary.total_days),
    numAdults: num(itinerary.num_adults) ?? 0,
    numChildren: num(itinerary.num_children) ?? 0,
    numInfants: num(itinerary.num_infants) ?? 0,
    currency: str(itinerary.currency),
    // total_cost IS the client price in this app (standardized in the
    // 2026-07-02 audit); supplier_cost is the internal figure and is not here.
    totalPrice: num(itinerary.total_cost),
    tier: str(itinerary.tier),
    inclusions: strList(itinerary.inclusions),
    exclusions: strList(itinerary.exclusions),
    days: (days ?? [])
      .slice()
      .sort((a, b) => (num(a.day_number) ?? 0) - (num(b.day_number) ?? 0))
      .map((d) => {
        const rawType = str(d.day_type)
        return {
          dayNumber: num(d.day_number) ?? 0,
          date: str(d.date),
          title: str(d.title),
          description: str(d.description),
          city: str(d.city),
          overnightCity: str(d.overnight_city),
          attractions: Array.isArray(d.attractions)
            ? d.attractions.filter((a): a is string => typeof a === 'string')
            : [],
          dayType: rawType && DAY_TYPES.includes(rawType) ? (rawType as ShareDayType) : null,
          lunchIncluded: d.lunch_included === true,
          dinnerIncluded: d.dinner_included === true,
          hotelIncluded: d.hotel_included === true,
          hasSightseeing: d.has_sightseeing === true,
          flightFrom: str(d.flight_from),
          airportArrival: str(d.airport_arrival),
          airportDeparture: str(d.airport_departure),
        }
      }),
  }
}
