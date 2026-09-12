'use client'

import { useLocale } from 'next-intl'
import { useVocabulary } from '@/hooks/useVocabulary'
import { vocabOptionsFor, type BuiltInOption, type VocabOption, type VocabularyKind } from '@/lib/vocabulary'

/**
 * The choices a picker offers for one vocabulary KIND — the agency's own
 * list from Settings → Vocabulary (hidden entries omitted, agency order,
 * added entries included), falling back to the form's built-in list until
 * the vocabulary loads or where it is empty.
 *
 * This is the "remap" half the white-label rollout was missing: useVocabLabel
 * only swapped the WORD for a key the form already knew, so an entry added
 * in Settings never appeared, and a hidden one never disappeared. Pass the
 * form's old list as `builtIn` (with the i18n words) and map over the result.
 */
export function useVocabOptions(kind: VocabularyKind, builtIn: readonly BuiltInOption[]): VocabOption[] {
  const locale = useLocale()
  const { items } = useVocabulary(kind)
  return vocabOptionsFor(items, locale, builtIn)
}
