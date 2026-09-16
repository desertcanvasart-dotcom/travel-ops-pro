'use client'

// ============================================
// The hotel or ship a programme stay uses, at the tier being priced
// ============================================
// A day said "Hotel (Cairo)" and nobody could see which hotel, or change it
// (operator, 2026-09-16). This shows the property the engine will use and
// lets the operator pick another. "Automatic" names the hotel the engine
// picks when nothing is chosen — the first of the same list the engine reads
// (lib/pricing/property-candidates). One choice covers the whole stay: every
// night in the city, or every night aboard (lib/pricing/property-choice).

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Building2, Ship } from 'lucide-react'
import type { AccommodationOption } from '@/app/api/b2b/accommodation-options/route'

type Loaded = { options: AccommodationOption[]; autoId: string | null }

// One request per kind/city/tier for the page's life: every night of a stay
// asks the same question.
const cache = new Map<string, Promise<Loaded>>()

function load(kind: 'hotel' | 'cruise', tier: string, city: string, embark: string | null): Promise<Loaded> {
  const qs = new URLSearchParams({ kind, tier })
  if (kind === 'hotel') qs.set('city', city)
  else if (embark) qs.set('embark', embark)
  const key = qs.toString()
  let hit = cache.get(key)
  if (!hit) {
    hit = fetch(`/api/b2b/accommodation-options?${key}`)
      .then(r => r.json())
      .then(j => (j?.success ? { options: j.options ?? [], autoId: j.auto_id ?? null } : Promise.reject(new Error(j?.error))))
    hit.catch(() => cache.delete(key))
    cache.set(key, hit)
  }
  return hit
}

type Props = {
  kind: 'hotel' | 'cruise'
  /** Where the hotel night sleeps (overnight city, else the day's city). */
  city: string
  /** The first cruise day's city — narrows ships by embarkation port. */
  embark?: string | null
  tier: string
  tierLabel: string
  /** The chosen rate row id; undefined = automatic. */
  value: string | undefined
  onChange: (id: string | undefined) => void
  /** The property that will actually be used (chosen or automatic), for the
   *  supplements picker. null = none available. */
  onResolved?: (option: AccommodationOption | null) => void
}

export default function DayPropertyPicker({ kind, city, embark = null, tier, tierLabel, value, onChange, onResolved }: Props) {
  const t = useTranslations('b2bCalculator.property')
  const [data, setData] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setData(null)
    setFailed(false)
    if (kind === 'hotel' && !city) return
    load(kind, tier, city, embark)
      .then(d => { if (live) setData(d) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [kind, city, embark, tier])

  const options = data?.options ?? []
  const auto = options.find(o => o.id === data?.autoId) ?? null
  const chosen = value ? options.find(o => o.id === value) ?? null : null
  // A choice not in the list: switched off, deleted, or another tier's row.
  const chosenMissing = Boolean(value && data && !chosen)
  const inUse = value ? chosen : auto

  useEffect(() => {
    if (data) onResolved?.(inUse)
    // onResolved is a fresh closure each render; the id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, inUse?.id])

  const Icon = kind === 'hotel' ? Building2 : Ship
  const describe = (o: AccommodationOption) =>
    kind === 'cruise'
      ? [o.name, o.route, o.nights ? t('nights', { count: o.nights }) : null].filter(Boolean).join(' · ')
      : o.name

  return (
    <div data-testid="day-property">
      <label className="block text-xs font-medium text-gray-600 mb-1">
        <Icon className="w-3 h-3 inline mr-1" />
        {kind === 'hotel' ? t('hotelLabel', { tier: tierLabel }) : t('shipLabel', { tier: tierLabel })}
      </label>

      {failed ? (
        <p className="text-xs text-red-600">{t('loadFailed')}</p>
      ) : !data ? (
        <p className="text-xs text-gray-400">{t('loading')}</p>
      ) : options.length === 0 && !value ? (
        <p className="text-xs text-red-600 flex items-start gap-1">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          {kind === 'hotel' ? t('noHotels', { tier: tierLabel, city }) : t('noShips', { tier: tierLabel })}
        </p>
      ) : (
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value || undefined)}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none text-sm bg-white ${chosenMissing ? 'border-red-400' : ''}`}
        >
          <option value="">{auto ? t('automatic', { name: describe(auto) }) : t('automaticNone')}</option>
          {options.map(o => (
            <option key={o.id} value={o.id}>{describe(o)}</option>
          ))}
          {chosenMissing && <option value={value}>{t('unavailable')}</option>}
        </select>
      )}

      {chosenMissing ? (
        <p className="text-xs text-red-600 mt-1">{kind === 'hotel' ? t('chosenMissingHotel', { city }) : t('chosenMissingShip')}</p>
      ) : data && options.length > 0 ? (
        <p className="text-[11px] text-gray-500 mt-1">
          {kind === 'hotel' ? t('wholeStayHotel', { city }) : t('wholeStayShip')}
        </p>
      ) : null}
    </div>
  )
}
