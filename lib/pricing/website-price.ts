// ============================================
// Website orders: the price is the website's
// ============================================
// An order from the website form (T-UP) names a fare the customer has already
// agreed to, in yen. The office does not quote it: that fare is final, and it
// is what the itinerary, booking and invoice carry (operator, 2026-10-23).
//
// The engine's run over the programme is still worth keeping — it is the
// office's estimate of what the trip will cost — but only as a cost estimate,
// seen by admins and managers. A service with no rate is a hole in that
// estimate, not in the customer's price, so it never blocks or alarms the
// way an unpriced line on a quoted trip does.
//
// A quote (or the trip converted from it) is website-priced when it came from
// the website form AND is held in yen. A web-form quote held in the rate
// currency was priced the old way — no website fare could be read — and
// keeps the old behaviour. Pure: no database, no framework.

import { roundToCurrency } from '@/lib/currency-totals'

export const WEBSITE_ORDER_SOURCE = 'web_form'
export const WEBSITE_PRICE_CURRENCY = 'JPY'

export function isWebsitePriced(record: { source?: string | null; currency?: string | null } | null | undefined): boolean {
  return record?.source === WEBSITE_ORDER_SOURCE && (record.currency ?? '').toUpperCase() === WEBSITE_PRICE_CURRENCY
}

/** The fields of a parsed T-UP order that carry the website's price. */
export interface WebsiteFareOrder {
  adults: number
  children: number
  websiteSubtotalJpy?: number
  websiteBaseFare1?: { adultJpy?: number; childJpy?: number }
}

/**
 * What the customer agreed to pay, in yen: the 小計 the website showed, else
 * the 1st-date base fare × the party. Null when it cannot be read whole — a
 * child in the party with no child fare is not priced at the adult one.
 */
export function websiteOrderPriceJpy(order: WebsiteFareOrder): number | null {
  if (order.websiteSubtotalJpy && order.websiteSubtotalJpy > 0) return order.websiteSubtotalJpy
  const fare = order.websiteBaseFare1
  if (!fare) return null
  const adults = Math.max(0, order.adults || 0)
  const children = Math.max(0, order.children || 0)
  if (adults > 0 && !(fare.adultJpy && fare.adultJpy > 0)) return null
  if (children > 0 && !(fare.childJpy && fare.childJpy > 0)) return null
  const total = adults * (fare.adultJpy ?? 0) + children * (fare.childJpy ?? 0)
  return total > 0 ? total : null
}

/** A saved quote line, as far as its money goes. */
export interface CostLine {
  unit_cost: number
  line_total: number
  [key: string]: unknown
}

/**
 * The engine's lines in yen, each keeping what it cost in the rate currency
 * (`cost_currency`, `cost_unit_original`, `cost_total_original`,
 * `cost_exchange_rate`) — the itinerary's supplier lines are recorded in the
 * currency the supplier is paid in, not the one the trip is sold in.
 */
export function linesInWebsiteCurrency<T extends CostLine>(lines: T[], rateCurrency: string, rate: number): T[] {
  return lines.map(line => ({
    ...line,
    unit_cost: roundToCurrency(Number(line.unit_cost) * rate, WEBSITE_PRICE_CURRENCY),
    line_total: roundToCurrency(Number(line.line_total) * rate, WEBSITE_PRICE_CURRENCY),
    cost_currency: rateCurrency,
    cost_unit_original: Number(line.unit_cost) || 0,
    cost_total_original: Number(line.line_total) || 0,
    cost_exchange_rate: rate,
  }))
}

/**
 * The quote's money for a website-priced order: the website fare is the
 * selling price, the engine's cost (converted) is the cost estimate, and the
 * margin is whatever is left between them.
 */
export function websitePricedTotals(input: { priceJpy: number; costInRateCurrency: number; singleSupplementInRateCurrency: number; rate: number; pax: number }) {
  const cost = roundToCurrency(input.costInRateCurrency * input.rate, WEBSITE_PRICE_CURRENCY)
  const selling = roundToCurrency(input.priceJpy, WEBSITE_PRICE_CURRENCY)
  const margin = selling - cost
  // margin_percent is numeric(5,2), on cost (client = cost × (1 + m/100)).
  const percent = cost > 0 ? Math.max(-999.99, Math.min(999.99, Math.round((margin / cost) * 10000) / 100)) : 0
  return {
    selling_price: selling,
    total_cost: cost,
    margin_amount: margin,
    margin_percent: percent,
    price_per_person: roundToCurrency(selling / Math.max(1, input.pax), WEBSITE_PRICE_CURRENCY),
    single_supplement: roundToCurrency(input.singleSupplementInRateCurrency * input.rate, WEBSITE_PRICE_CURRENCY),
    currency: WEBSITE_PRICE_CURRENCY,
  }
}

/** A website-priced record's lines with the cost holes left out: they are the
 *  office's to fill, and never hold up what goes to the customer. */
export function withoutCostGaps<T extends { unpriced?: unknown }>(record: { source?: string | null; currency?: string | null } | null | undefined, lines: T[]): T[] {
  return isWebsitePriced(record) ? lines.filter(l => l.unpriced !== true) : lines
}
