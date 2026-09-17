'use client'

// ============================================
// Guide language: one picker for every price view
// ============================================
// Settings → Vocabulary's list, in its order and words; a language with no
// active guide rate is shown but not selectable (lib/guides/guide-language).
// The first language that has a rate is preselected — the office holds
// Japanese guide contracts only, and a view that asked for English priced
// every guide day as No rate (operator, 2026-09-17: the tour page did).

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useVocabLabel } from '@/hooks/useVocabLabel'
import { useVocabOptions } from '@/hooks/useVocabOptions'
import { optionsFromLabels } from '@/lib/vocabulary'
import { BUILT_IN_GUIDE_LANGUAGES, guideLanguageKey } from '@/lib/guides/guide-language'

/** The chosen language key ('' until the rates load) and what to offer. */
export function useGuideLanguageChoice() {
  const options = useVocabOptions('guide_language', optionsFromLabels(BUILT_IN_GUIDE_LANGUAGES))
  // Keys that HAVE an active guide rate.
  const [withRate, setWithRate] = useState<string[]>([])
  const [value, setValue] = useState('')

  useEffect(() => {
    fetch('/api/rates/guides')
      .then(r => r.json())
      .then(j => {
        const keys: string[] = []
        for (const row of (j?.data ?? []) as { guide_language?: string; is_active?: boolean }[]) {
          const k = guideLanguageKey(row.guide_language)
          if (k && row.is_active !== false && !keys.includes(k)) keys.push(k)
        }
        setWithRate(keys)
      })
      .catch(() => setWithRate([]))
  }, [])

  // The first language in the vocabulary's order that has a rate.
  const order = options.map(o => o.value).join('|')
  useEffect(() => {
    if (value && withRate.includes(value)) return
    const first = options.find(o => withRate.includes(o.value))?.value ?? withRate[0]
    if (first) setValue(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withRate, order])

  return { value, setValue, options, withRate }
}

export default function GuideLanguageSelect({
  choice,
  className = 'w-full px-3 py-2 border rounded-lg bg-white',
  id,
}: {
  choice: ReturnType<typeof useGuideLanguageChoice>
  className?: string
  id?: string
}) {
  const t = useTranslations('b2bCalculator')
  const label = useVocabLabel('guide_language')
  const { value, setValue, options, withRate } = choice
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className={className}
      data-testid="guide-language"
    >
      {options.map(o => (
        <option key={o.value} value={o.value} disabled={!withRate.includes(o.value)}>
          {withRate.includes(o.value) ? o.label : t('guideLanguageNoRate', { language: o.label })}
        </option>
      ))}
      {/* A rate in a language the vocabulary no longer lists still prices. */}
      {withRate.filter(k => !options.some(o => o.value === k)).map(k => (
        <option key={k} value={k}>{label(k, k)}</option>
      ))}
    </select>
  )
}
