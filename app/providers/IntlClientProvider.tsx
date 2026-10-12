'use client'

import { NextIntlClientProvider, AbstractIntlMessages } from 'next-intl'
import { ReactNode, useEffect, useState } from 'react'
import { type Locale } from '@/i18n/config'

// Import messages statically
import enMessages from '@/messages/en.json'
import jaMessages from '@/messages/ja.json'

const messages: Record<Locale, AbstractIntlMessages> = {
  en: enMessages,
  ja: jaMessages
}

interface IntlClientProviderProps {
  children: ReactNode
  /** Read from the preferred_language cookie on the server (app/layout.tsx),
   *  so the server render and the first client render agree. */
  locale: Locale
}

export function IntlClientProvider({ children, locale: initialLocale }: IntlClientProviderProps) {
  // Starts in the request's locale. It used to start in the default locale and
  // switch to the cookie's after mount, so a Japanese user saw English first
  // and every effect depending on `t` ran twice.
  const [locale, setLocale] = useState<Locale>(initialLocale)

  useEffect(() => {
    // Listen for locale changes via custom event
    const handleLocaleChange = (event: CustomEvent<Locale>) => {
      setLocale(event.detail)
    }

    window.addEventListener('localeChange', handleLocaleChange as EventListener)
    return () => {
      window.removeEventListener('localeChange', handleLocaleChange as EventListener)
    }
  }, [])

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages[locale]}
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
