// ============================================
// Tiered (volume-discount) activity pricing
// ============================================
// One implementation shared by the two B2B engines (calculate-price and
// quote-from-itinerary), which previously each carried a copy-pasted
// getB2BPricingRule/applyB2BPricingRule pair pointed at b2b_pricing_rules — a
// table that has been empty in production since launch. Tiers now live on the
// activity_rates catalog (migration 20260826_activity_rates_tiers): a per-person
// rate that varies with group size.
//
// Tier shape (JSONB on activity_rates.tiers, used when pricing_type='tiered'):
//   { min_pax, max_pax, rate_eur, rate_non_eur?, label? }
// Bands are matched on max_pax in ascending order; a group larger than every
// band gets the last band's rate. rate_non_eur falls back to rate_eur.

import type { RateNormalizer } from '@/lib/rates/rate-currency'
import { rateValidOn } from '@/lib/pricing/service-rates'

export interface ActivityTier {
  min_pax: number
  max_pax: number
  rate_eur: number
  rate_non_eur?: number | null
  label?: string | null
}

/** Parse/validate a tiers payload from a form or API body. Returns null when
 *  the input is absent or unusable (never throws — a bad tiers payload should
 *  read as "no tiers", not a 500). */
export function sanitizeTiers(input: unknown): ActivityTier[] | null {
  if (!Array.isArray(input) || input.length === 0) return null
  const tiers: ActivityTier[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return null
    const t = raw as Record<string, unknown>
    const min_pax = Number(t.min_pax)
    const max_pax = Number(t.max_pax)
    const rate_eur = Number(t.rate_eur)
    // A tier without a positive rate is a data-entry hole, not a €0 price —
    // refuse the whole set rather than silently pricing at zero.
    if (!Number.isFinite(min_pax) || !Number.isFinite(max_pax) || !Number.isFinite(rate_eur)) return null
    if (min_pax < 1 || max_pax < min_pax || rate_eur <= 0) return null
    const rate_non_eur = t.rate_non_eur === null || t.rate_non_eur === undefined || t.rate_non_eur === ''
      ? null
      : Number(t.rate_non_eur)
    if (rate_non_eur !== null && (!Number.isFinite(rate_non_eur) || rate_non_eur <= 0)) return null
    tiers.push({
      min_pax,
      max_pax,
      rate_eur,
      rate_non_eur,
      label: typeof t.label === 'string' && t.label.trim() ? t.label.trim() : null,
    })
  }
  tiers.sort((a, b) => a.max_pax - b.max_pax)
  // Bands must not overlap — each tier starts after the previous one ends.
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].min_pax <= tiers[i - 1].max_pax) return null
  }
  return tiers
}

/** Pick the band for a group size. Groups beyond every band use the last band. */
export function pickTier(tiers: ActivityTier[], numPax: number): ActivityTier {
  for (const tier of tiers) {
    if (numPax <= tier.max_pax) return tier
  }
  return tiers[tiers.length - 1]
}

/** Find an active tiered catalog entry for a service line by name/code.
 *  Client is passed in (both engines hold a service-role client already).
 *  Match order: exact service_code, exact name, then contains-name — the old
 *  b2b_pricing_rules lookup matched on the FIRST WORD only ("Felucca Ride" →
 *  '%Felucca%'), which could hit the wrong service; contains-full-name is the
 *  safer fuzzy fallback. */
export async function getTieredActivityRate(
  supabase: { from: (table: string) => any },
  /** Whose activities: this company's (activity_rates.org_id). */
  orgId: string | null | undefined,
  serviceName: string,
  opts?: {
    /** Converts the bands from the row's own rate_currency into the run
     *  currency (lib/rates/rate-currency) — they were read as stored, so a
     *  felucca entered in EGP priced ~50× in a USD quote. */
    normalizer?: RateNormalizer
    /** The travel date: a rate whose validity does not cover it is skipped. */
    date?: string | null
  }
): Promise<{ tiers: ActivityTier[]; activity_name: string } | null> {
  if (!orgId) return null
  const base = () =>
    supabase
      .from('activity_rates')
      .select('id, activity_name, service_code, tiers, rate_currency, rate_valid_from, rate_valid_to')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .eq('pricing_type', 'tiered')
      .not('tiers', 'is', null)

  const attempts = [
    (q: any) => q.eq('service_code', serviceName),
    (q: any) => q.ilike('activity_name', serviceName),
    (q: any) => q.ilike('activity_name', `%${serviceName}%`),
  ]
  for (const refine of attempts) {
    const { data, error } = await refine(base())
    if (error) return null
    // Valid on the date, then a fixed order (newest period, then code) —
    // never whichever row the database returned first.
    const valid = ((data ?? []) as Record<string, unknown>[])
      .filter(r => rateValidOn(r as { rate_valid_from?: string | null; rate_valid_to?: string | null }, opts?.date))
      .sort((a, b) =>
        String(b.rate_valid_from ?? '').localeCompare(String(a.rate_valid_from ?? '')) ||
        String(a.service_code ?? '').localeCompare(String(b.service_code ?? '')))
    if (valid.length) {
      const row = (opts?.normalizer ? (await opts.normalizer.normalize('activity_rates', [valid[0]]))?.[0] : valid[0]) ?? valid[0]
      const tiers = sanitizeTiers(row.tiers)
      if (tiers) return { tiers, activity_name: String(row.activity_name ?? '') }
    }
  }
  return null
}

export interface TieredPriceResult {
  unitCost: number
  lineTotal: number
  pricingNote: string
  quantityMode: 'per_pax'
}

/** Price a tiered activity: per-person rate for the matched band × pax. */
export function applyActivityTiers(
  tiers: ActivityTier[],
  numPax: number,
  isEurPassport: boolean,
  rateSym: string
): TieredPriceResult {
  const tier = pickTier(tiers, numPax)
  const rate = isEurPassport ? tier.rate_eur : (tier.rate_non_eur ?? tier.rate_eur)
  const label = tier.label || `${tier.min_pax}-${tier.max_pax} pax`
  return {
    unitCost: rate,
    lineTotal: rate * numPax,
    pricingNote: `${label}: ${rateSym}${rate}/pax × ${numPax} = ${rateSym}${rate * numPax}`,
    quantityMode: 'per_pax',
  }
}
