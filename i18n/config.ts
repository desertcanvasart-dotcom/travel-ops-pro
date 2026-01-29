export const locales = ['en', 'ja'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ja: '日本語'
}

export const localeFlags: Record<Locale, string> = {
  en: '🇬🇧',
  ja: '🇯🇵'
}

// Date/time format options per locale
export const dateFormats: Record<Locale, Intl.DateTimeFormatOptions> = {
  en: {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  },
  ja: {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }
}

// Currency format options
export const currencyFormats: Record<Locale, { currency: string; locale: string }> = {
  en: { currency: 'USD', locale: 'en-US' },
  ja: { currency: 'JPY', locale: 'ja-JP' }
}
