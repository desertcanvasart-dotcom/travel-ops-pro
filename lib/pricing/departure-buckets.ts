// ============================================
// Departures grid — AIR / 燃油 / LND / 合計 per flight class
// ============================================
// The office prices a departure sheet by hand: for each departure date it
// records AIR (the international fare from Japan, per person), 燃油 (a fuel
// surcharge computed outside the system, one number), and LND (everything on
// the ground), and adds them to a 合計 gross. See handover/feature-specs/6.
//
// The split (operator, 2026-10-01):
//   LND  = the engine's whole per-person gross for the date — every line it
//          prices, DOMESTIC FLIGHTS INCLUDED. They used to be carved out into
//          AIR; the office keeps them in land.
//   AIR  = the international fare, typed per date and per class. The engine
//          does not price it, so there is no estimate: no fare, no total.
//   燃油  = one manual number per date, the same whatever the class.
//
// Three classes are sold side by side (economy, business, and business one
// way), each with its own total and the website rate published for it: the
// total rounded UP to end in 999 (¥417,651 → ¥417,999), unless the operator
// typed their own. Pure, so the grid and the CSV cannot drift apart.
//
// The 999 rule is the office's rule for YEN prices. The grid shows the
// company's own currency (lib/departures/grid-fx.ts), and the rule used to
// apply whatever that was: a €1,234.56 total was published as €1,999. In any
// other currency the website rate is the total rounded to the currency's own
// unit (lib/currency-totals roundToCurrency): €1,234.56, $980.10.

import { roundToCurrency } from '@/lib/currency-totals'

export const FLIGHT_CLASSES = ['economy', 'business', 'oneway_business'] as const
export type FlightClass = (typeof FLIGHT_CLASSES)[number]

export const FLIGHT_CLASS_LABELS: Record<FlightClass, string> = {
  economy: 'Economy',
  business: 'Business',
  oneway_business: 'One-way business',
}

/** The tour_departures column holding each class's AIR fare. air_pp predates
 *  the classes and is the economy fare. */
export const AIR_COLUMN: Record<FlightClass, 'air_pp' | 'air_business_pp' | 'air_oneway_business_pp'> = {
  economy: 'air_pp',
  business: 'air_business_pp',
  oneway_business: 'air_oneway_business_pp',
}

/** The tour_departures column holding each class's typed website rate. */
export const WEB_COLUMN: Record<FlightClass, 'web_price_economy' | 'web_price_business' | 'web_price_oneway_business'> = {
  economy: 'web_price_economy',
  business: 'web_price_business',
  oneway_business: 'web_price_oneway_business',
}

/** In yen, round UP to the next amount ending in 999: 417,651 → 417,999;
 *  417,999 stays; 418,000 → 418,999 — the office's rule for published yen
 *  prices. Any other currency: the total rounded to that currency's unit. */
export function websiteRate(total: number, currency: string = 'JPY'): number {
  if (String(currency || '').trim().toUpperCase() !== 'JPY') {
    const r = roundToCurrency(total, currency)
    return r > 0 ? r : 0
  }
  const n = Math.ceil(Number(total) || 0)
  if (n <= 0) return 0
  return Math.ceil((n + 1) / 1000) * 1000 - 1
}

export interface ClassColumn {
  /** AIR fare typed for this class; null = not sold / not entered yet. */
  airPp: number | null
  /** AIR + 燃油 + LND; null while there is no AIR fare. */
  totalPp: number | null
  /** The rounded website rate the total suggests; null with no total. */
  websiteSuggested: number | null
  /** What is published: the typed rate, else the suggestion. */
  websitePp: number | null
  /** True when the operator typed the website rate. */
  websiteTyped: boolean
}

/** One class's columns for a date, all per person in the target currency. */
export function classColumn(parts: {
  landPp: number
  fuelPp: number | null
  airPp: number | null
  websiteTyped: number | null
  /** The grid's currency: the 999 rule is for yen only (websiteRate). */
  currency?: string
}): ClassColumn {
  const airPp = parts.airPp == null ? null : Number(parts.airPp)
  const totalPp = airPp == null ? null : airPp + (Number(parts.fuelPp) || 0) + (Number(parts.landPp) || 0)
  const websiteSuggested = totalPp == null ? null : websiteRate(totalPp, parts.currency ?? 'JPY')
  const typed = parts.websiteTyped == null ? null : Number(parts.websiteTyped)
  return {
    airPp,
    totalPp,
    websiteSuggested,
    websitePp: typed ?? websiteSuggested,
    websiteTyped: typed != null,
  }
}

/** Convert an amount at a fixed FX rate expressed as target units per source
 *  unit (e.g. 160 JPY per 1 USD), rounding to whole target units — the office
 *  quotes whole yen. FX is a parameter, never hard-coded here. */
export function convertAtRate(amount: number, targetPerSource: number): number {
  return Math.round((Number(amount) || 0) * (Number(targetPerSource) || 0))
}
