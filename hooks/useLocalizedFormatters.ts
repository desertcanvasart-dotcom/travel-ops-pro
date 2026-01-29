'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

interface UseLocalizedFormattersReturn {
  // Currency formatting
  formatCurrency: (amount: number, currency?: string) => string
  formatCurrencyCompact: (amount: number, currency?: string) => string

  // Number formatting
  formatNumber: (value: number) => string
  formatPercent: (value: number, decimals?: number) => string
  formatDecimal: (value: number, decimals?: number) => string

  // Date formatting
  formatDate: (date: Date | string | number, style?: 'short' | 'medium' | 'long' | 'full') => string
  formatTime: (date: Date | string | number, style?: 'short' | 'medium' | 'long' | 'full') => string
  formatDateTime: (date: Date | string | number, dateStyle?: 'short' | 'medium' | 'long', timeStyle?: 'short' | 'medium') => string
  formatRelativeTime: (date: Date | string | number) => string

  // Pluralization
  formatPax: (count: number) => string
  formatNights: (count: number) => string
  formatDays: (count: number) => string

  // Locale info
  locale: string
  currencySymbol: string
}

// Default currencies by locale
const LOCALE_CURRENCIES: Record<string, string> = {
  'en': 'USD',
  'en-US': 'USD',
  'en-GB': 'GBP',
  'ja': 'JPY',
  'ja-JP': 'JPY',
  'de': 'EUR',
  'fr': 'EUR',
  'ar': 'EGP',
  'ar-EG': 'EGP',
}

// Currency symbols
const CURRENCY_SYMBOLS: Record<string, string> = {
  'USD': '$',
  'EUR': '\u20AC',
  'GBP': '\u00A3',
  'JPY': '\u00A5',
  'EGP': 'E\u00A3',
}

export function useLocalizedFormatters(): UseLocalizedFormattersReturn {
  const format = useFormatter()
  const locale = useLocale()
  const t = useTranslations('formats')

  const defaultCurrency = LOCALE_CURRENCIES[locale] || 'USD'
  const currencySymbol = CURRENCY_SYMBOLS[defaultCurrency] || '$'

  const formatters = useMemo(() => {
    const toDate = (date: Date | string | number): Date => {
      if (date instanceof Date) return date
      return new Date(date)
    }

    return {
      // Currency formatting
      formatCurrency: (amount: number, currency: string = defaultCurrency): string => {
        return format.number(amount, {
          style: 'currency',
          currency,
          minimumFractionDigits: currency === 'JPY' ? 0 : 2,
          maximumFractionDigits: currency === 'JPY' ? 0 : 2,
        })
      },

      formatCurrencyCompact: (amount: number, currency: string = defaultCurrency): string => {
        // For large amounts, use compact notation
        if (Math.abs(amount) >= 1000000) {
          return format.number(amount, {
            style: 'currency',
            currency,
            notation: 'compact',
            maximumFractionDigits: 1,
          })
        }
        if (Math.abs(amount) >= 1000) {
          return format.number(amount, {
            style: 'currency',
            currency,
            notation: 'compact',
            maximumFractionDigits: 0,
          })
        }
        return format.number(amount, {
          style: 'currency',
          currency,
          minimumFractionDigits: currency === 'JPY' ? 0 : 2,
          maximumFractionDigits: currency === 'JPY' ? 0 : 2,
        })
      },

      // Number formatting
      formatNumber: (value: number): string => {
        return format.number(value)
      },

      formatPercent: (value: number, decimals: number = 0): string => {
        return format.number(value / 100, {
          style: 'percent',
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      },

      formatDecimal: (value: number, decimals: number = 2): string => {
        return format.number(value, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      },

      // Date formatting
      formatDate: (date: Date | string | number, style: 'short' | 'medium' | 'long' | 'full' = 'medium'): string => {
        const d = toDate(date)
        if (isNaN(d.getTime())) return ''
        return format.dateTime(d, { dateStyle: style })
      },

      formatTime: (date: Date | string | number, style: 'short' | 'medium' | 'long' | 'full' = 'short'): string => {
        const d = toDate(date)
        if (isNaN(d.getTime())) return ''
        return format.dateTime(d, { timeStyle: style })
      },

      formatDateTime: (
        date: Date | string | number,
        dateStyle: 'short' | 'medium' | 'long' = 'medium',
        timeStyle: 'short' | 'medium' = 'short'
      ): string => {
        const d = toDate(date)
        if (isNaN(d.getTime())) return ''
        return format.dateTime(d, { dateStyle, timeStyle })
      },

      formatRelativeTime: (date: Date | string | number): string => {
        const d = toDate(date)
        if (isNaN(d.getTime())) return ''
        return format.relativeTime(d)
      },

      // Pluralization - these use the translation file
      formatPax: (count: number): string => {
        try {
          return t('pax', { count })
        } catch {
          // Fallback if translation not available
          return `${count} ${count === 1 ? 'person' : 'people'}`
        }
      },

      formatNights: (count: number): string => {
        try {
          return t('nights', { count })
        } catch {
          return `${count} ${count === 1 ? 'night' : 'nights'}`
        }
      },

      formatDays: (count: number): string => {
        try {
          return t('days', { count })
        } catch {
          return `${count} ${count === 1 ? 'day' : 'days'}`
        }
      },
    }
  }, [format, defaultCurrency, t])

  return {
    ...formatters,
    locale,
    currencySymbol,
  }
}

// Standalone formatting functions for server-side or non-React contexts
export function createFormatters(locale: string) {
  const defaultCurrency = LOCALE_CURRENCIES[locale] || 'USD'

  return {
    formatCurrency: (amount: number, currency: string = defaultCurrency): string => {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: currency === 'JPY' ? 0 : 2,
        maximumFractionDigits: currency === 'JPY' ? 0 : 2,
      }).format(amount)
    },

    formatNumber: (value: number, options?: Intl.NumberFormatOptions): string => {
      return new Intl.NumberFormat(locale, options).format(value)
    },

    formatDate: (date: Date | string | number, style: 'short' | 'medium' | 'long' | 'full' = 'medium'): string => {
      const d = date instanceof Date ? date : new Date(date)
      if (isNaN(d.getTime())) return ''
      return new Intl.DateTimeFormat(locale, { dateStyle: style }).format(d)
    },

    formatDateTime: (date: Date | string | number): string => {
      const d = date instanceof Date ? date : new Date(date)
      if (isNaN(d.getTime())) return ''
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(d)
    },
  }
}
