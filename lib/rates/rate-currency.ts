// ============================================
// Per-rate currency — normalise at the fetch boundary
// ============================================
// A rate row may be entered in a different currency than the organisation's
// rate currency (migrations/20260827_rate_currency.sql): accounting records
// Egyptian land services in EGP and Japan-purchased flights in JPY beside
// USD-contracted hotels. The pricing engines, margin arithmetic and totals
// all assume ONE run currency — and that assumption is load-bearing, so it
// stays. Instead, every fetched rate row is normalised HERE, immediately
// after it leaves the database: a row whose rate_currency differs from the
// run currency gets its monetary columns converted on a COPY. Downstream
// code sees one currency, exactly as before; the stored row is never
// rewritten. A row with rate_currency NULL (every pre-migration row) passes
// through untouched, which is what makes this change behaviour-identical
// until somebody actually sets a currency.
//
// POLICY, mirroring lib/fx-conversion.ts: a conversion that cannot be backed
// by a rate is never guessed. When no rate exists for the pair, the row's
// monetary columns become NULL — which the engines already treat as "rate
// missing", producing their existing holes/warnings — and the miss is
// reported to the caller. A silently unconverted EGP number would be wrong
// by ~50x, which is precisely the failure this file exists to prevent.
//
// The per-table monetary column lists were read from PRODUCTION rows and the
// bulk-sheet configs on 2026-08-27, not inferred from names: percentages,
// capacities and durations are deliberately absent.

import { getExchangeRate, type ExchangeRates } from '@/lib/currency-service'
import { fetchRunExchangeRates } from '@/lib/rates/fx-source'
import { roundToCurrency } from '@/lib/currency-totals'
import { normaliseRateCurrency } from '@/lib/org-rate-currency'

/** Tables that carry a rate_currency column, → their monetary columns. */
export const RATE_MONETARY_COLUMNS = {
  transportation_rates: [
    'base_rate_eur', 'base_rate_non_eur',
    'sedan_rate_eur', 'sedan_rate_non_eur',
    'minivan_rate_eur', 'minivan_rate_non_eur',
    'van_rate_eur', 'van_rate_non_eur',
    'minibus_rate_eur', 'minibus_rate_non_eur',
    'bus_rate_eur', 'bus_rate_non_eur',
  ],
  guide_rates: ['base_rate_eur', 'base_rate_non_eur'],
  meal_rates: ['base_rate_eur', 'base_rate_non_eur'],
  // Discount percentages on entrance_fees are ratios, not money.
  entrance_fees: ['eur_rate', 'non_eur_rate', 'egyptian_rate'],
  activity_rates: ['base_rate_eur', 'base_rate_non_eur'],
  tipping_rates: ['rate_eur'],
  airport_staff_rates: ['rate_eur'],
  hotel_staff_rates: ['rate_eur'],
  flight_rates: ['base_rate_eur', 'base_rate_non_eur', 'tax_eur', 'tax_non_eur'],
  train_rates: ['rate_eur'],
  sleeping_train_rates: ['rate_oneway_eur', 'rate_roundtrip_eur'],
  fixed_daily_costs: ['cost_per_person_per_day'],
  // The deferred three (migration 20260827_rate_currency_hotels_cruises).
  // Hotels and cruises price from dated periods in `seasons` — handled like
  // activity tiers below — with these flat columns as the no-period fallback
  // the engine actually reads (resolveHotel/CruiseRatesForDate).
  accommodation_rates: [
    'pp_double_eur', 'single_supp_eur', 'triple_red_eur',
    'pp_double_non_eur', 'single_supp_non_eur', 'triple_red_non_eur',
  ],
  nile_cruises: [
    'rate_low_single_eur', 'rate_low_double_eur', 'rate_low_triple_eur', 'rate_low_suite_eur',
    'rate_low_single_non_eur', 'rate_low_double_non_eur', 'rate_low_triple_non_eur', 'rate_low_suite_non_eur',
    'rate_single_eur', 'rate_double_eur', 'rate_triple_eur', 'rate_suite_eur',
  ],
  b2b_transport_packages: ['sedan_rate', 'minivan_rate', 'van_rate', 'minibus_rate', 'bus_rate'],
} as const

export type RateCurrencyTable = keyof typeof RATE_MONETARY_COLUMNS

/** A conversion that could not be made — the row was neutralised instead. */
export interface RateCurrencyMiss {
  table: RateCurrencyTable
  id: string | number | null
  currency: string
}

export interface RateNormalizer {
  /**
   * Normalise fetched rate rows to the run currency. Rows without a (known)
   * rate_currency, or already in the run currency, come back UNCHANGED — the
   * same array instance, so the no-currencies-set case costs nothing and is
   * provably identical to the pre-migration engine. Rows needing conversion
   * are shallow-copied; activity_rates additionally get their `tiers` bands
   * converted (lib/rates/activity-tiers.ts shape).
   */
  normalize<T extends Record<string, unknown>>(table: RateCurrencyTable, rows: T[] | null | undefined): Promise<T[] | null | undefined>
  /** Every row neutralised because no FX rate could back its conversion. */
  readonly misses: RateCurrencyMiss[]
}

/**
 * One normalizer per pricing run. FX rates are fetched lazily, once, and only
 * if some row actually carries a differing currency — so a database where
 * nobody has set rate_currency yet never makes an FX call it didn't before.
 */
export function createRateNormalizer(runCurrency: string, deps?: {
  /** Test seam; defaults to the live currency service. */
  getRates?: () => Promise<ExchangeRates>
}): RateNormalizer {
  const run = normaliseRateCurrency(runCurrency) ?? 'EUR'
  const misses: RateCurrencyMiss[] = []
  let ratesPromise: Promise<ExchangeRates | null> | null = null

  const loadRates = () => {
    if (!ratesPromise) {
      // The org's own exchange_rates table merged over the external API —
      // the API alone is ECB rates, which do not include EGP, and treating
      // the operator's first real EGP entrance fees as missing is how this
      // line earned its comment (lib/rates/fx-source.ts).
      ratesPromise = (deps?.getRates ?? fetchRunExchangeRates)().catch(err => {
        console.warn('[rate-currency] FX fetch failed — differing-currency rates will be treated as missing:', err instanceof Error ? err.message : String(err))
        return null
      })
    }
    return ratesPromise
  }

  const convertValue = (value: unknown, factor: number): unknown => {
    // Blank stays blank: an unpriced hole must not become a number, and
    // 0-vs-blank semantics (see unpriced-rates work) must survive conversion.
    if (value === null || value === undefined || value === '') return value
    const n = Number(value)
    if (!Number.isFinite(n)) return value
    return roundToCurrency(n * factor, run)
  }

  const neutralise = <T extends Record<string, unknown>>(table: RateCurrencyTable, row: T): T => {
    const copy: Record<string, unknown> = { ...row }
    for (const col of RATE_MONETARY_COLUMNS[table]) copy[col] = null
    if (table === 'activity_rates') copy.tiers = null
    if (table === 'accommodation_rates' || table === 'nile_cruises') copy.seasons = null
    misses.push({ table, id: (row.id as string | number | undefined) ?? null, currency: String(row.rate_currency) })
    return copy as T
  }

  const convertRow = <T extends Record<string, unknown>>(table: RateCurrencyTable, row: T, factor: number): T => {
    const copy: Record<string, unknown> = { ...row }
    for (const col of RATE_MONETARY_COLUMNS[table]) {
      if (col in copy) copy[col] = convertValue(copy[col], factor)
    }
    if ((table === 'accommodation_rates' || table === 'nile_cruises') && Array.isArray(copy.seasons)) {
      // Every value in a period's rates object is monetary by construction
      // (lib/rates/rate-seasons RATE_FIELDS), so convert them all.
      copy.seasons = copy.seasons.map(season =>
        season && typeof season === 'object' && (season as Record<string, unknown>).rates && typeof (season as Record<string, unknown>).rates === 'object'
          ? {
              ...season,
              rates: Object.fromEntries(
                Object.entries((season as { rates: Record<string, unknown> }).rates)
                  .map(([k, v]) => [k, convertValue(v, factor)])
              ),
            }
          : season
      )
    }
    if (table === 'activity_rates' && Array.isArray(copy.tiers)) {
      copy.tiers = copy.tiers.map(t =>
        t && typeof t === 'object'
          ? { ...t, rate_eur: convertValue((t as Record<string, unknown>).rate_eur, factor), rate_non_eur: convertValue((t as Record<string, unknown>).rate_non_eur, factor) }
          : t
      )
    }
    return copy as T
  }

  // A rate_currency that is PRESENT but not in the vocabulary. It cannot be
  // converted and it must not pass through raw — a row marked 'XXX' whose
  // 1000 lands in a USD sum as $1000 is precisely the failure this module
  // exists to prevent. Distinct from null/absent, which genuinely means
  // "the org rate currency".
  const unknownCurrency = (row: Record<string, unknown>): boolean => {
    const v = row?.rate_currency
    return v != null && String(v).trim() !== '' && normaliseRateCurrency(v) === null
  }

  return {
    misses,
    async normalize(table, rows) {
      if (!rows || rows.length === 0) return rows
      // Fast path: nothing to convert → the very same array back.
      const needs = rows.some(r => {
        const cur = normaliseRateCurrency(r?.rate_currency)
        return (cur !== null && cur !== run) || unknownCurrency(r)
      })
      if (!needs) return rows

      const rates = await loadRates()
      return rows.map(row => {
        if (unknownCurrency(row)) return neutralise(table, row)
        const cur = normaliseRateCurrency(row?.rate_currency)
        if (cur === null || cur === run) return row
        const factor = rates ? getExchangeRate(cur, run, rates) : null
        if (!factor || !Number.isFinite(factor) || factor <= 0) return neutralise(table, row)
        return convertRow(table, row, factor)
      })
    },
  }
}
