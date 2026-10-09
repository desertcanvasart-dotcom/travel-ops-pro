import { currencyDecimals } from '@/lib/currency-totals'

/**
 * The single supplement a partner is quoted. A B2B quote stores it at NET cost
 * (the single rate minus the double, summed over the nights) with the quote's
 * margin beside it, and the partner PDF printed the stored figure: singles
 * quoted at cost. A quote with no margin recorded keeps the figure as entered.
 */
export function partnerSingleSupplement(quote: {
  single_supplement?: unknown
  margin_percent?: unknown
  currency?: unknown
}): number {
  const net = Number(quote.single_supplement)
  if (!Number.isFinite(net) || net <= 0) return 0
  const margin = quote.margin_percent == null ? NaN : Number(quote.margin_percent)
  if (!Number.isFinite(margin)) return net
  const factor = 10 ** currencyDecimals(String(quote.currency ?? 'EUR').toUpperCase())
  return Math.round(net * (1 + margin / 100) * factor) / factor
}
