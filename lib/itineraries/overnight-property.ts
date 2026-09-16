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
