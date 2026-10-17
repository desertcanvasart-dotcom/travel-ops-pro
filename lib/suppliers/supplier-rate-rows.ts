// ============================================
// A supplier's rates, as rows for the supplier view's Rates tab
// ============================================
// The tab used to ask /api/resources/transportation, read `result.data` off
// the bare array that route returns (so it always saw []), appear only when
// the PRIMARY role was transport-ish, and print each amount with the
// company's currency symbol whatever the rate was entered in. It now reads
// /api/supplier-rates — every rate table that carries supplier_id, for every
// role the supplier fills — and each row keeps its own rate_currency.
//
// Pure: the page formats, this decides what a row says.

import { vehicleBands } from '@/lib/rates/vehicle-bands'

export interface SupplierRateRow {
  key: string
  /** The rate table the row came from (`_rate_type` on /api/supplier-rates). */
  table: string
  code: string
  /** What the rate prices: the property, ship, route, vehicle… */
  label: string
  /** EU-passport amount, or null when the row has none to show. */
  eu: number | null
  /** Non-EU amount; null = same as EU (or none). */
  nonEu: number | null
  /** The row's own entry currency; null = the company's rate currency. */
  currency: string | null
  active: boolean
}

/** The list out of whatever shape the endpoint answered: `{ data: [...] }`,
 *  or a bare array (what /api/resources/* return). */
export function rateListFrom(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[]
  const data = (body as { data?: unknown } | null)?.data
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : []
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

// The headline amount of each table, EU then non-EU column — the same figure
// the table's own rates page shows in its list.
const AMOUNT_PAIRS: ReadonlyArray<[string, string | null]> = [
  ['pp_double_eur', 'pp_double_non_eur'],   // hotels: per person sharing a double
  ['rate_double_eur', 'rate_double_non_eur'], // Nile cruises: per person double cabin
  ['base_rate_eur', 'base_rate_non_eur'],   // guides, meals, activities, flights
  ['rate_eur', 'rate_non_eur'],             // trains, airport / hotel services
  ['eur_rate', 'non_eur_rate'],             // entrance fees
  ['rate_oneway_eur', null],                // sleeping trains
]

function labelOf(rate: Record<string, unknown>): string {
  const route = [text(rate.origin_city) || text(rate.city) || text(rate.embark_city), text(rate.destination_city) || text(rate.disembark_city)]
    .filter(Boolean).join(' → ')
  const what = text(rate.property_name) || text(rate.ship_name) || text(rate.activity_name) || text(rate.restaurant_name) ||
    text(rate.attraction_name) || text(rate.route_name) || text(rate.airport_name) ||
    [text(rate.service_type), text(rate.guide_language), text(rate.meal_type), text(rate.cabin_type), text(rate.class_type)].filter(Boolean).join(' · ')
  return [what, route].filter(Boolean).join(' — ')
}

/** One display row per rate — per VEHICLE for a transport rate, which prices
 *  each vehicle separately. */
export function supplierRateRows(rates: Record<string, unknown>[]): SupplierRateRow[] {
  const out: SupplierRateRow[] = []
  for (const rate of rates) {
    const table = text(rate._rate_type)
    const id = String(rate.id ?? '')
    const base = {
      table,
      code: text(rate.service_code) || text(rate.cruise_code),
      currency: text(rate.rate_currency) || null,
      active: rate.is_active !== false,
    }
    const label = labelOf(rate)
    if (table === 'transportation_rates' || Array.isArray(rate.vehicles)) {
      const bands = vehicleBands(rate)
      if (bands.length > 0) {
        for (const v of bands) {
          out.push({ ...base, key: `${table}:${id}:${v.key}`, label: [label, v.key].filter(Boolean).join(' · '), eu: v.rate_eur, nonEu: v.rate_non_eur })
        }
        continue
      }
    }
    let eu: number | null = null
    let nonEu: number | null = null
    for (const [euCol, nonEuCol] of AMOUNT_PAIRS) {
      const e = num(rate[euCol])
      if (e === null) continue
      eu = e
      nonEu = nonEuCol ? num(rate[nonEuCol]) : null
      break
    }
    out.push({ ...base, key: `${table}:${id}`, label, eu, nonEu })
  }
  return out
}
