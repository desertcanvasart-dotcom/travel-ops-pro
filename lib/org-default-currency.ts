// ============================================
// The currency a company bills in
// ============================================
// organizations.default_currency — ATS bills in JPY. New trips (POST
// /api/itineraries, AI generation) used to default to the constants 'USD' and
// 'EUR' whenever the caller sent none, so a quote came out in a currency the
// company does not bill in. A company that has not set one bills in the
// currency its rates are in (organizations.rate_currency), so nothing is
// converted at a guessed rate; EUR, the rate currency's own default, only
// when there is no company at all.

import { DEFAULT_RATE_CURRENCY, normaliseRateCurrency } from '@/lib/org-rate-currency'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrgReader = { from(table: string): any }

export async function getOrgDefaultCurrency(db: OrgReader, orgId: string | null | undefined): Promise<string> {
  if (!orgId) return DEFAULT_RATE_CURRENCY
  try {
    const { data } = await db.from('organizations').select('default_currency, rate_currency').eq('id', orgId).maybeSingle()
    return normaliseRateCurrency(data?.default_currency) ?? normaliseRateCurrency(data?.rate_currency) ?? DEFAULT_RATE_CURRENCY
  } catch {
    return DEFAULT_RATE_CURRENCY
  }
}
