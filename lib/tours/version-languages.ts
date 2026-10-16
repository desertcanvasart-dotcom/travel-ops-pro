// ============================================
// Which languages a tour already reads in
// ============================================
// The tour page offers "Create version" for a language the tour has no
// version in. A tour with no version rows at all answered
// available_languages: [] — an empty array is truthy, so `|| ['en']` never
// applied, the English tab claimed English was missing, and "Create version"
// machine-translated the English base content as if it were Japanese.
// The base content is the English version until a version row says otherwise.

import type { Language } from '@/types/multilingual'

/** The languages a tour has, the base English when it has no version rows. */
export function tourLanguages(available: readonly Language[] | null | undefined): Language[] {
  return available && available.length > 0 ? [...available] : ['en']
}

/** Whether the page should offer to create a version in `language`. */
export function needsVersion(available: readonly Language[] | null | undefined, language: Language): boolean {
  return !tourLanguages(available).includes(language)
}
