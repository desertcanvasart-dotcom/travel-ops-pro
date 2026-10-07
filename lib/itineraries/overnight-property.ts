// ============================================
// The hotel or ship a day's night is spent at, read off its services
// ============================================
// An itinerary day stores only its overnight CITY; the property is on the
// day's accommodation (or cruise) service line — and the itinerary page, the
// quote PDF and the client share page all said "Overnight: Cairo" with no
// hotel (operator, 2026-09-17: clients may see hotel and ship names).
//
// Every path that creates those lines names the property, in its own shape:
//   calculator quote → "Hotel - Steigenberger Nile Palace (Cairo)",
//                      "Nile Cruise - Al Farida Nile Cruise (night 1 of 4)",
//                      and (from 2026-09-17) supplier_name = the property
//   AI generator     → supplier_name = the property,
//                      "<hotel> (2 persons)", "<ship> - Full Board (…)"
// An unpriced placeholder ("Hotel (Cairo)", "Nile Cruise (night 1 of 4)")
// names none, and then nothing is claimed. Supplement and guide-bed lines
// share the service type but are not the night itself.

export interface OvernightProperty {
  name: string
  kind: 'hotel' | 'cruise'
}

type ServiceLike = {
  service_type?: string | null
  service_code?: string | null
  service_name?: string | null
  supplier_name?: string | null
  /** Resolved by the days API from the untranslated line, so a Japanese view
   *  (translated service_name) still names the property. Wins when present. */
  property_name?: string | null
}

const NOT_THE_NIGHT = /^(hotel supplement|cruise supplement|throughout guide|single supplement|triple reduction)\b/i

/** The property named by one service line, or null. */
export function propertyFromService(s: ServiceLike): OvernightProperty | null {
  const type = String(s.service_type ?? '').toLowerCase()
  const kind = type === 'accommodation' || type === 'hotel' ? 'hotel' : type === 'cruise' ? 'cruise' : null
  if (!kind) return null
  const name = String(s.service_name ?? '').trim()
  const code = String(s.service_code ?? '')
  if (NOT_THE_NIGHT.test(name)) return null
  // Engine line ids: the night itself is day<N>-hotel / day<N>-cruise.
  if (code && /^day\d+-/.test(code) && !/^day\d+-(hotel|cruise)$/.test(code)) return null

  const resolved = String(s.property_name ?? '').trim()
  if (resolved) return { name: resolved, kind }
  const supplier = String(s.supplier_name ?? '').trim()
  if (supplier) return { name: supplier, kind }

  const engine = name.match(/^(?:Hotel|Nile Cruise)\s+-\s+(.+?)\s*\((?:night \d+ of \d+|[^()]*)\)\s*$/i)
  if (engine) return { name: engine[1].trim(), kind }
  const fullBoard = name.match(/^(.+?)\s+-\s+Full Board\b/i)
  if (fullBoard) return { name: fullBoard[1].trim(), kind }
  const persons = name.match(/^(.+?)\s*\(\d+\s+persons?\)\s*$/i)
  if (persons) return { name: persons[1].trim(), kind }
  return null
}

/** The property a day's night is spent at, or null when its lines name none. */
export function overnightProperty(services: readonly ServiceLike[] | null | undefined): OvernightProperty | null {
  for (const s of services ?? []) {
    const found = propertyFromService(s)
    if (found) return found
  }
  return null
}

/** "Steigenberger Nile Palace, Cairo" — or just the one that is known. */
export function overnightLabel(property: OvernightProperty | null, city: string | null | undefined): string {
  const c = String(city ?? '').trim()
  if (!property) return c
  return c && !property.name.toLowerCase().includes(c.toLowerCase()) && property.kind === 'hotel'
    ? `${property.name}, ${c}`
    : property.name
}

// ── Is the named property still in the rates? ───────────────────────────
// An itinerary keeps the lines it was sold with, so a hotel deleted from
// Rates later still names the night — ITN-26-010 says "Kempinski Nile Hotel",
// removed from Rates 34 minutes after its quote was priced (operator,
// 2026-09-17). Staff see a warning; the client never does.

export type PropertyRateStatus = 'on_file' | 'switched_off' | 'not_on_file'

/** Names compare case-, spacing- and edge-insensitively: the Kempinski row
 *  was stored as "Kempinski Nile Hotel " with a trailing space. */
export const propertyKey = (name: string | null | undefined): string =>
  String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

export interface RatesCatalogRow { id?: unknown; name: unknown; city?: unknown; active: unknown }
export interface RatesCatalog {
  hotels: ReadonlyArray<RatesCatalogRow>
  ships: ReadonlyArray<RatesCatalogRow>
}

/** The rate row a line was priced from. This app's Pricing Grid writes it into
 *  the line's notes: "__grid:slot:accommodation|rate_id:<id>". */
export interface RatePin {
  rate_table: 'accommodation_rates' | 'nile_cruises'
  rate_id: string
}

const PIN_TABLE: Record<string, RatePin['rate_table']> = { accommodation: 'accommodation_rates', cruise: 'nile_cruises' }

/** The pin a grid line carries in its notes, or null. A supplement under the
 *  room (`<id>_supp`, `<id>#supp:…`) is not the room's row. */
export function gridRatePin(notes: string | null | undefined): RatePin | null {
  const m = String(notes ?? '').match(/slot:(accommodation|cruise)\|rate_id:([^|\s]+)/)
  if (!m || /_supp$|#supp:/.test(m[2])) return null
  return { rate_table: PIN_TABLE[m[1]], rate_id: m[2] }
}

/** Separators aside too: "Marriott Mena House | Cairo" reads "marriott mena house cairo". */
const looseKey = (name: string | null | undefined): string =>
  propertyKey(String(name ?? '').replace(/[|,;/()\[\]–—-]+/g, ' '))

/**
 * Is the night's hotel or ship still in the rates?
 *
 *   1. A line pinned to its rate row is judged by THAT row: there and on,
 *      switched off, or gone. Its name is never re-read.
 *   2. Otherwise by name, loosely: case, spacing and separators aside, and
 *      "<hotel> <city>" counts as <hotel> in that city.
 *
 * It compared names exactly, so a name that had drifted from the rate's (a
 * supplier name, a city added on the end) read as "no longer in your rates"
 * for a hotel that is. Ported from autoura-saas (#610), where it was found on
 * "Marriott Mena House | Cairo".
 */
export function propertyRateStatus(property: OvernightProperty, catalog: RatesCatalog, pin?: RatePin | null): PropertyRateStatus {
  const rows = property.kind === 'cruise' ? catalog.ships : catalog.hotels
  const table = property.kind === 'cruise' ? 'nile_cruises' : 'accommodation_rates'
  if (pin?.rate_id && pin.rate_table === table && rows.some(r => r.id !== undefined)) {
    const row = rows.find(r => String(r.id) === pin.rate_id)
    if (!row) return 'not_on_file'
    return row.active !== false ? 'on_file' : 'switched_off'
  }
  const key = looseKey(property.name)
  const matches = rows.filter(r => {
    const name = looseKey(String(r.name ?? ''))
    if (!name) return false
    if (name === key) return true
    const city = looseKey(String(r.city ?? ''))
    return !!city && (key === `${name} ${city}` || key === `${city} ${name}`)
  })
  if (matches.length === 0) return 'not_on_file'
  return matches.some(r => r.active !== false) ? 'on_file' : 'switched_off'
}
