// ============================================
// Supplements on a hotel or cruise rate
// ============================================
// A supplement is an extra a property charges PER PERSON PER NIGHT on top of
// the room: a view, a floor, a meal plan, a deck. Which supplements exist is
// the agency's own list — Settings → Vocabulary → Hotel supplements (kind
// `hotel_supplement`) and Cruise supplements (`cruise_supplement`). Nothing
// here knows a single supplement by name.
//
// STORAGE, two halves on the rate row:
//   * `supplements` (JSONB) — the list of supplements THIS rate carries:
//     [{ key, name }]. `key` is the vocabulary key; `name` is the agency's
//     word at the time it was added, kept so the rate still reads if the
//     entry is later hidden or removed from the vocabulary.
//   * the PRICE lives inside each dated period, in `seasons[].rates`, under
//     `supp:<key>:eur` / `supp:<key>:non_eur` — next to pp_double and the
//     single supplement, so every date-resolution, currency-conversion and
//     legacy-bridge path that already handles a period's rates handles these
//     too (lib/rates/rate-seasons keeps those keys; lib/rates/rate-currency
//     converts every value in a period's rates).
//
// PRICING: a programme day names the supplements it wants (ItineraryDay
// .supplements, vocabulary keys). The engine charges each one the resolved
// property prices for that night; one the property does not carry — or
// carries at a blank rate — is an UNPRICED HOLE, never silently free.

import { KEY_PATTERN } from '@/lib/vocabulary'
import { periodRatesFor, SUPPLEMENT_FIELD, type RateSeasonEntity } from './rate-seasons'

export interface RateSupplement {
  key: string
  name: string
}

export type SupplementSuffix = 'eur' | 'non_eur'

/** The period rate field a supplement's price is stored under. */
export function supplementField(key: string, suffix: SupplementSuffix): string {
  return `supp:${key}:${suffix}`
}

/** Parse the `supplements` list off a form or API body. Never throws: an
 *  unusable payload reads as "no supplements" (an empty list). Keys must be
 *  vocabulary keys; duplicates keep the first; names are trimmed and capped. */
export function sanitizeSupplements(input: unknown): RateSupplement[] {
  let list: unknown = input
  if (typeof list === 'string') {
    try { list = JSON.parse(list) } catch { return [] }
  }
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: RateSupplement[] = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const s = raw as Record<string, unknown>
    const key = typeof s.key === 'string' ? s.key.trim() : ''
    if (!KEY_PATTERN.test(key) || seen.has(key)) continue
    seen.add(key)
    const name = typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 80) : key
    out.push({ key, name })
  }
  return out
}

/** The supplements a stored rate row carries (tolerates the JSONB as a string). */
export function supplementsForRow(row: object | null | undefined): RateSupplement[] {
  return sanitizeSupplements((row as { supplements?: unknown } | null | undefined)?.supplements)
}

/** The supplement keys that have a price in a period's rates — what the
 *  seasons editor renders a row for when the list on the row is empty. */
export function supplementKeysInRates(rates: Record<string, unknown> | null | undefined): string[] {
  const keys: string[] = []
  for (const field of Object.keys(rates ?? {})) {
    const m = SUPPLEMENT_FIELD.exec(field)
    if (m && !keys.includes(m[1])) keys.push(m[1])
  }
  return keys
}

export interface ResolvedSupplement {
  key: string
  /** The agency's word as stored on the rate, or the key when the rate
   *  does not carry the supplement at all. */
  name: string
  /** Per person, this night. 0 = the rate carries no price for it. */
  night: number
  /** Whether the rate lists this supplement at all. */
  carried: boolean
}

/** What one night of each requested supplement costs on this rate row, per
 *  person, at the period the travel date falls in. A key the row does not
 *  carry, or carries with no price, resolves to 0 with `carried` telling the
 *  two apart — the caller prices both as a hole, with a different message. */
export function resolveSupplementsForDate(
  row: object,
  entity: RateSeasonEntity,
  isEurPassport: boolean,
  travelDate: string | null | undefined,
  keys: readonly string[]
): ResolvedSupplement[] {
  const carried = new Map(supplementsForRow(row).map(s => [s.key, s.name]))
  // The night's own period; with no travel date, the FIRST period. A date no
  // period covers has no price — the same rule as the room itself
  // (rate-seasons periodRatesFor), so the supplement is a hole, not free and
  // not borrowed from another season.
  const rates: Record<string, number> = periodRatesFor(row, entity, travelDate)?.rates ?? {}
  const suffix: SupplementSuffix = isEurPassport ? 'eur' : 'non_eur'
  return keys.map(key => {
    const value = Number(rates[supplementField(key, suffix)])
    return {
      key,
      name: carried.get(key) ?? key,
      night: carried.has(key) && Number.isFinite(value) && value > 0 ? value : 0,
      carried: carried.has(key),
    }
  })
}

/** The vocabulary keys a programme day asks for — strings that are keys,
 *  de-duplicated, order kept. Anything else reads as "none". */
export function sanitizeSupplementKeys(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out: string[] = []
  for (const v of input) {
    const key = typeof v === 'string' ? v.trim() : ''
    if (KEY_PATTERN.test(key) && !out.includes(key)) out.push(key)
  }
  return out.length ? out : undefined
}
