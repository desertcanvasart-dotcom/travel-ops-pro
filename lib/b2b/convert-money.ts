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
