'use client'

import { useLocale } from 'next-intl'
import { useVocabulary } from '@/hooks/useVocabulary'
import { slugifyKey, type VocabularyKind } from '@/lib/vocabulary'

/**
 * Generic white-label label resolver for any vocabulary KIND.
 *
 * Relabel, not remap: the stored key never changes — this only swaps the
 * DISPLAYED word for whatever the agency set in Settings → Vocabulary.
 *
 * Per-locale, and non-regressive: English uses `label`, Japanese uses
 * `label_ja`, and where the agency's override for the active language is
 * empty — or the vocabulary migration isn't applied — the provided
 * `fallback` (the built-in i18n label) stands. So a locale keeps its
 * translations until the operator types a label for it.
 *
 * `useTierLabel` / `useVehicleLabel` are the same resolver pinned to one
 * kind; new kinds should use this generic hook.
 */
export function useVocabLabel(kind: VocabularyKind): (key: string | null | undefined, fallback: string) => string {
  const locale = useLocale()
  const { all } = useVocabulary(kind)
  return (key, fallback) => {
    if (!key) return fallback
    // Vocabulary keys are lowercase slugs by constraint; some stored codes are
    // not (board_basis 'BB', sleeper_cabin 'Half Twin'), so slugify the stored
    // value before matching. slugifyKey is idempotent on existing slug keys.
    const item = all.find(i => i.key === slugifyKey(key))
    if (!item) return fallback
    const override = locale === 'ja' ? item.label_ja : item.label
    return override && override.trim() ? override : fallback
  }
}
