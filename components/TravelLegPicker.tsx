'use client'
// ============================================
// How does this day travel? Road / Flight / Day train / Sleeping train
// ============================================
// The missing primitive behind the Abu Simbel hole (NMS803): imported
// programme days carried no travel mode, so every city change priced as a
// road trip. This picker writes `transport_type` (+ `transport_rate_id`
// when several rows serve the route and the operator names THE train) onto
// the template day — the same JSONB ride the attraction ids take.
//
// Flight/day-train legs run FROM the previous day's city TO this day's
// city; a sleeping train boards tonight and wakes in the NEXT day's city.
// Flights price the economy cabin always (operator, 2026-09-04).

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plane, TrainFront, MoonStar, Car } from 'lucide-react'

export type TravelLegMode = 'ground' | 'flight' | 'train' | 'sleeping_train'

// Cairo's sleeper leaves from Giza — one city for route matching (mirrors
// the engine's STATION_CITY_ALIAS).
const ALIAS: Record<string, string> = { giza: 'cairo' }
const cityKey = (c: string | null | undefined): string => {
  const k = String(c ?? '').trim().toLowerCase()
  return ALIAS[k] ?? k
}

interface RowOption { id: string; label: string }

interface Props {
  mode?: string | null
  rateId?: string | null
  /** Previous day's city — origin for flight / day-train legs. */
  prevCity?: string | null
  /** This day's city. */
  city?: string | null
  /** Next day's city — where a sleeping train wakes up. */
  nextCity?: string | null
  onChange: (mode: TravelLegMode, rateId: string | undefined) => void
  disabled?: boolean
}

const MODE_META: Array<{ value: TravelLegMode; icon: typeof Car }> = [
  { value: 'ground', icon: Car },
  { value: 'flight', icon: Plane },
  { value: 'train', icon: TrainFront },
  { value: 'sleeping_train', icon: MoonStar },
]

const num = (v: unknown): number => Number(v) || 0

export default function TravelLegPicker({ mode, rateId, prevCity, city, nextCity, onChange, disabled }: Props) {
  const t = useTranslations('travelLeg')
  const currentMode: TravelLegMode =
    mode === 'flight' || mode === 'train' || mode === 'sleeping_train' ? mode : 'ground'
  const [rows, setRows] = useState<Record<string, RowOption[]> | null>(null)
  const [loading, setLoading] = useState(false)

  const from = currentMode === 'sleeping_train' ? city : prevCity
  const to = currentMode === 'sleeping_train' ? nextCity : city
  const routeKey = `${currentMode}|${cityKey(from)}|${cityKey(to)}`

  useEffect(() => {
    if (currentMode === 'ground' || !from || !to) return
    let dead = false
    setLoading(true)
    const load = async () => {
      try {
        const url =
          currentMode === 'flight' ? '/api/rates/flights?active_only=true'
          : currentMode === 'train' ? '/api/rates/trains?active_only=true'
          : '/api/rates/sleeping-trains?active_only=true'
        const res = await fetch(url)
        const json = await res.json()
        const all: Record<string, unknown>[] = json?.data ?? []
        let options: RowOption[]
        if (currentMode === 'flight') {
          options = all
            .filter(r => cityKey(r.route_from as string) === cityKey(from) && cityKey(r.route_to as string) === cityKey(to) && /econom/i.test(String(r.cabin_class ?? 'economy')))
            .map(r => ({ id: String(r.id), label: `${r.airline ?? 'Flight'} ${r.flight_number ?? ''} — ${num(r.base_rate_eur) + num(r.tax_eur)} ${r.rate_currency ?? ''}`.trim() }))
        } else if (currentMode === 'train') {
          options = all
            .filter(r => cityKey(r.origin_city as string) === cityKey(from) && cityKey(r.destination_city as string) === cityKey(to))
            .map(r => ({ id: String(r.id), label: `${r.operator_name ?? r.service_code} (${r.class_type ?? ''}) — ${num(r.rate_eur)} ${r.rate_currency ?? ''}`.trim() }))
        } else {
          // One option per TRAIN: its Half Twin row (the engine finds the
          // Single sibling itself).
          options = all
            .filter(r => cityKey(r.origin_city as string) === cityKey(from) && cityKey(r.destination_city as string) === cityKey(to) && /half/i.test(String(r.cabin_type ?? '')))
            .map(r => ({ id: String(r.id), label: `${r.operator_name ?? r.service_code} — Half Twin ${num(r.rate_oneway_eur)} ${r.rate_currency ?? ''}`.trim() }))
        }
        if (!dead) setRows(prev => ({ ...(prev ?? {}), [routeKey]: options }))
      } catch { /* candidates stay unknown; the engine's hole still reports */ }
      finally { if (!dead) setLoading(false) }
    }
    load()
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  const options = rows?.[routeKey]

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {MODE_META.map(({ value, icon: Icon }) => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value, undefined)}
            title={t(`mode.${value}`)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
              currentMode === value
                ? 'bg-[#647C47] text-white border-[#647C47]'
                : 'bg-white text-gray-600 border-gray-300 hover:border-[#647C47]'
            }`}
          >
            <Icon className="w-3 h-3" />
            {t(`mode.${value}`)}
          </button>
        ))}
      </div>

      {currentMode !== 'ground' && (
        !from || !to ? (
          <p className="text-[11px] text-amber-700">{t(currentMode === 'sleeping_train' ? 'needsNextCity' : 'needsPrevCity')}</p>
        ) : (
          <div className="text-[11px] text-gray-600">
            <span className="mr-2">{from} → {to}</span>
            {loading ? (
              <span className="text-gray-400">{t('loading')}</span>
            ) : options && options.length > 1 ? (
              <select
                value={rateId ?? ''}
                disabled={disabled}
                onChange={e => onChange(currentMode, e.target.value || undefined)}
                className={`px-1.5 py-0.5 border rounded text-[11px] bg-white ${rateId ? 'border-gray-300' : 'border-amber-400'}`}
              >
                <option value="">{t('pickOne', { count: options.length })}</option>
                {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            ) : options && options.length === 1 ? (
              <span className="text-[#4a5c35]">{t('auto')}: {options[0].label}</span>
            ) : options ? (
              <span className="text-red-600">{t('noRate')}</span>
            ) : null}
          </div>
        )
      )}
    </div>
  )
}
