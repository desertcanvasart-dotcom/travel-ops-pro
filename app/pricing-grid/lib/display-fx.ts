// ============================================
// The currency the grid SHOWS, from the currency its rates are IN
// ============================================
// Every amount the grid computes is in the org's rate currency (the rates
// route normalises every row to it). The grid used to multiply them by an
// EUR→X factor, whatever the rate currency was, and a currency the factor
// cache lacked kept the previous one's factor under the new label. One rule
// now: rate currency → shown currency, or — with no rate for that pair —
// the figures stay in the rate currency, labelled as such, and the screen says
// the conversion is missing. Never a stale or wrong factor under a new label.
//
// Pure: the page and the tests share it.

import { getExchangeRate, type ExchangeRates } from '@/lib/currency-service'
import { currencyDecimals, currencySymbol } from '@/lib/currency-totals'

type Shown = { currency: string; shownCurrency?: string | null }

/** The sign for the figures as shown: the shown currency's; '' when it is
 *  not known (never the chosen currency's over unconverted figures). A config
 *  that never had one derived (a test, an old caller) shows its own. */
export const shownSymbol = (config: Shown): string =>
  config.shownCurrency === undefined ? currencySymbol(config.currency)
    : config.shownCurrency === null ? '' : currencySymbol(config.shownCurrency)

/** Decimal places for the shown currency (a yen has none). */
export const shownDecimals = (config: Shown): number =>
  currencyDecimals(config.shownCurrency || config.currency)

export interface DisplayFx {
  /** Multiply a rate-currency amount by this to show it; null = shown as is. */
  factor: number | null
  /** The currency the shown figures are in; null = not known yet. */
  shown: string | null
  /** The chosen currency could not be shown (no rate, or no rate currency). */
  missing: boolean
}

export function displayFx(
  rateCurrency: string | null | undefined,
  chosen: string,
  rates: ExchangeRates | null | undefined,
): DisplayFx {
  if (!rateCurrency) return { factor: null, shown: null, missing: true }
  if (chosen === rateCurrency) return { factor: null, shown: rateCurrency, missing: false }
  const factor = rates ? getExchangeRate(rateCurrency, chosen, rates) : null
  if (factor && factor > 0) return { factor, shown: chosen, missing: false }
  return { factor: null, shown: rateCurrency, missing: true }
}
