import { cookies } from 'next/headers'
import en from '@/messages/en.json'
import ja from '@/messages/ja.json'

// JA bundle has extra orphan keys vs EN; we don't enforce structural equality
// here — the bundles are just nested string maps for runtime lookup.
type MessageBundle = Record<string, unknown>

const BUNDLES: Record<string, MessageBundle> = {
  en: en as MessageBundle,
  ja: ja as MessageBundle,
}

// Reads `preferred_language` cookie (next-intl's source of truth — see
// i18n/request.ts). Defaults to 'en' on miss/error/server-only contexts.
export async function getServerLocale(): Promise<'en' | 'ja'> {
  try {
    const cookieStore = await cookies()
    const value = cookieStore.get('preferred_language')?.value
    if (value === 'ja' || value === 'en') return value
  } catch {}
  return 'en'
}

// Lookup a nested key (e.g., "suppliers.errors.supplierIdNotFound") in the
// locale's message bundle, then interpolate {name}-style placeholders.
// Falls back to the English bundle if the key is missing in JA; if missing
// in both, returns the key itself so misses are visible rather than silent.
export function lookupServerMessage(locale: 'en' | 'ja', key: string, params: Record<string, string | number> = {}): string {
  const segments = key.split('.')
  const tryBundle = (bundle: MessageBundle): string | null => {
    let cur: unknown = bundle
    for (const seg of segments) {
      if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[seg]
      } else return null
    }
    return typeof cur === 'string' ? cur : null
  }
  const raw = tryBundle(BUNDLES[locale]) ?? tryBundle(BUNDLES.en) ?? key
  return raw.replace(/\{(\w+)\}/g, (_m, k) => String(params[k] ?? `{${k}}`))
}

// Convenience: cookie → bundle → interpolated string, one call.
export async function tServer(key: string, params: Record<string, string | number> = {}): Promise<string> {
  const locale = await getServerLocale()
  return lookupServerMessage(locale, key, params)
}
