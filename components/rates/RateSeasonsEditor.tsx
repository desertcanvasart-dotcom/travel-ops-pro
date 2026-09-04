'use client'

// ============================================
// Dated rate periods for a hotel or a Nile cruise
// ============================================
// Both catalogs used to offer exactly three price levels across four fixed
// date boxes. Contracts are not written that way: the operator reports six or
// more dated periods, and how many there are depends on the property. A hotel
// that prices April, May–September, October–19 December, Christmas/New Year
// and 6 January–March has five periods and five different rates, and the last
// two had nowhere to go.
//
// So the periods are a list: add one, give it dates, give it its rates. The
// same component serves both catalogs — only the rate fields differ.
// ============================================

import { useTranslations } from 'next-intl'
import { CalendarPlus, Copy, Trash2, AlertTriangle } from 'lucide-react'
import {
  overlappingSeasons,
  seasonGaps,
  RATE_FIELDS,
  type RateSeason,
  type RateSeasonEntity,
} from '@/lib/rates/rate-seasons'

/** Rate rows as the form shows them: EUR block, then non-EUR block. */
const FIELD_GROUPS: Record<RateSeasonEntity, Array<{ suffix: 'eur' | 'non_eur'; fields: string[] }>> = {
  accommodation: [
    { suffix: 'eur', fields: ['pp_double_eur', 'single_supp_eur', 'triple_red_eur'] },
    { suffix: 'non_eur', fields: ['pp_double_non_eur', 'single_supp_non_eur', 'triple_red_non_eur'] },
  ],
  // Cruises are ENTERED the hotel way — per person in double, single
  // supplement, triple reduction — and STORED as the cabin rates the engine
  // reads (single/double/triple/suite per person per night). The two virtual
  // fields below convert on the way in and out (operator decision,
  // 2026-09-02: "align it with hotels, keep it per night").
  cruise: [
    { suffix: 'eur', fields: ['double_eur', 'single_supp_eur', 'triple_red_eur', 'suite_eur'] },
    { suffix: 'non_eur', fields: ['double_non_eur', 'single_supp_non_eur', 'triple_red_non_eur', 'suite_non_eur'] },
  ],
}

/** Cruise virtual fields → the stored cabin rate they are derived from. */
const CRUISE_VIRTUAL: Record<string, { base: string; stored: string; sign: 1 | -1 }> = {
  single_supp_eur: { base: 'double_eur', stored: 'single_eur', sign: 1 },
  single_supp_non_eur: { base: 'double_non_eur', stored: 'single_non_eur', sign: 1 },
  triple_red_eur: { base: 'double_eur', stored: 'triple_eur', sign: -1 },
  triple_red_non_eur: { base: 'double_non_eur', stored: 'triple_non_eur', sign: -1 },
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** What the form shows for a field: stored value, or the derived supplement/reduction. */
function displayValue(entity: RateSeasonEntity, rates: Record<string, number>, field: string): number {
  const v = entity === 'cruise' ? CRUISE_VIRTUAL[field] : undefined
  if (!v) return rates[field] ?? 0
  const base = Number(rates[v.base]) || 0
  const stored = Number(rates[v.stored]) || 0
  // A triple rate of 0 means "no triple cabin": show no reduction rather than
  // a reduction equal to the whole double rate.
  if (v.sign === -1 && stored <= 0) return 0
  return r2((stored - base) * v.sign)
}

/** Write a shown value back into the stored cabin rates. */
function storeValue(entity: RateSeasonEntity, rates: Record<string, number>, field: string, value: number): Record<string, number> {
  const v = entity === 'cruise' ? CRUISE_VIRTUAL[field] : undefined
  if (!v) {
    const next = { ...rates, [field]: value }
    // Changing the double moves single and triple with it so the supplement
    // and reduction the operator typed stay what they typed.
    if (entity === 'cruise' && /^double_/.test(field)) {
      for (const [virt, def] of Object.entries(CRUISE_VIRTUAL)) {
        if (def.base !== field) continue
        const shown = displayValue(entity, rates, virt)
        next[def.stored] = def.sign === -1 && (Number(rates[def.stored]) || 0) <= 0 ? 0 : r2(value + shown * def.sign)
      }
    }
    return next
  }
  const base = Number(rates[v.base]) || 0
  return { ...rates, [v.stored]: r2(base + value * v.sign) }
}

const emptyRates = (entity: RateSeasonEntity): Record<string, number> =>
  Object.fromEntries(RATE_FIELDS[entity].map(f => [f, 0]))

type Props = {
  entity: RateSeasonEntity
  seasons: RateSeason[]
  onChange: (seasons: RateSeason[]) => void
  /** Symbol for the currency the rate tables are kept in (organizations.rate_currency). */
  currency?: string
  disabled?: boolean
}

export default function RateSeasonsEditor({
  entity, seasons, onChange, currency = '', disabled = false,
}: Props) {
  const t = useTranslations('rates.ratePeriods')

  // A cruise period is entered the hotel way, so its base rate reads
  // "PP Dbl" like a hotel's, not the cabin word the column is stored under.
  const fieldLabel = (field: string): string => {
    const base = field.replace(/_non_eur$|_eur$/, '')
    return t(`fields.${entity === 'cruise' && base === 'double' ? 'pp_double' : base}`)
  }

  const update = (index: number, patch: Partial<RateSeason>) =>
    onChange(seasons.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  const updateRate = (index: number, field: string, raw: string) =>
    update(index, {
      rates: storeValue(entity, seasons[index].rates, field, raw === '' ? 0 : Number(raw)),
    })

  const addPeriod = () => {
    // A new period starts the day after the last one ends, which is how a
    // contract reads and saves the operator re-typing a date they just typed.
    const last = seasons[seasons.length - 1]
    const start = last?.to ? addDays(last.to, 1) : ''
    onChange([...seasons, { name: '', from: start, to: '', rates: emptyRates(entity) }])
  }

  const duplicatePeriod = (index: number) => {
    // Copies the rates, not the dates: the common case is two windows at the
    // same price, and the dates are the part that must differ.
    const source = seasons[index]
    const next = [...seasons]
    next.splice(index + 1, 0, {
      name: '', from: '', to: '', rates: { ...source.rates },
    })
    onChange(next)
  }

  const removePeriod = (index: number) => onChange(seasons.filter((_, i) => i !== index))

  const complete = seasons.filter(s => s.from && s.to && s.to >= s.from)
  const overlaps = overlappingSeasons(complete)
  const gaps = seasonGaps(complete)
  const backwards = seasons
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.from && s.to && s.to < s.from)

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      {/* No title here — the page supplies its own numbered section heading,
          and two headings reading "Rate periods" one above the other is just
          noise. */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <p className="text-xs text-gray-500">{t('help')}</p>
        <span className="text-xs text-gray-500 shrink-0">
          {t('count', { count: seasons.length })}
        </span>
      </div>

      {seasons.length === 0 && (
        <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-4 text-center mb-3">
          {t('empty')}
        </p>
      )}

      <div className="space-y-3">
        {seasons.map((season, index) => (
          <div key={index} data-testid="rate-period" className="border border-gray-200 rounded-lg p-3 bg-gray-50">
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div className="flex-1 min-w-[10rem]">
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('periodName')}</label>
                <input
                  type="text"
                  value={season.name}
                  disabled={disabled}
                  placeholder={t('periodNamePlaceholder')}
                  onChange={e => update(index, { name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('from')}</label>
                <input
                  type="date"
                  value={season.from}
                  disabled={disabled}
                  onChange={e => update(index, { from: e.target.value })}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('to')}</label>
                <input
                  type="date"
                  value={season.to}
                  disabled={disabled}
                  min={season.from || undefined}
                  onChange={e => update(index, { to: e.target.value })}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47]"
                />
              </div>
              <div className="flex items-center gap-1 pb-1">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => duplicatePeriod(index)}
                  title={t('duplicate')}
                  aria-label={t('duplicate')}
                  className="p-2 text-gray-500 hover:text-[#647C47] hover:bg-white rounded-lg disabled:opacity-50"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removePeriod(index)}
                  title={t('remove')}
                  aria-label={t('remove')}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-white rounded-lg disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {FIELD_GROUPS[entity].map(group => (
              <div key={group.suffix} className="mb-2 last:mb-0">
                <p className="text-xs font-medium text-gray-600 mb-1">
                  {group.suffix === 'eur' ? t('eurPassportHolders') : t('nonEurPassportHolders')}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {group.fields.map(field => (
                    <div key={field}>
                      <label className="block text-[11px] text-gray-500 mb-1">{fieldLabel(field)}</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={disabled}
                        value={displayValue(entity, season.rates, field)}
                        onChange={e => updateRate(index, field, e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* The property's special rate for a throughout guide travelling
                with the group ("+1"). One number — no passport split, the
                guide is Egyptian either way. Blank prices as a hole. */}
            <div className="mb-2 last:mb-0">
              <p className="text-xs font-medium text-gray-600 mb-1">{t('throughoutGuide')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{t('fields.guide_rate')}</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={disabled}
                    value={season.rates.guide_rate ?? 0}
                    onChange={e => updateRate(index, 'guide_rate', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addPeriod}
        disabled={disabled}
        className="mt-3 inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#647C47] border border-[#647C47] rounded-lg hover:bg-[#647C47] hover:text-white disabled:opacity-50"
      >
        <CalendarPlus className="w-4 h-4" />
        {t('addPeriod')}
      </button>

      {/* Nothing here blocks a save. Overlap is legitimate — a Christmas window
          inside a broad high season — and a gap may be a period the operator
          has not typed yet. They are shown because they are also exactly what
          a mistyped year looks like. */}
      {(backwards.length > 0 || overlaps.length > 0 || gaps.length > 0) && (
        <div className="mt-3 space-y-1">
          {backwards.map(({ i }) => (
            <p key={`b${i}`} className="text-xs text-red-600 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              {t('backwards', { period: periodLabel(seasons[i], i, t) })}
            </p>
          ))}
          {overlaps.map(([a, b]) => (
            <p key={`o${a}-${b}`} className="text-xs text-amber-700 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              {t('overlap', {
                first: periodLabel(complete[a], a, t),
                second: periodLabel(complete[b], b, t),
              })}
            </p>
          ))}
          {gaps.map(gap => (
            <p key={`g${gap.from}`} className="text-xs text-amber-700 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              {t('gap', { from: gap.from, to: gap.to })}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

const periodLabel = (
  season: RateSeason | undefined,
  index: number,
  t: (key: string, values?: Record<string, string | number>) => string,
) =>
  season?.name?.trim() || t('unnamed', { number: index + 1 })

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
