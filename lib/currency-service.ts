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

// Supported currencies
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'EGP'] as const
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]

// Currency symbols
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  EGP: 'E£'
}

// Cache for exchange rates (in-memory, refreshes on server restart)
let cachedRates: ExchangeRates | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 60 * 60 * 1000 // 1 hour in milliseconds

/**
 * Fetch latest exchange rates from Frankfurter API
 * Uses USD as base currency
 */
export async function fetchExchangeRates(baseCurrency: string = 'USD'): Promise<ExchangeRates> {
  // Check cache first
  const now = Date.now()
  if (cachedRates && cachedRates.base === baseCurrency && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedRates
  }

  try {
    // Frankfurter API - free, no API key required
    const response = await fetch(
      `https://api.frankfurter.app/latest?from=${baseCurrency}`,
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

    return rates
  } catch (error) {
    console.error('Error fetching exchange rates:', error)

    // Return fallback rates if API fails
    return getFallbackRates(baseCurrency)
  }
}

/**
 * Fallback rates in case API is unavailable
 * These are approximate rates and should only be used as backup
 */
function getFallbackRates(baseCurrency: string): ExchangeRates {
  // Approximate rates as of early 2026 (USD as reference)
  const usdRates: Record<string, number> = {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    EGP: 50.5
  }

  if (baseCurrency === 'USD') {
    return {
      base: 'USD',
      date: new Date().toISOString().split('T')[0],
      rates: usdRates
    }
  }

  // Convert rates to different base
  const baseRate = usdRates[baseCurrency] || 1
  const convertedRates: Record<string, number> = {}

  for (const [currency, rate] of Object.entries(usdRates)) {
    convertedRates[currency] = rate / baseRate
  }

  return {
    base: baseCurrency,
    date: new Date().toISOString().split('T')[0],
    rates: convertedRates
  }
}

/**
 * Convert amount from one currency to another
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates
): number {
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

  // Return original amount if conversion not possible
  console.warn(`Could not convert ${fromCurrency} to ${toCurrency}`)
  return amount
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
  const { showSymbol = true, decimals = 2 } = options || {}

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
