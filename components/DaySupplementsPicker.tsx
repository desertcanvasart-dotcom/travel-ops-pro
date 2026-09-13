'use client'

// ============================================
// The supplements a programme day asks for
// ============================================
// A hotel night can be sold with a Nile view, a cruise night on the upper
// deck. The day stores the vocabulary KEYS it wants; the pricing engine
// charges each one at the resolved property's rate for that night, and a
// property that has no price for it is an unpriced hole (never free). The
// list offered is the agency's own — hotel supplements for a hotel night,
// cruise supplements for a cruise day.

import { useTranslations } from 'next-intl'
import { useVocabOptions } from '@/hooks/useVocabOptions'

type Props = {
  /** 'cruise' offers the cruise list; anything else the hotel list. */
  accommodationType?: string | null
  value: readonly string[] | undefined
  onChange: (keys: string[] | undefined) => void
  disabled?: boolean
  compact?: boolean
}

export default function DaySupplementsPicker({ accommodationType, value, onChange, disabled = false, compact = false }: Props) {
  const t = useTranslations('rates.supplements')
  const kind = accommodationType === 'cruise' ? 'cruise_supplement' : 'hotel_supplement'
  const options = useVocabOptions(kind, [])
  const selected = value ?? []

  if (options.length === 0) {
    // Nothing to offer: the agency defines the list in Settings. Say so only
    // when a day already carries keys the vocabulary no longer lists.
    return selected.length > 0
      ? <p className="text-xs text-amber-700">{t('noneDefined')}</p>
      : null
  }

  const toggle = (key: string) => {
    const next = selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]
    onChange(next.length ? next : undefined)
  }

  return (
    <div data-testid="day-supplements">
      {!compact && <label className="block text-xs font-medium text-gray-600 mb-1">{t('dayLabel')}</label>}
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const on = selected.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() => toggle(o.value)}
              aria-pressed={on}
              title={o.description ?? undefined}
              className={`px-2 py-0.5 text-xs rounded-full border transition-colors disabled:opacity-50 ${
                on
                  ? 'bg-[#647C47] border-[#647C47] text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-[#647C47]'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
