// ============================================
// The departures grid's currency and FX
// ============================================
// The grid always priced in JPY, converting the engine's land price at a
// constant 160 — "JPY per USD" — whatever the company's rates were in. A
// company with EUR or EGP rates saw its land price × 160 labelled yen.
//
// Now: the grid shows the company's own currency (organizations
// .default_currency, lib/org-default-currency) unless the page asks for
// another. When that is the rate currency, nothing is converted. Otherwise
// the rate is the one the user typed, else the app's own exchange rates (the
// same merged source the pricing grid uses: lib/rates/fx-source, EUR-based,
// X per 1 EUR). No rate for the pair → an error asking for one, never a
// guessed constant.

export type GridFx =
  | { fx: number; source: 'same' | 'typed' | 'rates' }
  | { error: string }

/**
 * Target units per one rate-currency unit. `rates` is EUR-based (rates[X] =
 * X per 1 EUR), so target per source = rates[target] / rates[source]: USD
 * 1.08 and JPY 162 per EUR give 150 JPY per USD.
 */
export function resolveGridFx(
  rateCurrency: string,
  targetCurrency: string,
  typed: string | null,
  rates: Record<string, number> | null | undefined,
): GridFx {
  if (rateCurrency === targetCurrency) return { fx: 1, source: 'same' }
  const n = typed != null && typed.trim() !== '' ? Number(typed) : NaN
  if (Number.isFinite(n) && n > 0) return { fx: n, source: 'typed' }
  const perEurTarget = Number(rates?.[targetCurrency])
  const perEurSource = Number(rates?.[rateCurrency])
  if (perEurTarget > 0 && perEurSource > 0) {
    return { fx: Math.round((perEurTarget / perEurSource) * 1e6) / 1e6, source: 'rates' }
  }
  return { error: `No exchange rate from ${rateCurrency} to ${targetCurrency} — type one in the FX box` }
}
