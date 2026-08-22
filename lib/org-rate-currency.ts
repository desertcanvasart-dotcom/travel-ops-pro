// ============================================
// Which currency an org's supplier rates are in
// ============================================
// The rate tables store plain numbers in *_eur columns; until 2026-08-22 the
// engine stamped its output 'EUR' unconditionally. A.T.S enters its rates in
// USD (buys hotels/cruises in dollars, EGP purchases as dollar equivalents)
// and bills in JPY. `organizations.rate_currency` names the rate currency;
// this resolves it with the engine's historical default when there is no org
// or the column is unset, so nothing that was EUR changes by accident.
// ============================================

export const DEFAULT_RATE_CURRENCY = 'EUR'
export const RATE_CURRENCIES = ['USD', 'EUR', 'GBP', 'EGP', 'JPY'] as const
export type RateCurrency = (typeof RATE_CURRENCIES)[number]

/** Anything with a Supabase-style `.from()`. Kept deliberately loose: the
 *  typed client's generics make a structural match "excessively deep" for tsc. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrgReader = { from(table: string): any }

/** Normalise to one of the five supported codes, else null. */
export function normaliseRateCurrency(value: unknown): RateCurrency | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return (RATE_CURRENCIES as readonly string[]).includes(code) ? (code as RateCurrency) : null
}

/**
 * The org's rate currency, or EUR. Never throws: a read failure logs and
 * falls back, because pricing must not stop over a settings lookup — and the
 * fallback is exactly what every org had before the setting existed.
 */
export async function getOrgRateCurrency(db: OrgReader, orgId: string | null | undefined): Promise<RateCurrency> {
  if (!orgId) return DEFAULT_RATE_CURRENCY
  try {
    const { data, error } = await db.from('organizations').select('rate_currency').eq('id', orgId).maybeSingle()
    if (error) {
      console.warn(`[rate-currency] could not read organizations.rate_currency for ${orgId}: ${error.message} — using ${DEFAULT_RATE_CURRENCY}`)
      return DEFAULT_RATE_CURRENCY
    }
    return normaliseRateCurrency(data?.rate_currency) ?? DEFAULT_RATE_CURRENCY
  } catch (e) {
    console.warn(`[rate-currency] lookup threw for ${orgId}: ${e instanceof Error ? e.message : String(e)} — using ${DEFAULT_RATE_CURRENCY}`)
    return DEFAULT_RATE_CURRENCY
  }
}
