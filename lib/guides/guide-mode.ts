// ============================================
// Guide modes: spot and throughout, as the agency's words
// ============================================
// How a guide is sold (operator, 2026-09-04 — guide-grades-throughout):
//   spot        a city guide on each sightseeing day
//   throughout  one guide travels with the group from the first day to the
//               last: a fee every day, his bed, meals for small groups, his
//               seat on flights, trains and in the vehicle
// Since 2026-09-17 (operator: "the guide vocabulary has no option for spot and
// throughout; same for the guide form") a guide rate says which mode it is
// for (guide_rates.guide_mode, migration 20261018) and Settings → Vocabulary →
// Guide modes holds the words. A quote's guide is priced from rates of its own
// mode only: a throughout quote with no throughout rate is No rate, never the
// spot rate.
//
// The engine knows these two keys; a mode an agency adds is stored on its
// rates but never selected by pricing (like an added airport direction).
//
// Client-safe.

import { KEY_PATTERN, slugifyKey } from '@/lib/vocabulary'

export const ENGINE_GUIDE_MODES = ['spot', 'throughout'] as const
export type EngineGuideMode = (typeof ENGINE_GUIDE_MODES)[number]

/** The mode a stored or requested value means: its key, else spot. */
export function guideModeKey(value: unknown): string {
  const k = slugifyKey(String(value ?? ''))
  return KEY_PATTERN.test(k) ? k : 'spot'
}

export const isEngineGuideMode = (v: unknown): v is EngineGuideMode =>
  (ENGINE_GUIDE_MODES as readonly string[]).includes(String(v))

/** The mode a rate row is for — rows from before the column are spot. */
export const rateGuideMode = (row: { guide_mode?: string | null }): string => guideModeKey(row.guide_mode || 'spot')
