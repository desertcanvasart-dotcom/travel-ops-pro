// ============================================
// One guide language for the whole trip
// ============================================
// A trip's guide picks were made day by day by the AI reading the text, and
// nothing held them to one language: the same itinerary came out with a
// Spanish guide on some days and an English guide on others (operator,
// 2026-10-10; ported from autoura-saas #645). The grid now carries the trip's
// guide language (GridConfig.guideLanguage): set in the header, or taken from
// the guides most days already have. A parsed trip follows it, and changing it
// moves each day's guide to the same kind of guide in the same city, in that
// language.
//
// Pure: page.tsx and the tests share it.

import type { GridDay, RateOption, SelectedItem } from '../types'

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()

/** Every language a guide rate serves: its own, and its guide's (owner
 *  2026-11-18: a guide's languages belong to the guide). */
const servesOf = (g: RateOption): string[] => [g.language, ...(g.languages ?? [])].map(l => String(l ?? '').trim()).filter(Boolean)

/** The rate serves `language`: written for it, or its guide speaks it. */
export const servesLanguage = (g: RateOption, language: string | null | undefined): boolean =>
  servesOf(g).some(l => norm(l) === norm(language))

/** The rate was written for `language` (before one whose guide merely speaks it). */
const writtenFor = (g: RateOption, language: string) => norm(g.language) === norm(language)

/** The languages the agency has guides in, A→Z. */
export function guideLanguages(guides: RateOption[]): string[] {
  const all = new Map<string, string>()
  for (const g of guides) for (const l of servesOf(g)) if (!all.has(norm(l))) all.set(norm(l), l)
  return [...all.values()].sort((a, b) => a.localeCompare(b))
}

const guideItem = (day: GridDay): SelectedItem | undefined =>
  day.slots.find(s => s.slotId === 'guide')?.selectedItems[0]

/** The language most of the trip's guides speak (the first-seen on a tie), or null. */
export function majorityGuideLanguage(days: GridDay[], guides: RateOption[]): string | null {
  const byId = new Map(guides.map(g => [g.id, g]))
  const counts = new Map<string, number>()
  for (const day of days) {
    const lang = byId.get(guideItem(day)?.rateId ?? '')?.language
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [lang, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = lang
  return best
}

/** Of `pool`, the guides in `language` first — the whole pool when none is. */
export function preferLanguage(pool: RateOption[], language: string | null | undefined): RateOption[] {
  if (!language) return pool
  const inLang = pool.filter(g => servesLanguage(g, language))
    .sort((a, b) => Number(writtenFor(b, language)) - Number(writtenFor(a, language)))
  return inLang.length ? inLang : pool
}

/** The guide in `language` that stands in for `current`: same city and kind,
 *  else same city. Null when the city has no guide in that language. */
export function counterpart(current: RateOption, language: string, guides: RateOption[]): RateOption | null {
  const sameCity = (g: RateOption) => norm(g.city) === norm(current.city)
  const inLang = guides.filter(g => servesLanguage(g, language) && sameCity(g))
    .sort((a, b) => Number(writtenFor(b, language)) - Number(writtenFor(a, language)))
  return inLang.find(g => norm(g.category) === norm(current.category)) ?? inLang[0] ?? null
}

export interface LanguageAlignment {
  days: GridDay[]
  /** Days whose guide moved to the language. */
  changed: number[]
  /** Days whose city has no guide in the language: left as they were. */
  unmatched: number[]
}

/** Every day's guide in `language`. A guide not in the rate list (a custom
 *  line) or already in the language is left alone. */
export function alignGuideLanguage(days: GridDay[], guides: RateOption[], language: string): LanguageAlignment {
  const byId = new Map(guides.map(g => [g.id, g]))
  const changed: number[] = []
  const unmatched: number[] = []
  const next = days.map(day => {
    const item = guideItem(day)
    const current = item ? byId.get(item.rateId) : undefined
    if (!current || !current.language || servesLanguage(current, language)) return day
    const swap = counterpart(current, language, guides)
    if (!swap) {
      unmatched.push(day.dayNumber)
      return day
    }
    changed.push(day.dayNumber)
    const replacement: SelectedItem = {
      rateId: swap.id,
      name: swap.name,
      rateEur: swap.rateEur,
      rateNonEur: swap.rateNonEur,
      guideRate: swap.guide_rate,
      // The rate's dated periods: the day is priced by the one covering its date.
      periods: swap.periods,
      ...(swap.pricing_basis ? { pricingBasis: swap.pricing_basis, unitCapacity: swap.unit_capacity ?? null } : {}),
    }
    return {
      ...day,
      slots: day.slots.map(s => (s.slotId === 'guide' ? { ...s, selectedItems: [replacement], customAmount: 0 } : s)),
    }
  })
  return { days: changed.length ? next : days, changed, unmatched }
}
