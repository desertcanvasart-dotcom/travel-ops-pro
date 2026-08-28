'use client'

import { todayLocal } from '@/lib/today'
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { createClient } from '@/app/supabase'

// ============================================
// TYPES
// ============================================

export interface UserPreferences {
  id?: string
  user_id?: string
  default_cost_mode: 'auto' | 'manual'
  default_tier: string
  default_margin_percent: number
  default_currency: string
  /** The org's supplier-rate currency (what engine amounts are in). Not user-editable. */
  rate_currency?: string
}

export interface ExchangeRates {
  base: string
  date: string
  rates: Record<string, number>
}

interface PreferencesContextType {
  preferences: UserPreferences
  loading: boolean
  error: string | null
  refreshPreferences: () => Promise<void>
  updatePreferences: (newPrefs: Partial<UserPreferences>) => Promise<boolean>
  formatCurrency: (amount: number, currency?: string) => string
  // Exchange rate functions
  exchangeRates: ExchangeRates | null
  exchangeRatesLoading: boolean
  convertCurrency: (amount: number, fromCurrency: string, toCurrency?: string) => number
  formatWithConversion: (amount: number, fromCurrency: string) => string
  refreshExchangeRates: () => Promise<void>
}

// ============================================
// DEFAULT VALUES
// ============================================

const DEFAULT_PREFERENCES: UserPreferences = {
  default_cost_mode: 'auto',
  default_tier: 'standard',
  default_margin_percent: 25,
  default_currency: 'USD',
  rate_currency: 'EUR'
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  EGP: 'E£',
  JPY: '¥'
}

// Yen has no minor unit — ¥1,234.00 is wrong on sight.
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY'])

// ============================================
// CONTEXT
// ============================================

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined)

// ============================================
// PROVIDER
// ============================================

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Exchange rates state
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null)
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false)

  // Fetch user preferences
  const fetchPreferences = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/user-preferences')

      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          setPreferences({
            ...DEFAULT_PREFERENCES,
            ...result.data
          })
        }
      } else if (response.status === 401) {
        // User not logged in, use defaults
        setPreferences(DEFAULT_PREFERENCES)
      }
    } catch (err) {
      console.error('Error fetching preferences:', err)
      setError('Failed to load preferences')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch exchange rates from API
  const fetchExchangeRates = useCallback(async () => {
    try {
      setExchangeRatesLoading(true)

      const response = await fetch('/api/exchange-rates?base=USD')

      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          setExchangeRates(result.data)
        }
      }
    } catch (err) {
      console.error('Error fetching exchange rates:', err)
      // Use fallback rates if API fails
      setExchangeRates({
        base: 'USD',
        date: todayLocal(),
        rates: { USD: 1, EUR: 0.92, GBP: 0.79, EGP: 50.5, JPY: 147 }
      })
    } finally {
      setExchangeRatesLoading(false)
    }
  }, [])

  // Load preferences on mount
  useEffect(() => {
    fetchPreferences()
    fetchExchangeRates()
  }, [fetchPreferences, fetchExchangeRates])

  // Reload preferences when window gains focus
  useEffect(() => {
    const handleFocus = () => {
      fetchPreferences()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchPreferences])

  // Refresh exchange rates every hour
  useEffect(() => {
    const interval = setInterval(() => {
      fetchExchangeRates()
    }, 60 * 60 * 1000) // 1 hour

    return () => clearInterval(interval)
  }, [fetchExchangeRates])

  const refreshPreferences = async () => {
    await fetchPreferences()
  }

  const refreshExchangeRates = async () => {
    await fetchExchangeRates()
  }

  const updatePreferences = async (newPrefs: Partial<UserPreferences>): Promise<boolean> => {
    try {
      const updatedPrefs = { ...preferences, ...newPrefs }

      const response = await fetch('/api/user-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPrefs)
      })

      if (response.ok) {
        setPreferences(updatedPrefs)
        return true
      }
      return false
    } catch (err) {
      console.error('Error updating preferences:', err)
      return false
    }
  }

  // Currency formatting helper (displays in specified currency)
  const formatCurrency = useCallback((amount: number, currency?: string): string => {
    const curr = currency || preferences.default_currency
    const symbol = CURRENCY_SYMBOLS[curr] || curr
    const digits = ZERO_DECIMAL_CURRENCIES.has(curr) ? 0 : 2
    const formatted = amount.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    })

    return `${symbol}${formatted}`
  }, [preferences.default_currency])

  // Convert currency using exchange rates
  const convertCurrency = useCallback((
    amount: number,
    fromCurrency: string,
    toCurrency?: string
  ): number => {
    const targetCurrency = toCurrency || preferences.default_currency

    // Same currency, no conversion needed
    if (fromCurrency === targetCurrency) {
      return amount
    }

    // No rates available, return original amount
    if (!exchangeRates) {
      return amount
    }

    const rates = exchangeRates.rates

    // Get rate for source currency (relative to USD base)
    const fromRate = rates[fromCurrency]
    const toRate = rates[targetCurrency]

    if (!fromRate || !toRate) {
      console.warn(`Exchange rate not available for ${fromCurrency} or ${targetCurrency}`)
      return amount
    }

    // Convert: amount in fromCurrency -> USD -> targetCurrency
    // Since rates are USD-based: 1 USD = X currency
    // So: amount in fromCurrency / fromRate = amount in USD
    // Then: amount in USD * toRate = amount in targetCurrency
    const amountInUSD = amount / fromRate
    const convertedAmount = amountInUSD * toRate

    return Math.round(convertedAmount * 100) / 100
  }, [preferences.default_currency, exchangeRates])

  // Format with automatic conversion to user's preferred currency
  const formatWithConversion = useCallback((
    amount: number,
    fromCurrency: string
  ): string => {
    const convertedAmount = convertCurrency(amount, fromCurrency)
    return formatCurrency(convertedAmount)
  }, [convertCurrency, formatCurrency])

  return (
    <PreferencesContext.Provider value={{
      preferences,
      loading,
      error,
      refreshPreferences,
      updatePreferences,
      formatCurrency,
      // Exchange rate values
      exchangeRates,
      exchangeRatesLoading,
      convertCurrency,
      formatWithConversion,
      refreshExchangeRates
    }}>
      {children}
    </PreferencesContext.Provider>
  )
}

// ============================================
// HOOK
// ============================================

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider')
  }
  return context
}

// ============================================
// UTILITY HOOK FOR CURRENCY
// ============================================

export function useCurrency() {
  const {
    preferences,
    formatCurrency,
    convertCurrency,
    formatWithConversion,
    exchangeRates,
    exchangeRatesLoading
  } = usePreferences()

  return {
    currency: preferences.default_currency,
    /** What engine/rate amounts are denominated in — the source side of formatWithConversion. */
    rateCurrency: preferences.rate_currency || 'EUR',
    /** Symbol for rateCurrency — for labels that prefix a raw rate-table amount. */
    rateSymbol: CURRENCY_SYMBOLS[preferences.rate_currency || 'EUR'] || (preferences.rate_currency || 'EUR'),
    formatCurrency,
    convertCurrency,
    formatWithConversion,
    exchangeRates,
    exchangeRatesLoading
  }
}
