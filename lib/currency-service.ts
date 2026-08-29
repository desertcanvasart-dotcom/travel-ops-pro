// ============================================
// CURRENCY EXCHANGE SERVICE
// ============================================
// Uses Frankfurter API for real-time exchange rates
// https://www.frankfurter.app/docs/

export interface ExchangeRates {
  base: string
  date: string
  rates: Record<string, number>
}

// Supported currencies (JPY added 2026-08-11 — keep in sync with
// lib/exchange-rate-api.ts, which is the list the refresh job fetches)
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'EGP', 'JPY'] as const
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]

// Currency symbols
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  EGP: 'E£',
  JPY: '¥'
}

/** Currencies with no minor unit — ¥1,200.00 is wrong, not just unusual. */
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY'])

// Cache for exchange rates (in-memory, refreshes on server restart)
let cachedRates: ExchangeRates | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 60 * 60 * 1000 // 1 hour in milliseconds

// Track whether we're using fallback rates
let usingFallback = false
export function isUsingFallbackRates(): boolean { return usingFallback }

/**
 * Fetch latest exchange rates from Frankfurter API
 * Uses EUR as base currency (since all rates are stored in EUR)
 */
export async function fetchExchangeRates(baseCurrency: string = 'USD'): Promise<ExchangeRates> {
  // Check cache first
  const now = Date.now()
  if (cachedRates && cachedRates.base === baseCurrency && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedRates
  }

  try {
    // Frankfurter API - free, no API key required. The .app host now 301s to
    // .dev; call the new home directly before the redirect stops working.
    // NOTE these are ECB reference rates — no EGP. Pricing runs merge the
    // org's own exchange_rates table over this (lib/rates/fx-source.ts).
    const response = await fetch(
      `https://api.frankfurter.dev/v1/latest?from=${baseCurrency}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour in Next.js
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rates: ${response.statusText}`)
    }

    const data = await response.json()

    // Add base currency with rate 1 to the rates object
    const rates: ExchangeRates = {
      base: data.base,
      date: data.date,
      rates: {
        [data.base]: 1,
        ...data.rates
      }
    }

    // Update cache
    cachedRates = rates
    cacheTimestamp = now
    usingFallback = false

    return rates
  } catch (error) {
    console.error('⚠️ Error fetching exchange rates — using fallback:', error)

    // Return fallback rates if API fails
    usingFallback = true
    return getFallbackRates(baseCurrency)
  }
}

/**
 * Fallback rates in case API is unavailable.
 * Based on ECB rates as of February 2026.
 * EUR is the reference base since all our rates are stored in EUR.
 *
 * IMPORTANT: Update these periodically to stay accurate.
 * Last updated: 2026-02-22
 * Source: ECB reference rates via Frankfurter API
 */
export function getFallbackRates(baseCurrency: string): ExchangeRates {
  // EUR-based rates as of Feb 22, 2026 (ECB reference)
  const eurRates: Record<string, number> = {
    EUR: 1,
    USD: 1.1782,
    GBP: 0.8737,
    EGP: 56.00,
    JPY: 178.50
  }

  if (baseCurrency === 'EUR') {
    return {
      base: 'EUR',
      date: new Date().toISOString().split('T')[0],
      rates: eurRates
    }
  }

  // Convert rates to different base
  const baseRateInEur = eurRates[baseCurrency] || 1
  const convertedRates: Record<string, number> = {}

  for (const [currency, eurRate] of Object.entries(eurRates)) {
    convertedRates[currency] = eurRate / baseRateInEur
  }

  return {
    base: baseCurrency,
    date: new Date().toISOString().split('T')[0],
    rates: convertedRates
  }
}

/**
 * Convert amount from one currency to another.
 *
 * Returns null when no rate is available. It must NEVER return the
 * unconverted amount: passing 1,000 EGP through as "1,000 EUR" is a ~56x
 * overstatement that silently inflates margin, and it reads as a real number
 * to every caller. Callers must handle null — either show the amount in its
 * ORIGINAL currency, or exclude it and flag the total as incomplete (which is
 * what lib/fx-conversion.ts does for reports).
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates
): number | null {
  if (fromCurrency === toCurrency) {
    return amount
  }

  // If the rates are based on the source currency
  if (rates.base === fromCurrency) {
    const rate = rates.rates[toCurrency]
    if (rate) {
      return amount * rate
    }
  }

  // If the rates are based on the target currency
  if (rates.base === toCurrency) {
    const rate = rates.rates[fromCurrency]
    if (rate) {
      return amount / rate
    }
  }

  // Cross conversion through base currency
  const fromRate = rates.rates[fromCurrency]
  const toRate = rates.rates[toCurrency]

  if (fromRate && toRate) {
    // Convert: amount in fromCurrency -> base -> toCurrency
    const amountInBase = amount / fromRate
    return amountInBase * toRate
  }

  // No rate anywhere. Do not guess, and do not pass the raw amount through.
  console.warn(`Could not convert ${fromCurrency} to ${toCurrency} — no rate available`)
  return null
}

/**
 * Format currency amount with symbol
 */
export function formatCurrency(
  amount: number,
  currency: string,
  options?: {
    showSymbol?: boolean
    decimals?: number
  }
): string {
  // JPY has no minor unit, so its default precision is 0 — an explicit
  // `decimals` option still wins.
  const defaultDecimals = ZERO_DECIMAL_CURRENCIES.has((currency || '').toUpperCase()) ? 0 : 2
  const { showSymbol = true, decimals = defaultDecimals } = options || {}

  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })

  if (showSymbol) {
    const symbol = CURRENCY_SYMBOLS[currency] || currency
    return `${symbol}${formatted}`
  }

  return formatted
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency
}

// ============================================
// EXCHANGE RATE PERSISTENCE
// ============================================

export interface ExchangeRateSnapshotRow {
  base_currency: string
  target_currency: string
  rate: number
  source: string
  captured_at: string
}

/**
 * Turn fetched rates into snapshot rows for one batch insert.
 *
 * Deduplicates by pair: the insert targets
 * UNIQUE(base_currency, target_currency, captured_at), so two rows for the
 * same pair at the same instant would collide and fail the whole statement.
 * Invalid rates are dropped rather than stored — a zero or negative rate in
 * the history poisons every future conversion of that pair.
 */
export function buildSnapshotRows(
  rates: Array<{ base_currency: string; target_currency: string; rate: number }>,
  capturedAt: string,
  source: string = 'er-api'
): ExchangeRateSnapshotRow[] {
  const seen = new Set<string>()
  const rows: ExchangeRateSnapshotRow[] = []

  for (const entry of rates || []) {
    const base = String(entry?.base_currency || '').trim().toUpperCase()
    const target = String(entry?.target_currency || '').trim().toUpperCase()
    const rate = Number(entry?.rate)

    if (!base || !target || base === target) continue
    if (!Number.isFinite(rate) || rate <= 0) continue

    const key = `${base}>${target}`
    if (seen.has(key)) continue
    seen.add(key)

    rows.push({ base_currency: base, target_currency: target, rate, source, captured_at: capturedAt })
  }

  return rows
}

/**
 * Persist an exchange rate snapshot to the database.
 * Called during service creation to record the rate used for a conversion.
 */
export async function persistExchangeRate(
  supabase: any,
  fromCurrency: string,
  toCurrency: string,
  rate: number,
  source: string = 'frankfurter'
): Promise<void> {
  try {
    await supabase.from('exchange_rate_snapshots').insert({
      base_currency: fromCurrency,
      target_currency: toCurrency,
      rate,
      source,
    })
  } catch (error) {
    console.warn('⚠️ Failed to persist exchange rate snapshot:', error)
  }
}

/**
 * Get the most recent historical exchange rate for a currency pair.
 * Useful for auditing and reports — looks up saved snapshots.
 */
export async function getHistoricalRate(
  supabase: any,
  fromCurrency: string,
  toCurrency: string,
  date?: Date
): Promise<{ rate: number; capturedAt: string; source: string } | null> {
  try {
    let query = supabase
      .from('exchange_rate_snapshots')
      .select('rate, captured_at, source')
      .eq('base_currency', fromCurrency)
      .eq('target_currency', toCurrency)
      .order('captured_at', { ascending: false })
      .limit(1)

    if (date) {
      // Find the closest snapshot on or before the given date
      query = query.lte('captured_at', date.toISOString())
    }

    const { data, error } = await query

    if (error || !data?.length) return null

    return {
      rate: data[0].rate,
      capturedAt: data[0].captured_at,
      source: data[0].source,
    }
  } catch (error) {
    console.warn('⚠️ Failed to fetch historical exchange rate:', error)
    return null
  }
}

/**
 * Get exchange rate between two currencies.
 * Convenience function for getting a single rate value.
 */
export function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates
): number | null {
  if (fromCurrency === toCurrency) return 1

  if (rates.base === fromCurrency) {
    return rates.rates[toCurrency] || null
  }

  if (rates.base === toCurrency) {
    const rate = rates.rates[fromCurrency]
    return rate ? 1 / rate : null
  }

  // Cross rate through base
  const fromRate = rates.rates[fromCurrency]
  const toRate = rates.rates[toCurrency]
  if (fromRate && toRate) {
    return toRate / fromRate
  }

  return null
}
