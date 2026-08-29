// ============================================
// Which exchange rates back a pricing run
// ============================================
// The rate normalizer used to ask ONLY the external API (Frankfurter = ECB
// reference rates). The ECB does not publish EGP — so the moment the
// operator entered their first real entrance fees in Egyptian pounds, every
// one of them was "no exchange rate available — treated as missing" and
// vanished from pricing, while the app's OWN exchange_rates table sat there
// holding a fresh EUR↔EGP rate from the nightly refresh job.
//
// The app's table is the org's curated source (refresh-exchange-rates
// upserts it daily; the operator can see it) — so it WINS. The external API
// fills pairs the table does not carry. Everything is folded into one
// EUR-based map, which getExchangeRate() cross-rates through, so any
// currency present on either side resolves against any other.
//
// Supabase is imported LAZILY inside the function — a module a client
// bundle can reach must not drag a service-role client into every importer
// (the lib/org-identity lesson).

import { fetchExchangeRates, type ExchangeRates } from '@/lib/currency-service'

interface FxRow {
  base_currency: string
  target_currency: string
  rate: number | string
}

/** exchange_rates rows → EUR-based map. Rows are EUR-based plus inverses;
 *  both spellings of the same fact are folded to EUR→X. */
export function dbRowsToEurRates(rows: FxRow[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = { EUR: 1 }
  for (const r of rows ?? []) {
    const rate = Number(r.rate)
    if (!Number.isFinite(rate) || rate <= 0) continue
    if (r.base_currency === 'EUR') out[r.target_currency] = rate
    else if (r.target_currency === 'EUR' && !(r.base_currency in out)) out[r.base_currency] = 1 / rate
  }
  return out
}

/** The API's answer folded UNDER the table's: DB values win per currency. */
export function mergeEurRates(
  db: Record<string, number>,
  api: ExchangeRates | null
): ExchangeRates {
  const rates: Record<string, number> = {}
  if (api) {
    // Re-base the API map to EUR whatever base it was fetched with.
    const eurInApiBase = api.rates['EUR']
    if (api.base === 'EUR') Object.assign(rates, api.rates)
    else if (eurInApiBase) {
      for (const [cur, val] of Object.entries(api.rates)) rates[cur] = val / eurInApiBase
    }
  }
  Object.assign(rates, db) // the org's own table wins
  rates.EUR = 1
  return { base: 'EUR', date: new Date().toISOString().split('T')[0], rates }
}

/**
 * The rates a pricing run should use: the org's exchange_rates table merged
 * over the external API. Never throws — a run with no FX at all degrades to
 * the normalizer's existing treated-as-missing behaviour.
 */
export async function fetchRunExchangeRates(): Promise<ExchangeRates> {
  let db: Record<string, number> = { EUR: 1 }
  try {
    const { createServerClient } = await import('@/lib/supabase-server')
    const { data } = await createServerClient()
      .from('exchange_rates')
      .select('base_currency, target_currency, rate')
      .eq('is_active', true)
    db = dbRowsToEurRates(data as FxRow[] | null)
  } catch {
    // No request context / no database — the API alone is better than nothing.
  }
  let api: ExchangeRates | null = null
  try {
    api = await fetchExchangeRates('EUR')
  } catch {
    /* fetchExchangeRates has its own fallback; a throw here means even that failed */
  }
  return mergeEurRates(db, api)
}
