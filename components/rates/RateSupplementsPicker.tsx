'use client'

// ============================================
// Which supplements a hotel or cruise rate carries
// ============================================
// The choices are the agency's own list — Settings → Vocabulary → Hotel
// supplements / Cruise supplements — grouped by each entry's note (View,
// Room, Meal Plan…), exactly as that screen's description promised. Picking
// one adds a price row to every dated period below (RateSeasonsEditor).
//
// The stored list keeps the agency's word at the time of picking (`name`),
// so a rate still reads if the entry is later hidden in the vocabulary; the
// label shown here prefers the vocabulary's CURRENT word where it exists.

import { useTranslations } from 'next-intl'
import { Plus, X } from 'lucide-react'
import { useVocabOptions } from '@/hooks/useVocabOptions'
import type { RateSupplement } from '@/lib/rates/supplements'

type Props = {
  kind: 'hotel_supplement' | 'cruise_supplement'
  value: RateSupplement[]
  onChange: (next: RateSupplement[]) => void
  disabled?: boolean
}

export default function RateSupplementsPicker({ kind, value, onChange, disabled = false }: Props) {
  const t = useTranslations('rates.supplements')
  const options = useVocabOptions(kind, [])
  const labelFor = (s: RateSupplement) => options.find(o => o.value === s.key)?.label ?? s.name

  const remaining = options.filter(o => !value.some(s => s.key === o.value))
  // Group by the entry's note; entries without one sit under the kind's title.
  const groups = new Map<string, typeof remaining>()
  for (const o of remaining) {
    const g = o.description ?? ''
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(o)
  }

  const add = (key: string) => {
    const o = options.find(x => x.value === key)
    if (!o || value.some(s => s.key === key)) return
    onChange([...value, { key, name: o.label }])
  }
  const remove = (key: string) => onChange(value.filter(s => s.key !== key))

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <p className="text-xs text-gray-500 mb-2">{t('help')}</p>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3" data-testid="rate-supplements">
          {value.map(s => (
            <span key={s.key} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 text-xs font-medium bg-[#647C47]/10 text-[#4a5c35] rounded-full">
              {labelFor(s)}
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(s.key)}
                title={t('remove')}
                aria-label={`${t('remove')}: ${labelFor(s)}`}
                className="p-0.5 rounded-full hover:bg-white/70 disabled:opacity-50"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {options.length === 0 ? (
        <p className="text-xs text-amber-700">{t('noneDefined')}</p>
      ) : remaining.length === 0 ? (
        <p className="text-xs text-gray-400">{t('allAdded')}</p>
      ) : (
        <label className="inline-flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4 text-[#647C47]" />
          <select
            value=""
            disabled={disabled}
            onChange={e => { add(e.target.value); e.target.value = '' }}
            aria-label={t('add')}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47]"
          >
            <option value="" disabled>{t('add')}</option>
            {[...groups.entries()].map(([group, opts]) =>
              group ? (
                <optgroup key={group} label={group}>
                  {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </optgroup>
              ) : (
                opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
              )
            )}
          </select>
        </label>
      )}
    </div>
  )
}
