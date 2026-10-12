import { getLocale } from 'next-intl/server'
import AppShell from './AppShell'
import { defaultLocale, locales, type Locale } from '@/i18n/config'

// The locale comes from the preferred_language cookie (i18n/request.ts), read
// here on the server. The layout used to be entirely client-side, so the
// server could not know it: every page rendered in English first and switched
// after mount — a flash of English for Japanese users, and every effect that
// depends on a translation ran twice.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requested = await getLocale()
  const locale: Locale = locales.includes(requested as Locale) ? (requested as Locale) : defaultLocale
  return <AppShell locale={locale}>{children}</AppShell>
}
