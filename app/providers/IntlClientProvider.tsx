'use client'

import { NextIntlClientProvider, AbstractIntlMessages } from 'next-intl'
import { ReactNode, useEffect, useState } from 'react'
import { defaultLocale, type Locale, locales } from '@/i18n/config'

// Import messages statically
import enMessages from '@/messages/en.json'
import jaMessages from '@/messages/ja.json'

const messages: Record<Locale, AbstractIntlMessages> = {
  en: enMessages,
  ja: jaMessages
}

interface IntlClientProviderProps {
  children: ReactNode
}

// Get locale from cookie
function getLocaleFromCookie(): Locale {
  if (typeof document === 'undefined') return defaultLocale

  const match = document.cookie.match(/preferred_language=([^;]+)/)
  const locale = match?.[1] as Locale | undefined

  if (locale && locales.includes(locale)) {
    return locale
  }

  return defaultLocale
}

export function IntlClientProvider({ children }: IntlClientProviderProps) {
  const [locale, setLocale] = useState<Locale>(defaultLocale)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setLocale(getLocaleFromCookie())
    setMounted(true)

    // Listen for locale changes via custom event
    const handleLocaleChange = (event: CustomEvent<Locale>) => {
      setLocale(event.detail)
    }

    window.addEventListener('localeChange', handleLocaleChange as EventListener)
    return () => {
      window.removeEventListener('localeChange', handleLocaleChange as EventListener)
    }
  }, [])

  // Use default locale for SSR, actual locale after mount
  const currentLocale = mounted ? locale : defaultLocale

  return (
    <NextIntlClientProvider
      locale={currentLocale}
      messages={messages[currentLocale]}
      timeZone="UTC"
    >
      {children}
    </NextIntlClientProvider>
  )
}

// Helper function to change locale (call this from LanguageSelector)
export function changeLocale(newLocale: Locale) {
  // Set cookie
  document.cookie = `preferred_language=${newLocale};path=/;max-age=31536000;SameSite=Lax`

  // Dispatch event to update provider
  window.dispatchEvent(new CustomEvent('localeChange', { detail: newLocale }))

  // Reload to apply changes throughout the app
  window.location.reload()
}
