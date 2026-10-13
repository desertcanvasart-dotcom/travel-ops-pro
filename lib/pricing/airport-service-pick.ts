// ============================================
// Which airport-assistance rate prices a trip's arrival or departure
// ============================================
// Rates → Airport Assistants holds several services per airport: Meet &
// Greet, Customs Assist, Full Service and VIP Service, each for arrivals,
// departures or both. The engine used to take the FIRST row for the airport
// and direction in an unordered fetch — so with a meet & greet row and a VIP
// row on file, a standard trip could be charged the VIP price, the answer
// changed between runs, and an unpriced first row hid a priced one.
//
// The rule now, fixed and the same on every run:
//   1. The service the trip's tier calls for. A luxury-category tier asks for
//      VIP Service first; every other tier asks for Meet & Greet. Each falls
//      back down its own list — never UP to VIP for a non-luxury trip.
//   2. Within a service, a priced row before an unpriced one (an unpriced row
//      is only reported when nothing priced exists).
//   3. Then a row for this exact direction before a 'both' row.
//   4. Then service_code, then id.
// A row with no service type is read as Meet & Greet (the only kind older
// rows were entered as).
//
// Pure. No database.

/** The order each tier category looks for a service in. */
export const AIRPORT_SERVICE_PREFERENCE: Record<'luxury' | 'default', readonly string[]> = {
  luxury: ['vip_service', 'full_service', 'meet_greet', 'customs_assist'],
  default: ['meet_greet', 'full_service', 'customs_assist'],
}

type AirportRow = Record<string, unknown>

const positive = (v: unknown): boolean => {
  const n = typeof v === 'number' ? v : Number(v)
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n > 0
}

/**
 * The airport_staff_rates row that prices one arrival or departure, or null
 * when the airport has no row for it. `tierCategory` is getTierCategory's
 * answer ('budget' | 'standard' | 'luxury').
 */
export function pickAirportServiceRow<T extends AirportRow>(
  rows: readonly T[],
  airportCode: string,
  direction: 'arrival' | 'departure',
  tierCategory: string
): T | null {
  const code = String(airportCode ?? '').trim().toUpperCase()
  if (!code) return null
  const preference = AIRPORT_SERVICE_PREFERENCE[tierCategory === 'luxury' ? 'luxury' : 'default']
  const typeOf = (r: T) => String(r.service_type ?? '').trim() || 'meet_greet'
  const candidates = rows.filter(r =>
    String(r.airport_code ?? '').trim().toUpperCase() === code &&
    (r.direction === direction || r.direction === 'both' || r.direction == null) &&
    preference.includes(typeOf(r)))
  if (candidates.length === 0) return null
  const rank = (r: T): number[] => [
    preference.indexOf(typeOf(r)),
    positive(r.rate_eur) ? 0 : 1,
    r.direction === direction ? 0 : 1,
  ]
  return [...candidates].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i]
    const ac = String(a.service_code ?? '')
    const bc = String(b.service_code ?? '')
    if (ac !== bc) return ac < bc ? -1 : 1
    return String(a.id ?? '') < String(b.id ?? '') ? -1 : String(a.id ?? '') > String(b.id ?? '') ? 1 : 0
  })[0]
}
