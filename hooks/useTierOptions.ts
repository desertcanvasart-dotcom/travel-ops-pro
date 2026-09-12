'use client'

import { useLocale } from 'next-intl'
import { useVocabulary } from '@/hooks/useVocabulary'
import { tierOptionsFor, type PresetTier, type TierOption } from '@/lib/vocabulary'

/**
 * The tier buttons a rate form shows — the agency's own ladder from
 * Settings → Vocabulary → Service tiers, so a tier added there appears in
 * the picker without a code change. Falls back to the four presets until
 * the vocabulary loads, or where it is empty.
 *
 * `presetLabel` supplies the built-in i18n word for a preset key
 * (`key => t(\`tiers.${key}\`)`); an agency-added tier carries its own.
 */
export function useTierOptions(presetLabel: (key: PresetTier) => string): TierOption[] {
  const locale = useLocale()
  const { items } = useVocabulary('tier')
  return tierOptionsFor(items, locale, presetLabel)
}
