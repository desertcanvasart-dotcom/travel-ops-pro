// ============================================
// A B2C offer's price, one computation for create and re-price
// ============================================
// Create added the season premium on top of cost + margin; the re-price on
// edit (travellers or margin changed) recomputed cost + margin only, so the
// premium vanished from the price while the page still listed it as a line.
// Both also rounded to the cent: a yen offer of ¥123,456.25 was shown and paid
// as ¥123,456, and the booking made from it stayed 'partial' over 25 sen.
// Every figure is in the offer's currency's own units.

import { roundToCurrency } from '@/lib/currency-totals'

export interface B2cQuotePrice {
  margin_amount: number
  season_uplift_amount: number
  selling_price: number
  price_per_person: number
}

export function priceB2cQuote(input: {
  totalCost: number
  marginPercent: number
  travelers: number
  seasonUpliftPercent: number
  currency: string | null | undefined
}): B2cQuotePrice {
  const currency = input.currency || 'EUR'
  const cost = Math.max(0, Number(input.totalCost) || 0)
  const marginAmount = roundToCurrency(cost * ((Number(input.marginPercent) || 0) / 100), currency)
  const base = cost + marginAmount
  const pct = Number(input.seasonUpliftPercent) || 0
  const uplift = pct > 0 ? roundToCurrency((base * pct) / 100, currency) : 0
  const selling = roundToCurrency(base + uplift, currency)
  const travelers = Math.max(1, Math.floor(Number(input.travelers) || 1))
  return {
    margin_amount: marginAmount,
    season_uplift_amount: uplift,
    selling_price: selling,
    price_per_person: roundToCurrency(selling / travelers, currency),
  }
}
