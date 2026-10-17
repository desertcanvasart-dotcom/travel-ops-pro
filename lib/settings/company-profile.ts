// ============================================
// Company Profile — the rules the branding route enforces
// ============================================
// Pure, so they are tested without a database (__tests__/api/company-profile-rules.test.ts).

import { normaliseRateCurrency, RATE_CURRENCIES } from '@/lib/org-rate-currency'

/**
 * A currency field of the profile: blank clears it (null), one of the app's
 * five codes is stored upper-case, anything else is refused. It used to store
 * any string, and default_currency is what every colleague without a
 * preference inherits — 'XYZ' would have become their money format.
 */
export function parseProfileCurrency(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value === 'string' && !value.trim()) return { ok: true, value: null }
  const code = normaliseRateCurrency(value)
  return code ? { ok: true, value: code } : { ok: false }
}

export const CURRENCY_REFUSED = `Currency must be one of ${RATE_CURRENCIES.join(', ')}`

/**
 * What a logo may be. SVG is refused: the logo lands in the PUBLIC `documents`
 * bucket (getPublicUrl; the bucket is public — see the note in
 * migrations/archive/20260827_traveller_documents.sql), and an SVG opened by
 * its URL runs any script it carries. PNG, JPEG and WebP cannot.
 */
export const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/**
 * Renaming the company is the owner's, here exactly as on the Organization
 * page (PUT /api/organization). The profile form sends its name on every
 * save, so only a CHANGED name needs the owner; an unchanged one passes.
 */
export function renameNeedsOwner(currentName: string | null | undefined, requested: unknown): boolean {
  if (typeof requested !== 'string') return false
  const next = requested.trim()
  if (!next) return false // a blank name is ignored by the route, never stored
  return next !== (currentName ?? '').trim()
}
