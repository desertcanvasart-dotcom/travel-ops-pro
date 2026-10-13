// ============================================
// A rate picked onto a voucher, in the voucher's currency
// ============================================
// The voucher editor's pickers (transport routes, restaurant meals, guides,
// entrance fees) copied a rate straight onto the voucher. Rates are in the
// company's RATE currency (organizations.rate_currency); the voucher states
// its own currency — the trip's, or the supplier's own when Generate
// Documents could use it (lib/documents/plan-documents.ts voucherMoney). So a
// yen voucher took "50" from a euro meal rate and asked the restaurant to
// confirm ¥50. A picked rate is now converted the way the itinerary editor
// converts one (lib/itineraries/editor-pricing.ts): the trip's frozen rate
// when it has one, else today's; and when no rate is known the pick is
// refused rather than a rate-currency number written as a voucher one.

import { editorFxRate } from '@/lib/itineraries/editor-pricing'
import { frozenToExchangeRates, parseFrozenFx } from '@/lib/itinerary-fx'
import type { ExchangeRates } from '@/lib/currency-service'

/** 1 unit of the rate currency in the voucher's currency, or null when unknown. */
export function voucherPickFx(
  rateCurrency: string,
  voucherCurrency: string,
  tripFxFrozen: unknown,
  live: { base: string; rates: Record<string, number> } | null
): number | null {
  const frozen = parseFrozenFx(tripFxFrozen)
  return editorFxRate(rateCurrency, voucherCurrency, {
    frozen: frozen ? frozenToExchangeRates(frozen) : null,
    live: live as ExchangeRates | null,
  })
}

/** A rate-currency amount in the voucher's currency, to the cent. */
export function toVoucherAmount(rateAmount: number, fx: number): number {
  return Math.round((Number(rateAmount) || 0) * fx * 100) / 100
}
