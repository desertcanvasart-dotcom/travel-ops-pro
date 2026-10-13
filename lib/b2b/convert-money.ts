// ============================================
// A B2B quote's prices on the trip it was built from
// ============================================
// quote-from-itinerary prices in the org's rate currency; the trip keeps its
// own display currency, and its service lines are stored in it. Converting
// the quote onto that trip copied the amounts across unchanged, so a
// EUR 1,317 sale was written as ¥1,317 and the invoice, contract and WhatsApp
// quote said so. The amounts go across at the trip's rate instead: its
// frozen rate when it has one (lib/itinerary-fx), else today's.

import { getExchangeRate, type ExchangeRates } from '@/lib/currency-service'
import { roundToCurrency } from '@/lib/currency-totals'

export interface QuoteAmounts {
  selling_price: number | null
  total_cost: number | null
  margin_amount: number | null
}

/**
 * The quote's amounts in the trip's currency, or null when no rate between
 * the two is known (never the raw amount under the wrong sign).
 */
export function quoteAmountsInTripCurrency(
  quote: QuoteAmounts & { currency: string | null },
  tripCurrency: string | null,
  rates: ExchangeRates | null
): (QuoteAmounts & { currency: string }) | null {
  const from = quote.currency || tripCurrency || 'EUR'
  const to = tripCurrency || from
  const rate = from === to ? 1 : rates ? getExchangeRate(from, to, rates) : null
  if (!rate || !(rate > 0)) return null
  const at = (v: number | null) => (v == null ? null : roundToCurrency(Number(v) * rate, to))
  return {
    selling_price: at(quote.selling_price),
    total_cost: at(quote.total_cost),
    margin_amount: at(quote.margin_amount),
    currency: to,
  }
}

/**
 * What the client pays for each line of a converted template quote, so that
 * the lines add up to exactly the quote's selling price.
 *
 * Each line's client price was its cost × (1 + margin), with
 * `margin_percent || 25` — a 0% quote's lines came out 25% dearer — and no
 * season premium, tour leader or chosen-option pricing at all. The itinerary
 * header carried the quote's selling price, and the edit page recomputes the
 * total from the lines on first save, so the trip silently re-priced. Now the
 * selling price is shared out across the lines in proportion to their cost
 * (margin, premium and the rest ride along on the same share), in whole
 * minor units of the currency; the rounding remainder goes to the dearest
 * line. Lines that cost nothing (no rate) get nothing. If every line costs
 * nothing there is nothing to share by, and the lines stay at 0.
 */
export function allocateClientPrices(lineCosts: number[], sellingPrice: number, currency: string): number[] {
  const costs = lineCosts.map((c) => Math.max(0, Number(c) || 0))
  const sum = costs.reduce((a, b) => a + b, 0)
  if (!(sum > 0) || !(Number(sellingPrice) > 0)) return costs.map(() => 0)
  const minor = roundToCurrency(1.23, currency) === 1 ? 1 : 100
  const target = Math.round(Number(sellingPrice) * minor)
  const shares = costs.map((c) => Math.floor((c / sum) * target))
  let rest = target - shares.reduce((a, b) => a + b, 0)
  // Remainder to the dearest lines first, one minor unit each.
  const order = costs.map((c, i) => [c, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i)
  for (let k = 0; rest > 0 && k < order.length * 2; k++) {
    const i = order[k % order.length]
    if (costs[i] > 0) { shares[i] += 1; rest -= 1 }
  }
  return shares.map((s) => s / minor)
}
