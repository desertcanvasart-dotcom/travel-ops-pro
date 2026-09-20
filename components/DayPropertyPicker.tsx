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
//
// Since 2026-09-20 the list is NOT limited to the tier being priced. A named
// property prices whatever its own tier says (lib/auto-pricing-service,
// chosenRowDifference), because a destination may have nothing at the tier
// sold — Abu Simbel has no luxury hotel, every ship on file is standard. The
// tier's own properties are still offered first, and the automatic pick is
// still the tier's; the rest are grouped under "Other tiers" and labelled
// with theirs, so choosing one is a visible decision rather than an
// accident.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Building2, Ship } from 'lucide-react'
import { ANY_TIER } from '@/lib/pricing/property-choice'
import type { AccommodationOption } from '@/app/api/b2b/accommodation-options/route'

type Loaded = { options: AccommodationOption[]; autoId: string | null }

// One request per kind/city/tier for the page's life: every night of a stay
// asks the same question.
const cache = new Map<string, Promise<Loaded>>()

function load(kind: 'hotel' | 'cruise', tier: string, city: string, embark: string | null, nights: number | null): Promise<Loaded> {
  const qs = new URLSearchParams({ kind, tier })
  if (kind === 'hotel') qs.set('city', city)
  else {
    if (embark) qs.set('embark', embark)
    if (nights) qs.set('nights', String(nights))
  }
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
  /** The programme's nights aboard — a sailing that long is the automatic pick. */
  nights?: number | null
  tier: string
  tierLabel: string
  /** The chosen rate row id; undefined = automatic. */
  value: string | undefined
  onChange: (id: string | undefined) => void
  /** The property that will actually be used (chosen or automatic), for the
   *  supplements picker. null = none available. */
  onResolved?: (option: AccommodationOption | null) => void
}

export default function DayPropertyPicker({ kind, city, embark = null, nights = null, tier, tierLabel, value, onChange, onResolved }: Props) {
  const t = useTranslations('b2bCalculator.property')
  const [data, setData] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)

  const [others, setOthers] = useState<AccommodationOption[]>([])

  useEffect(() => {
    let live = true
    setData(null)
    setOthers([])
    setFailed(false)
    // Until the new list is in, the property in use is unknown: say so, so
    // the supplements picker never filters by the previous city's hotel
    // (Greptile on #453).
    onResolved?.(null)
    if (kind === 'hotel' && !city) return
    // The tier's list decides the AUTOMATIC pick and stays first. The
    // all-tiers list only widens what can be named.
    const mine = tier === ANY_TIER ? Promise.resolve({ options: [], autoId: null }) : load(kind, tier, city, embark, nights)
    const all = load(kind, ANY_TIER, city, embark, nights)
    Promise.all([mine, all])
      .then(([m, a]) => {
        if (!live) return
        const ownIds = new Set(m.options.map(o => o.id))
        setData(tier === ANY_TIER ? a : m)
        setOthers(tier === ANY_TIER ? [] : a.options.filter(o => !ownIds.has(o.id)))
      })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
    // onResolved is a fresh closure each render; the query is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, city, embark, nights, tier])

  const options = data?.options ?? []
  const auto = options.find(o => o.id === data?.autoId) ?? null
  const everything = [...options, ...others]
  const chosen = value ? everything.find(o => o.id === value) ?? null : null
  // A choice in NO list at all: switched off or deleted. Another tier's row
  // is no longer missing — it is offered below, and the engine prices it.
  const chosenMissing = Boolean(value && data && !chosen)
  const inUse = value ? chosen : auto

  useEffect(() => {
    if (data) onResolved?.(inUse)
    // onResolved is a fresh closure each render; the id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, inUse?.id])

  const allTiers = tier === ANY_TIER
  const Icon = kind === 'hotel' ? Building2 : Ship
  const describe = (o: AccommodationOption) =>
    kind === 'cruise'
      ? [o.name, o.route, o.nights ? t('nights', { count: o.nights }) : null].filter(Boolean).join(' · ')
      : o.name

  return (
    <div data-testid="day-property">
      <label className="block text-xs font-medium text-gray-600 mb-1">
        <Icon className="w-3 h-3 inline mr-1" />
        {allTiers
          ? (kind === 'hotel' ? t('allTiersLabelHotel') : t('allTiersLabelShip'))
          : (kind === 'hotel' ? t('hotelLabel', { tier: tierLabel }) : t('shipLabel', { tier: tierLabel }))}
      </label>

      {failed ? (
        <p className="text-xs text-red-600">{t('loadFailed')}</p>
      ) : !data ? (
        <p className="text-xs text-gray-400">{t('loading')}</p>
      ) : everything.length === 0 && !value ? (
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
            <option key={o.id} value={o.id}>
              {allTiers
                ? (o.tier ? t('atTier', { name: describe(o), tier: o.tier }) : t('atNoTier', { name: describe(o) }))
                : describe(o)}
            </option>
          ))}
          {others.length > 0 && (
            <optgroup label={t('otherTiers')}>
              {others.map(o => (
                <option key={o.id} value={o.id}>
                  {o.tier ? t('atTier', { name: describe(o), tier: o.tier }) : t('atNoTier', { name: describe(o) })}
                </option>
              ))}
            </optgroup>
          )}
          {chosenMissing && <option value={value}>{t('unavailable')}</option>}
        </select>
      )}

      {chosenMissing ? (
        <p className="text-xs text-red-600 mt-1">{kind === 'hotel' ? t('chosenMissingHotel', { city }) : t('chosenMissingShip')}</p>
      ) : data && everything.length > 0 ? (
        <p className="text-[11px] text-gray-500 mt-1">
          {kind === 'hotel' ? t('wholeStayHotel', { city }) : t('wholeStayShip')}
          {allTiers ? ` ${t('allTiersHint')}` : ''}
        </p>
      ) : null}
    </div>
  )
}
