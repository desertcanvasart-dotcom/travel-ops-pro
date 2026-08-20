// ============================================
// トラベルセーフティプラン — which band, what it costs, who may buy it
// ============================================
// The insurer publishes a grid: four plans (HC/HD/HE/HF) against fourteen
// duration bands. The premium is not a rate per day — it is a step function,
// and the steps are not evenly spaced. A 5-day trip pays the 「6日まで」 price;
// a 9-day trip pays 「11日まで」. Reading the band right IS the calculation.
//
// Pure on purpose: the rows come from insurance_premiums, the arithmetic and
// the eligibility rules live here, and both are testable without a database.

/** One row of the published 掛金表. */
export interface PremiumBand {
  id?: string
  planCode: string
  maxDays: number
  bandLabel: string
  premiumJpy: number
  /** 満69歳まで on the longer bands; null where the table sets no ceiling. */
  maxAge: number | null
}

export type IneligibleReason =
  /** 3ヶ月を越える旅行期間はお申込みできません。 */
  | 'trip_too_long'
  /** 「28日まで」から「3ヶ月まで」は満69歳までの方が申込みいただけます。 */
  | 'age_above_band_limit'
  /** The rate table has no row for this plan and length. */
  | 'no_band'

export interface PremiumQuote {
  planCode: string
  bandLabel: string
  premiumJpy: number
  premiumId?: string
}

/**
 * The band a trip of `days` falls into: the CHEAPEST row whose ceiling still
 * covers it. Sorting by maxDays and taking the first match is what makes the
 * gaps in the published table behave — 5 days has no row of its own and must
 * land on 「6日まで」, not on the row below it.
 */
export function findBand(bands: PremiumBand[], days: number): PremiumBand | null {
  if (!Number.isFinite(days) || days <= 0) return null
  return (
    bands
      .slice()
      .sort((a, b) => a.maxDays - b.maxDays)
      .find(b => days <= b.maxDays) ?? null
  )
}

/**
 * What one traveller pays, or why they cannot be covered.
 *
 * `age` is the traveller's age at departure. It is only consulted when the band
 * carries a ceiling, so a missing age blocks nothing on the short bands that
 * have none — but a band WITH a ceiling and no age to check is refused rather
 * than waved through: quoting an uninsurable traveller is worse than asking
 * for a birth date.
 */
export function quotePremium(input: {
  bands: PremiumBand[]
  planCode: string
  days: number
  age?: number | null
}): { ok: true; quote: PremiumQuote } | { ok: false; reason: IneligibleReason } {
  const forPlan = input.bands.filter(b => b.planCode === input.planCode)
  const longest = forPlan.reduce((max, b) => Math.max(max, b.maxDays), 0)

  if (input.days > longest && longest > 0) return { ok: false, reason: 'trip_too_long' }

  const band = findBand(forPlan, input.days)
  if (!band) return { ok: false, reason: 'no_band' }

  if (band.maxAge != null) {
    const age = input.age
    if (age == null || age > band.maxAge) return { ok: false, reason: 'age_above_band_limit' }
  }

  return {
    ok: true,
    quote: {
      planCode: band.planCode,
      bandLabel: band.bandLabel,
      premiumJpy: band.premiumJpy,
      premiumId: band.id,
    },
  }
}

/** Every plan priced for one trip, for the portal's chooser. Plans the
 *  traveller cannot take are returned WITH their reason rather than dropped —
 *  a plan silently missing from the list looks like a bug to whoever is
 *  filling the form. */
export function quoteAllPlans(input: {
  bands: PremiumBand[]
  days: number
  age?: number | null
}): Array<{ planCode: string } & ({ available: true; quote: PremiumQuote } | { available: false; reason: IneligibleReason })> {
  const codes = [...new Set(input.bands.map(b => b.planCode))].sort()
  return codes.map(planCode => {
    const r = quotePremium({ ...input, planCode })
    return r.ok
      ? { planCode, available: true as const, quote: r.quote }
      : { planCode, available: false as const, reason: r.reason }
  })
}

/**
 * Trip length in days, counted the way the insurer counts it: departure and
 * return day INCLUSIVE, so 3 Nov → 11 Nov is 9 days, not 8. Parsed as UTC —
 * read as local dates these are off by one for half the world.
 */
export function tripDays(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null
  const a = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${endDate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null
  return Math.round((b - a) / 86_400_000) + 1
}

/** Age at a given date — the figure the 申込書 asks for (年齢), and what the
 *  band ceilings are checked against. */
export function ageOn(dateOfBirth: string | null, on: string | null): number | null {
  if (!dateOfBirth || !on) return null
  const dob = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00Z`)
  const at = new Date(`${on.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(dob.getTime()) || Number.isNaN(at.getTime())) return null
  let age = at.getUTCFullYear() - dob.getUTCFullYear()
  const m = at.getUTCMonth() - dob.getUTCMonth()
  if (m < 0 || (m === 0 && at.getUTCDate() < dob.getUTCDate())) age--
  return age < 0 ? null : age
}

/** JPY has no minor unit — ¥12,200, never ¥12,200.00. */
export function formatJpy(amount: number): string {
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`
}
