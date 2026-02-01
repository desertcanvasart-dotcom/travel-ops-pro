'use client'

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
}

interface PreferencesContextType {
  preferences: UserPreferences
  loading: boolean
  error: string | null
  refreshPreferences: () => Promise<void>
  updatePreferences: (newPrefs: Partial<UserPreferences>) => Promise<boolean>
  formatCurrency: (amount: number, currency?: string) => string
}

// ============================================
// DEFAULT VALUES
// ============================================

const DEFAULT_PREFERENCES: UserPreferences = {
  default_cost_mode: 'auto',
  default_tier: 'standard',
  default_margin_percent: 25,
  default_currency: 'USD'
}

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

  // Load preferences on mount
  useEffect(() => {
    fetchPreferences()
  }, [fetchPreferences])

  // Also reload preferences when window gains focus (user might have changed them in another tab)
  useEffect(() => {
    const handleFocus = () => {
      fetchPreferences()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchPreferences])

  const refreshPreferences = async () => {
    await fetchPreferences()
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

  // Currency formatting helper
  const formatCurrency = useCallback((amount: number, currency?: string): string => {
    const curr = currency || preferences.default_currency
    const symbols: Record<string, string> = {
      EUR: '€',
      USD: '$',
      GBP: '£',
      EGP: 'E£'
    }

    const symbol = symbols[curr] || curr
    const formatted = amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })

    return `${symbol}${formatted}`
  }, [preferences.default_currency])

  return (
    <PreferencesContext.Provider value={{
      preferences,
      loading,
      error,
      refreshPreferences,
      updatePreferences,
      formatCurrency
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
// UTILITY HOOK FOR JUST CURRENCY
// ============================================

export function useCurrency() {
  const { preferences, formatCurrency } = usePreferences()
  return {
    currency: preferences.default_currency,
    formatCurrency
  }
}
