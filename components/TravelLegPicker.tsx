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
//
// ROAD IS NOT ONE OF THE MODES. It is a toggle that sits beside at most one
// ticket: a flight day with road on is the flight AND both airport transfers,
// which is how the engine has always priced it — but the picker drew Road as
// the alternative to Flight, so a flying day looked like it had no road at all
// (operator, 2026-09-16). Road on a train day adds the station transfers.
// Road off on a day with no ticket means no road vehicle that day.
//
// A ticket leg may name its OWN route (From / To) when "yesterday's city →
// today's" is not the journey — the arrival-day connection Cairo → Luxor
// after an overnight flight, on a day filed under "Nile Cruise" (operator,
// 2026-09-17). A flight also says whether each airport gets assistance
// (lib/pricing/flight-leg).

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plane, TrainFront, MoonStar, Car } from 'lucide-react'
import { legAssistance, routeAirportCode, type LegAssist } from '@/lib/pricing/flight-leg'

export type TravelLegMode = 'ground' | 'flight' | 'train' | 'sleeping_train'

/** Road's value when the day does not say — mirrors the engine
 *  (ItineraryDay.road_transfers): on for road and flight days, off for trains. */
export function defaultRoadTransfers(mode: string | null | undefined): boolean {
  return !(mode === 'train' || mode === 'sleeping_train')
}

/** What to store: nothing when road is at the mode's default, so the default
 *  can still evolve; the explicit choice otherwise. */
export function storedRoadTransfers(mode: string | null | undefined, road: boolean): boolean | undefined {
  return road === defaultRoadTransfers(mode) ? undefined : road
}

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
  /** The day's road_transfers; absent = the mode's default. */
  road?: boolean | null
  /** Previous day's city — origin for flight / day-train legs. */
  prevCity?: string | null
  /** This day's city. */
  city?: string | null
  /** Next day's city — where a sleeping train wakes up. */
  nextCity?: string | null
  /** road: the effective road choice after this change. */
  onChange: (mode: TravelLegMode, rateId: string | undefined, road: boolean) => void
  /** The leg's own route, when the day names one. */
  legFrom?: string | null
  legTo?: string | null
  legAssist?: LegAssist | null
  /** The first day in the destination: a flight's assistance defaults on. */
  isArrivalDay?: boolean
  /** Route or assistance changed; undefined clears a field back to its default. */
  onLegChange?: (patch: { leg_from?: string; leg_to?: string; leg_assist?: LegAssist }) => void
  disabled?: boolean
}

const TICKET_META: Array<{ value: Exclude<TravelLegMode, 'ground'>; icon: typeof Car }> = [
  { value: 'flight', icon: Plane },
  { value: 'train', icon: TrainFront },
  { value: 'sleeping_train', icon: MoonStar },
]

const num = (v: unknown): number => Number(v) || 0

export default function TravelLegPicker({ mode, rateId, road, prevCity, city, nextCity, onChange, legFrom, legTo, legAssist, isArrivalDay = false, onLegChange, disabled }: Props) {
  const t = useTranslations('travelLeg')
  const currentMode: TravelLegMode =
    mode === 'flight' || mode === 'train' || mode === 'sleeping_train' ? mode : 'ground'
  const roadOn = typeof road === 'boolean' ? road : defaultRoadTransfers(currentMode)
  const [rows, setRows] = useState<Record<string, RowOption[]> | null>(null)
  const [loading, setLoading] = useState(false)

  const defaultFrom = currentMode === 'sleeping_train' ? city : prevCity
  const defaultTo = currentMode === 'sleeping_train' ? nextCity : city
  const from = legFrom || defaultFrom
  const to = legTo || defaultTo
  const assist = legAssistance(legAssist ?? undefined, isArrivalDay)
  const setAssist = (end: 'from' | 'to', on: boolean) => {
    const next: LegAssist = { ...(legAssist ?? {}) }
    // Store only a departure from the day's default.
    if (on === legAssistance(undefined, isArrivalDay)[end]) delete next[end]
    else next[end] = on
    onLegChange?.({ leg_assist: Object.keys(next).length ? next : undefined })
  }
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
      <div className="flex flex-wrap gap-1">
        {/* Road: a toggle, combinable with a ticket. */}
        <button
          type="button"
          disabled={disabled}
          aria-pressed={roadOn}
          onClick={() => onChange(currentMode, rateId ?? undefined, !roadOn)}
          title={t('mode.ground')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
            roadOn
              ? 'bg-[#647C47] text-white border-[#647C47]'
              : 'bg-white text-gray-600 border-gray-300 hover:border-[#647C47]'
          }`}
        >
          <Car className="w-3 h-3" />
          {t('mode.ground')}
        </button>
        {/* At most one ticket. Clicking the chosen one again removes it; a
            new ticket starts from its own road default. */}
        {TICKET_META.map(({ value, icon: Icon }) => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-pressed={currentMode === value}
            onClick={() => currentMode === value
              ? onChange('ground', undefined, defaultRoadTransfers('ground'))
              : onChange(value, undefined, defaultRoadTransfers(value))}
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
      {/* What the combination prices, in words. */}
      <p className={`text-[11px] ${!roadOn && currentMode === 'ground' ? 'text-amber-700' : 'text-gray-500'}`}>
        {t(`combo.${currentMode}.${roadOn ? 'withRoad' : 'withoutRoad'}`)}
      </p>

      {currentMode !== 'ground' && onLegChange && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
          <span>{t('route')}</span>
          <input
            value={legFrom ?? ''}
            placeholder={defaultFrom || t('from')}
            disabled={disabled}
            onChange={e => onLegChange({ leg_from: e.target.value || undefined })}
            aria-label={t('from')}
            className={`w-28 px-1.5 py-0.5 border rounded ${from ? 'border-gray-300' : 'border-amber-400'}`}
          />
          <span>→</span>
          <input
            value={legTo ?? ''}
            placeholder={defaultTo || t('to')}
            disabled={disabled}
            onChange={e => onLegChange({ leg_to: e.target.value || undefined })}
            aria-label={t('to')}
            className={`w-28 px-1.5 py-0.5 border rounded ${to ? 'border-gray-300' : 'border-amber-400'}`}
          />
        </div>
      )}

      {currentMode === 'flight' && onLegChange && from && to && (
        <div className="flex flex-wrap gap-3 text-[11px] text-gray-600" data-testid="leg-assist">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={assist.from} disabled={disabled} onChange={e => setAssist('from', e.target.checked)} />
            {isArrivalDay
              ? t('assistArrivalMeet', { airport: routeAirportCode(from) ?? from })
              : t('assistDeparture', { airport: routeAirportCode(from) ?? from })}
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={assist.to} disabled={disabled} onChange={e => setAssist('to', e.target.checked)} />
            {t('assistArrival', { airport: routeAirportCode(to) ?? to })}
          </label>
        </div>
      )}

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
                onChange={e => onChange(currentMode, e.target.value || undefined, roadOn)}
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
