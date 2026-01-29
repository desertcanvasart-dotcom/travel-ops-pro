import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { defaultLocale, locales, type Locale } from './config'

export default getRequestConfig(async () => {
  // Try to get locale from cookie (set when user changes language)
  let locale: Locale = defaultLocale

  try {
    const cookieStore = await cookies()
    const localeCookie = cookieStore.get('preferred_language')?.value

    if (localeCookie && locales.includes(localeCookie as Locale)) {
      locale = localeCookie as Locale
    }
  } catch (error) {
    // Cookie access may fail in some contexts, use default
    console.error('Error reading locale cookie:', error)
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  }
})
