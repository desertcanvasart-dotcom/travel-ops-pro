// ============================================
// EXCHANGE RATE API — upstream rate fetching
// ============================================
// Fetches current market rates for the currencies this operation actually
// trades in. Uses ExchangeRate-API; falls back to its keyless endpoint when no
// API key is configured (free tier: 1,500 requests/month, and the daily cron
// needs ~30/month).
//
// THIS FILE IS THE LIST. Supported currencies live here, not in a database
// CHECK constraint, so adding one is a code deploy: add the code below and the
// refresh job, the resolver and every report pick it up. lib/fx-conversion.ts
// is currency-agnostic by design.

const API_BASE_URL = 'https://v6.exchangerate-api.com/v6'
const BASE_CURRENCY = 'EUR' // Our rates are stored EUR-based

export interface ExchangeRateAPIResponse {
  result: 'success' | 'error'
  time_last_update_unix?: number
  time_last_update_utc?: string
  base_code?: string
  conversion_rates?: Record<string, number>
  /** The keyless open.er-api.com endpoint keys its table `rates`. */
  rates?: Record<string, number>
  'error-type'?: string
}

export interface FetchedRate {
  base_currency: string
  target_currency: string
  rate: number
  fetched_at: Date
}

/** EUR is the base; JPY added 2026-08-11 for Japanese-market costs. */
export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'EGP', 'JPY'] as const
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]

/**
 * Fetch rates for one base currency.
 *
 * Throws on an upstream failure — the caller (refreshExchangeRates) turns that
 * into a reported result rather than a thrown cron.
 */
export async function fetchExchangeRates(
  apiKey?: string,
  baseCurrency: string = BASE_CURRENCY
): Promise<FetchedRate[]> {
  const url = apiKey
    ? `${API_BASE_URL}/${apiKey}/latest/${baseCurrency}`
    : `https://open.er-api.com/v6/latest/${baseCurrency}`

  const response = await fetch(url, { next: { revalidate: 3600 } })

  if (!response.ok) {
    throw new Error(`Exchange rate API request failed: ${response.status}`)
  }

  const data: ExchangeRateAPIResponse = await response.json()

  if (data.result !== 'success') {
    throw new Error(`Exchange rate API error: ${data['error-type'] || 'unknown error'}`)
  }

  // Keyed endpoint → conversion_rates; keyless endpoint → rates. Same numbers.
  const conversionRates = data.conversion_rates ?? data.rates
  if (!conversionRates) {
    throw new Error('No conversion rates in API response')
  }

  const fetchedAt = new Date()
  const rates: FetchedRate[] = []

  for (const currency of SUPPORTED_CURRENCIES) {
    if (currency === baseCurrency) continue

    const rate = conversionRates[currency]
    // A missing or nonsensical rate is skipped, not stored: a zero or negative
    // rate in the history would poison every future conversion of that pair.
    if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
      rates.push({
        base_currency: baseCurrency,
        target_currency: currency,
        rate,
        fetched_at: fetchedAt,
      })
    }
  }

  return rates
}

/**
 * Every pair the system needs, from one upstream call.
 *
 * Reverse rates are derived (1/rate) rather than fetched: the inverse is exact,
 * and one request covers all of them. Cross rates (e.g. USD→EGP) are NOT stored
 * — lib/fx-conversion.ts derives those from the EUR legs at read time, so the
 * history stays small and every stored number is a real observation.
 */
export async function fetchAllExchangeRates(apiKey?: string): Promise<FetchedRate[]> {
  const eurRates = await fetchExchangeRates(apiKey, 'EUR')
  const allRates: FetchedRate[] = [...eurRates]

  for (const rate of eurRates) {
    allRates.push({
      base_currency: rate.target_currency,
      target_currency: 'EUR',
      rate: 1 / rate.rate,
      fetched_at: rate.fetched_at,
    })
  }

  return allRates
}

/** Format a rate for display — more decimals for small numbers. */
export function formatExchangeRate(rate: number): string {
  if (rate >= 100) return rate.toFixed(2)
  if (rate >= 1) return rate.toFixed(4)
  return rate.toFixed(6)
}

/** "3 hours ago" for the rates admin view. */
export function getLastUpdateDisplay(date: Date): string {
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
}

/** True when the newest rate is older than maxAgeHours. */
export function ratesNeedRefresh(lastUpdate: Date, maxAgeHours: number = 24): boolean {
  return (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60) >= maxAgeHours
}
