// ============================================
// Recipient locale resolution (client-facing email/messages)
// ============================================
// The operator's UI locale comes from the `preferred_language` COOKIE
// (lib/i18n/server-messages.ts getServerLocale). But a CLIENT-facing email
// must be written in the CLIENT's language, not the operator's. That signal
// lives on `clients.preferred_language`. This module maps that stored value
// to one of our two supported locales and resolves it from the DB.
//
// Everything here is defensive: any missing column / row / error resolves to
// 'en' so a localization lookup can never break the actual send.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type RecipientLocale = 'en' | 'ja'

/**
 * Normalize a stored client language preference to a supported locale.
 * Accepts the common forms an operator (or import) might enter:
 * 'ja', 'jp', 'ja-JP', 'Japanese', '日本語' → 'ja'; everything else → 'en'.
 */
export function localeFromPreferred(preferredLanguage?: string | null): RecipientLocale {
  const v = (preferredLanguage || '').trim().toLowerCase()
  if (v.startsWith('ja') || v === 'jp' || v === 'japanese' || v === '日本語' || v === '日本') {
    return 'ja'
  }
  return 'en'
}

/**
 * Resolve a client's locale from `clients.preferred_language`, keyed by email
 * (the join key carried on invoices/itineraries). Defensive: returns 'en' on
 * any miss or error.
 */
export async function resolveClientLocaleByEmail(
  supabase: SupabaseClient,
  email?: string | null
): Promise<RecipientLocale> {
  if (!email) return 'en'
  try {
    const { data } = await supabase
      .from('clients')
      .select('preferred_language')
      .eq('email', email)
      .limit(1)
      .maybeSingle()
    return localeFromPreferred(data?.preferred_language)
  } catch {
    return 'en'
  }
}

/**
 * Batch variant: resolve a Map<email, locale> for many recipients in one query.
 * Emails with no matching client (or an error) are simply absent from the map;
 * callers should default to 'en'. Used by the reminder run which processes many
 * invoices at once.
 */
export async function resolveClientLocalesByEmail(
  supabase: SupabaseClient,
  emails: (string | null | undefined)[]
): Promise<Map<string, RecipientLocale>> {
  const out = new Map<string, RecipientLocale>()
  const unique = Array.from(new Set(emails.filter((e): e is string => !!e)))
  if (unique.length === 0) return out
  try {
    const { data } = await supabase
      .from('clients')
      .select('email, preferred_language')
      .in('email', unique)
    for (const row of data || []) {
      if (row.email) out.set(row.email, localeFromPreferred(row.preferred_language))
    }
  } catch {
    // leave map empty → callers default to 'en'
  }
  return out
}
