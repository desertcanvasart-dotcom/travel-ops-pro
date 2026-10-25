// ============================================
// A variation's own service lines, priced from the rate tables
// ============================================
// /api/b2b/calculate-price prices a variation that carries its own service
// list (tour_variation_services) line by line. It read the Guides & Services
// tables wrongly (Rates audit, Guides & Services #2):
//
//   meals     read lunch_rate_eur / dinner_rate_eur — columns meal_rates does
//             not have — so every meal line priced 0 AND was marked as found,
//             which skipped the stored-cost fallback;
//   entrance  read eur_rate as it was stored: a fee entered as 600 EGP was
//             600 in a USD quote, ~50× too much.
//
// The rows reaching these functions are already in the run currency (the
// route converts them with the run's normaliser), and the meal is picked the
// way the day-by-day engine picks one (lib/pricing/service-rates). Pure, so
// the arithmetic is tested without a database.

import { mealCostForGroup, pickMealRate, rateValidOn } from '@/lib/pricing/service-rates'
import { rateFor } from '@/lib/pricing/attractions'

export interface LinePrice {
  unitCost: number
  lineTotal: number
  quantityMode: 'per_pax' | 'fixed'
  pricingNote: string
  rateSource: string
  /** The currency the rate was entered in (null = the rate currency) — lib/paid-currency. */
  enteredCurrency?: string | null
}

/** Which meal a line is: the words say dinner, else lunch. */
export const mealTypeOfLine = (serviceName: string | null | undefined): 'lunch' | 'dinner' =>
  /dinner/i.test(serviceName ?? '') ? 'dinner' : 'lunch'

/**
 * A meal line: the picked restaurant rate (rate_id) when the line names one,
 * else the tier's rate for that meal on the travel date. Per group = one
 * price; per person = × the group, never fewer than the restaurant's minimum.
 * null = no rate, and the caller falls back to the line's stored cost.
 */
export function priceMealLine(
  rows: Record<string, any>[],
  line: { serviceName?: string | null; rateId?: string | null; tier: string; date?: string | null; numPax: number; rateSym: string },
): LinePrice | null {
  const mealType = mealTypeOfLine(line.serviceName)
  const chosen = line.rateId ? rows.find(r => r.id === line.rateId) : undefined
  const picked = chosen
    ? pickMealRate([chosen], { mealType, rateId: chosen.id })
    : pickMealRate(rows.filter(r => r.tier === line.tier), { mealType, date: line.date })
  if (!picked) return null
  const total = Math.round(mealCostForGroup(picked, line.numPax) * 100) / 100
  const where = picked.row.restaurant_name ? `${picked.row.restaurant_name}: ` : ''
  if (!picked.perPerson) {
    return { unitCost: picked.rate, lineTotal: total, quantityMode: 'fixed', pricingNote: `${where}${line.rateSym}${picked.rate} per group`, rateSource: 'meal_rates', enteredCurrency: picked.row.rate_currency ?? null }
  }
  return { unitCost: picked.rate, lineTotal: total, quantityMode: 'per_pax', pricingNote: `${where}${line.rateSym}${picked.rate}/pax`, rateSource: 'meal_rates', enteredCurrency: picked.row.rate_currency ?? null }
}

/**
 * An entrance (or untiered activity) line from the entrance fees: the picked
 * fee (rate_id) when the line names one, else the fee whose name contains the
 * line's — only fees valid on the travel date. A line names its ticket
 * outright, so an add-on fee prices here when it is the one named.
 */
export function priceEntranceLine(
  fees: Record<string, any>[],
  line: { serviceName?: string | null; rateId?: string | null; date?: string | null; numPax: number; isEurPassport: boolean; rateSym: string },
): LinePrice | null {
  const valid = fees.filter(f => f.is_active !== false && rateValidOn(f, line.date))
  const name = String(line.serviceName ?? '').trim().toLowerCase()
  const fee = (line.rateId ? valid.find(f => f.id === line.rateId) : undefined)
    ?? (name ? valid.find(f => String(f.attraction_name ?? '').toLowerCase().includes(name)) : undefined)
  if (!fee) return null
  const rate = rateFor(fee as any, line.isEurPassport)
  return {
    unitCost: rate,
    lineTotal: Math.round(rate * line.numPax * 100) / 100,
    quantityMode: 'per_pax',
    pricingNote: `${fee.attraction_name}: ${line.rateSym}${rate}/pax (${line.isEurPassport ? 'EUR' : 'non-EUR'})`,
    rateSource: 'entrance_fees',
    enteredCurrency: fee.rate_currency ?? null,
  }
}
