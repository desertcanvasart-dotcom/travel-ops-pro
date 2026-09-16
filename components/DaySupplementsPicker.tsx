'use client'

// ============================================
// The supplements a programme day asks for
// ============================================
// A hotel night can be sold with a Nile view, a cruise night on the upper
// deck. The day stores the vocabulary KEYS it wants; the pricing engine
// charges each one at the resolved property's rate for that night, and a
// property that has no price for it is an unpriced hole (never free). The
// list offered is the agency's own — hotel supplements for a hotel night,
// cruise supplements for a cruise day — narrowed to what the property in use
// actually carries when the day editor knows it: a hotel with no Nile view
// does not offer one (operator, 2026-09-16).

import { useTranslations } from 'next-intl'
import { useVocabOptions } from '@/hooks/useVocabOptions'

type Props = {
  /** 'cruise' offers the cruise list; anything else the hotel list. */
  accommodationType?: string | null
  value: readonly string[] | undefined
  onChange: (keys: string[] | undefined) => void
  disabled?: boolean
  compact?: boolean
  /** The supplements the hotel or ship in use carries. When given, only these
   *  are offered, and a ticked one it does not carry is flagged. undefined =
   *  property unknown: offer the whole vocabulary. */
  carried?: readonly { key: string; name: string }[]
  /** That property's name, for the messages. */
  propertyName?: string
}

export default function DaySupplementsPicker({ accommodationType, value, onChange, disabled = false, compact = false, carried, propertyName }: Props) {
  const t = useTranslations('rates.supplements')
  const kind = accommodationType === 'cruise' ? 'cruise_supplement' : 'hotel_supplement'
  const vocabulary = useVocabOptions(kind, [])
  const selected = value ?? []
  const carriedKeys = carried ? new Set(carried.map(c => c.key)) : null
  // The agency's word where it has one; the property's stored name otherwise.
  const options = carried
    ? carried.map(c => vocabulary.find(o => o.value === c.key) ?? { value: c.key, label: c.name, description: undefined })
    : vocabulary
  // Ticked on the day but not carried by the property in use: still shown so
  // it can be taken off — pricing lists it as a hole.
  const notCarried = carriedKeys ? selected.filter(k => !carriedKeys.has(k)) : []

  if (carried && options.length === 0 && notCarried.length === 0) {
    return propertyName
      ? <p className="text-[11px] text-gray-500" data-testid="day-supplements">{t('noneCarried', { name: propertyName })}</p>
      : null
  }

  if (options.length === 0 && notCarried.length === 0) {
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
        {notCarried.map(key => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => toggle(key)}
            aria-pressed
            title={t('notCarried', { name: propertyName ?? '' })}
            className="px-2 py-0.5 text-xs rounded-full border border-red-400 bg-red-50 text-red-700 line-through disabled:opacity-50"
          >
            {vocabulary.find(o => o.value === key)?.label ?? key}
          </button>
        ))}
      </div>
      {notCarried.length > 0 && (
        <p className="text-[11px] text-red-600 mt-1">{t('notCarried', { name: propertyName ?? '' })}</p>
      )}
    </div>
  )
}
