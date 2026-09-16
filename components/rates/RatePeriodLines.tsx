'use client'

// ============================================
// Every rate period of a hotel or ship, one line each
// ============================================
// The hotels and cruises lists used to show one set of numbers per row — the
// first period's EU-passport columns — without saying which period or which
// passport group they were, and the cruises list had "PP Double" and "Single
// supp." cells in each other's places (operator, 2026-09-16). A person reading
// the list could not check a rate against the contract.
//
// So each period is its own line, in date order, exactly as entered: its
// season word and name, its dates, then per person in a double, single
// supplement and triple reduction for EU and non-EU passports. A period with
// a blank double rate is flagged: a trip on those dates prices as No rate.

import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'
import { useVocabLabel } from '@/hooks/useVocabLabel'
import { periodTitle, seasonsForRow, type RateSeason, type RateSeasonEntity } from '@/lib/rates/rate-seasons'

type Suffix = 'eur' | 'non_eur'

export interface PeriodFigures {
  double: number
  singleSupp: number
  /** null = no triple offered (a cruise with no triple cabin). */
  tripleRed: number | null
}

/** A period's figures the way both forms enter them. Hotels store them
 *  directly; cruises store cabin rates (single/double/triple per person), so
 *  the supplement and reduction are the gaps to the double. Exported for the
 *  test that pins each cell to its stored value. */
export function periodFigures(entity: RateSeasonEntity, season: RateSeason, suffix: Suffix): PeriodFigures {
  const r = season.rates
  const n = (v: unknown) => Number(v) || 0
  if (entity === 'accommodation') {
    return {
      double: n(r[`pp_double_${suffix}`]),
      singleSupp: n(r[`single_supp_${suffix}`]),
      tripleRed: n(r[`triple_red_${suffix}`]),
    }
  }
  const double = n(r[`double_${suffix}`])
  const single = n(r[`single_${suffix}`])
  const triple = n(r[`triple_${suffix}`])
  return {
    double,
    singleSupp: single > 0 ? Math.max(0, single - double) : 0,
    tripleRed: triple > 0 ? Math.max(0, double - triple) : null,
  }
}

/** Passport groups whose per-person double is blank on this period. */
export function blankGroups(entity: RateSeasonEntity, season: RateSeason): Suffix[] {
  return (['eur', 'non_eur'] as const).filter(s => periodFigures(entity, season, s).double <= 0)
}

/** Every priced per-person double across every period and both passport
 *  groups, with the row's currency — what the lists' average card averages. */
export function pricedDoubles(
  rows: readonly object[],
  entity: RateSeasonEntity
): Array<{ amount: number; currency: unknown }> {
  return rows.flatMap(row => {
    const currency = (row as { rate_currency?: unknown }).rate_currency
    return seasonsForRow(row, entity).flatMap(season =>
      (['eur', 'non_eur'] as const)
        .map(suffix => periodFigures(entity, season, suffix).double)
        .filter(amount => amount > 0)
        .map(amount => ({ amount, currency }))
    )
  })
}

type Props = {
  row: object
  entity: RateSeasonEntity
  /** Formats an amount in the row's own rate currency. */
  format: (amount: number) => string
  /** Narrow card: the period's name and dates sit above its figures. */
  compact?: boolean
}

export default function RatePeriodLines({ row, entity, format, compact = false }: Props) {
  const t = useTranslations('rates.ratePeriods')
  const locale = useLocale()
  const seasonLabel = useVocabLabel('rate_season')
  const seasons = seasonsForRow(row, entity)

  if (seasons.length === 0) {
    return <span className="text-xs text-red-600">{t('noPeriods')}</span>
  }

  const date = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`)
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }

  const group = (season: RateSeason, suffix: Suffix) => {
    const f = periodFigures(entity, season, suffix)
    const blank = f.double <= 0
    return (
      <div className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="w-12 text-[11px] font-medium text-gray-500">{suffix === 'eur' ? t('eu') : t('nonEu')}</span>
        <span className={`w-20 text-right font-semibold ${blank ? 'text-red-600' : 'text-green-700'}`} title={t('dbl')}>
          {blank ? '—' : format(f.double)}
        </span>
        <span className="w-20 text-right text-blue-700" title={t('sgl')}>
          +{format(f.singleSupp)}
        </span>
        <span className="w-20 text-right text-purple-700" title={t('tpl')}>
          {f.tripleRed === null ? '—' : `−${format(f.tripleRed)}`}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2 text-xs" data-testid="rate-period-lines">
      {/* Column key, once per row. */}
      <div className={`flex items-baseline gap-2 ${compact ? '' : 'pl-[12.5rem]'} text-[10px] uppercase tracking-wide text-gray-400 whitespace-nowrap`}>
        <span className="w-12" />
        <span className="w-20 text-right">{t('dbl')}</span>
        <span className="w-20 text-right">{t('sgl')}</span>
        <span className="w-20 text-right">{t('tpl')}</span>
      </div>
      {seasons.map((season, i) => {
        const blanks = blankGroups(entity, season)
        return (
          <div key={`${season.from}-${i}`} className={`flex ${compact ? 'flex-col' : 'items-start'} gap-2 border-t border-gray-100 pt-1.5 first:border-0 first:pt-0`} data-testid="rate-period-line">
            <div className={compact ? '' : 'w-48 shrink-0'}>
              <p className="font-medium text-gray-900 truncate" title={periodTitle(season, k => seasonLabel(k, k), '')}>
                {periodTitle(season, k => seasonLabel(k, k), t('unnamed', { number: i + 1 }))}
              </p>
              <p className="text-[11px] text-gray-500 whitespace-nowrap">{date(season.from)} – {date(season.to)}</p>
              {blanks.length > 0 && (
                <p
                  className="mt-0.5 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                  title={t('missingRatesTitle', { groups: blanks.map(b => (b === 'eur' ? t('eu') : t('nonEu'))).join(', ') })}
                >
                  <AlertTriangle className="w-3 h-3" />
                  {t('missingRates')}
                </p>
              )}
            </div>
            <div className="space-y-0.5">
              {group(season, 'eur')}
              {group(season, 'non_eur')}
            </div>
          </div>
        )
      })}
    </div>
  )
}
