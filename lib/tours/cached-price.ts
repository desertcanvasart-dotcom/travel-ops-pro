// ============================================
// A programme's cached "from" price
// ============================================
// The tour catalogue (/tours, /api/tours/browse) never prices anything itself:
// it shows tour_templates.cached_starting_price. That cache used to be written
// ONLY by /api/tours/recalculate-prices, and nothing on this installation ever
// called it — no cron, no button. So every programme read "N/A", including
// ones the office had just priced in the B2B calculator (operator, 2026-10-01).
//
// This is that route's per-template step, shared so a save can refresh its
// own template's price too.

import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateMultiTierPricing, type PricingParams, type PricingResult } from '@/lib/auto-pricing-service'
import { guideLanguageKey } from '@/lib/guides/guide-language'
import { getOrgDefaultMargin, resolveMarginPercent } from '@/lib/org-default-margin'
import { DEFAULT_RATE_CURRENCY, getOrgRateCurrency } from '@/lib/org-rate-currency'
import { activeKeysForOrg } from '@/lib/vocabulary-server'
import { NO_ORG } from '@/lib/tours/org-scope'
import { convertOnDate, type FxIndex } from '@/lib/fx-conversion'
import { loadFxIndex } from '@/lib/fx-report'
import { businessToday } from '@/lib/today'

// ============================================
// What the "from" price is priced AS
// ============================================
// One comparable number per programme, not whoever priced it last: 2 pax,
// the cheapest tier — but at the office's own settings, and only a tier the
// engine priced COMPLETELY (operator, 2026-10-01). It used to run at the
// engine's defaults: an English guide (this office holds Japanese guide
// contracts only, so every guide day was a hole priced at 0) and a 25%
// margin; and a tier full of holes counted, so the "cheapest" tier was often
// the one with the fewest rates. A low number from missing rates reads as a
// real price in a sales catalogue — no number is better.
//
// The passport stays EU: every price view in the app opens on EU, and the
// EU ticket rate is the lower one, which is what "from" means.

/** Pax the catalogue price is quoted for. */
export const CATALOGUE_PAX = 2

export interface CachedPriceResult {
  price: number | null
  tier: string | null
}

/** One rate the engine could not find — what the operator has to add. */
export interface MissingRate {
  kind: string
  reason: 'missing' | 'fuzzy' | 'unpriced'
  day?: number
  city?: string
  /** What the engine looked for, in words. */
  lookup: string
}

/**
 * Why a template has no "from" price: the tier closest to complete (fewest
 * holes; the ladder order breaks a tie, so standard first) and what it lacks.
 * `failed` when no tier could be priced at all (the engine's warnings).
 */
export interface NoPriceReason {
  tier: string | null
  missing: MissingRate[]
  failed?: string[]
}

export interface RefreshResult extends CachedPriceResult {
  /** Set only when price is null and the engine was asked. */
  noPrice?: NoPriceReason
}

export interface CachedPriceContext {
  /** The agency's tier ladder (tierLadderForCurrentOrg). */
  tierLadder: readonly string[]
  /** orgId, rateCurrency, marginPercent and language (loadCachedPriceSettings). */
  pricingOptions: Partial<PricingParams>
}

/**
 * The guide language a quote opens on — the same rule as the price views'
 * picker (components/pricing/GuideLanguageSelect): the first language in the
 * agency's vocabulary order that has an active guide rate, else the first
 * language with a rate at all. undefined when there are no guide rates.
 */
export function pickGuideLanguage(vocabularyOrder: string[], rateLanguages: (string | null | undefined)[]): string | undefined {
  const withRate: string[] = []
  for (const l of rateLanguages) {
    const k = guideLanguageKey(l)
    if (k && !withRate.includes(k)) withRate.push(k)
  }
  return vocabularyOrder.map(guideLanguageKey).find(k => withRate.includes(k)) ?? withRate[0]
}

/** The office's settings for the "from" price: rate currency, default margin, guide language. */
export async function loadCachedPriceSettings(db: SupabaseClient, orgId: string | null): Promise<Partial<PricingParams>> {
  const [rateCurrency, orgMargin, vocabulary, guideRates] = await Promise.all([
    getOrgRateCurrency(db, orgId),
    getOrgDefaultMargin(db, orgId),
    orgId ? activeKeysForOrg(db, orgId, 'guide_language').catch(() => [] as string[]) : Promise.resolve([] as string[]),
    // This company's guide rates; no organisation, none.
    orgId
      ? db.from('guide_rates').select('guide_language').eq('org_id', orgId).eq('is_active', true)
      : Promise.resolve({ data: [] as { guide_language?: string | null }[] }),
  ])
  const language = pickGuideLanguage(
    vocabulary,
    ((guideRates.data ?? []) as { guide_language?: string | null }[]).map(r => r.guide_language),
  )
  return {
    orgId: orgId ?? undefined,
    rateCurrency,
    marginPercent: resolveMarginPercent({ orgDefault: orgMargin }),
    ...(language ? { language } : {}),
  }
}

/**
 * The cheapest tier the engine priced completely, per person. A tier with a
 * hole (a missing rate) does not count — null when no tier is complete.
 */
export function cheapestCompleteTier(results: Map<string, Pick<PricingResult, 'success' | 'complete' | 'pricePerPerson'>>): CachedPriceResult {
  let best: CachedPriceResult = { price: null, tier: null }
  for (const [tier, r] of results) {
    if (!r.success || r.complete === false || !(r.pricePerPerson > 0)) continue
    if (best.price === null || r.pricePerPerson < best.price) best = { price: r.pricePerPerson, tier }
  }
  return best.price === null ? best : { price: Math.round(best.price), tier: best.tier }
}

/** A legacy variation_pricing row, as the fallback reads it. */
export interface LegacyPriceRow {
  price_per_person: number | string | null
  currency?: string | null
  min_pax?: number | null
  max_pax?: number | null
  valid_from?: string | null
  valid_to?: string | null
  tier?: string | null
}

/**
 * The cheapest authored variation_pricing price that means the same thing as
 * the engine's "from": a band that covers CATALOGUE_PAX, not expired, and in
 * the company's rate currency (converted at today's rate; a row that cannot
 * be converted is left out, never shown at face value). It used to take the
 * cheapest price_per_person of any row — a 10+ pax band, last year's season,
 * a EUR price under a ¥ sign.
 */
export function cheapestLegacyPrice(
  rows: readonly LegacyPriceRow[],
  opts: { rateCurrency: string; today: string; fx: FxIndex }
): CachedPriceResult {
  let best: CachedPriceResult = { price: null, tier: null }
  for (const r of rows) {
    const amount = Number(r.price_per_person)
    if (r.price_per_person === null || !Number.isFinite(amount) || amount <= 0) continue
    if (r.min_pax != null && r.min_pax > CATALOGUE_PAX) continue
    if (r.max_pax != null && r.max_pax < CATALOGUE_PAX) continue
    if (r.valid_to && r.valid_to < opts.today) continue
    // The column defaults to EUR; a blank one is that default.
    const converted = convertOnDate(opts.fx, amount, r.currency || 'EUR', opts.rateCurrency, opts.today).amount
    if (converted === null) continue
    if (best.price === null || converted < best.price) best = { price: converted, tier: r.tier || 'standard' }
  }
  return best.price === null ? best : { price: Math.round(best.price), tier: best.tier }
}

type TierResult = Pick<PricingResult, 'success' | 'complete' | 'pricePerPerson' | 'holes' | 'warnings'>

/** Why no tier is complete — see NoPriceReason. */
export function closestTierReason(results: Map<string, TierResult>): NoPriceReason {
  let best: { tier: string; holes: TierResult['holes'] } | null = null
  const failed: string[] = []
  for (const [tier, r] of results) {
    if (!r.success) { failed.push(...(r.warnings ?? []).map(w => `${tier}: ${w}`)); continue }
    const holes = r.holes ?? []
    if (!best || holes.length < best.holes.length) best = { tier, holes }
  }
  if (!best) return { tier: null, missing: [], failed: failed.length ? failed : ['The engine could not price any tier'] }
  // One line per distinct lookup: the same missing guide on six days is one rate to add.
  const seen = new Set<string>()
  const missing: MissingRate[] = []
  for (const h of best.holes) {
    const key = `${h.kind}|${h.reason}|${h.lookupAttempted}`
    if (seen.has(key)) continue
    seen.add(key)
    missing.push({ kind: h.kind, reason: h.reason, day: h.dayNumber, city: h.city, lookup: h.lookupAttempted })
  }
  return { tier: best.tier, missing }
}

/** Does the engine price this template's cached "from" price? */
export function usesAutoPricing(template: { uses_day_builder?: boolean | null; pricing_mode?: string | null }): boolean {
  if (template.pricing_mode === 'manual') return false
  return !!template.uses_day_builder || template.pricing_mode === 'auto'
}

/**
 * Price one template and write its cached "from" price. A template the engine
 * cannot price completely caches NULL — the card shows no price rather than a
 * guess. Throws when the write fails; the caller decides whether that matters.
 */
export async function refreshTemplateCachedPrice(
  db: SupabaseClient,
  template: { id: string; uses_day_builder?: boolean | null; pricing_mode?: string | null },
  ctx: CachedPriceContext
): Promise<RefreshResult> {
  let price: number | null = null
  let tier: string | null = null
  let noPrice: NoPriceReason | undefined
  // The template's company (ctx.pricingOptions.orgId — loadCachedPriceSettings
  // for that company): its rates price it, and only its rows are read or
  // written. No company, nothing matches.
  const orgId = ctx.pricingOptions.orgId ?? NO_ORG

  // Only templates that use auto-pricing are priced by the engine. An
  // explicit 'manual' (Tour Manager's Auto-Pricing box unticked) wins over
  // uses_day_builder, which only says the template has day activities — else
  // the box could not switch auto-pricing off.
  if (usesAutoPricing(template)) {
    const results = await calculateMultiTierPricing(template.id, [...ctx.tierLadder], CATALOGUE_PAX, true, ctx.pricingOptions)
    ;({ price, tier } = cheapestCompleteTier(results))
    if (price === null) noPrice = closestTierReason(results)
  } else {
    noPrice = { tier: null, missing: [], failed: [`Pricing mode is "${template.pricing_mode ?? 'manual'}", not auto`] }
  }

  // Fallback: the variation_pricing table — this company's variations of
  // this template only.
  if (price === null) {
    const { data: variations } = await db
      .from('tour_variations')
      .select('id')
      .eq('template_id', template.id)
      .eq('org_id', orgId)
      .eq('is_active', true)

    if (variations && variations.length > 0) {
      // price_per_person: there is no selling_price_per_person column — the
      // query named one, PostgREST refused it, and this fallback never found
      // a price. Every row is read and filtered by cheapestLegacyPrice: the
      // band, the dates and the currency decide, not the bare number.
      const { data: pricing } = await db
        .from('variation_pricing')
        .select('price_per_person, currency, min_pax, max_pax, valid_from, valid_to, tour_variations!inner(tier)')
        .in('variation_id', variations.map(v => v.id))
        .not('price_per_person', 'is', null)

      if (pricing && pricing.length > 0) {
        const rows: LegacyPriceRow[] = (pricing as (LegacyPriceRow & { tour_variations?: { tier?: string } | null })[])
          .map(r => ({ ...r, tier: r.tour_variations?.tier ?? null }))
        ;({ price, tier } = cheapestLegacyPrice(rows, {
          rateCurrency: ctx.pricingOptions.rateCurrency || DEFAULT_RATE_CURRENCY,
          today: businessToday(),
          fx: await loadFxIndex(db),
        }))
      }
    }
  }

  const { error } = await db
    .from('tour_templates')
    .update({
      cached_starting_price: price,
      cached_starting_tier: tier,
      cached_price_updated_at: new Date().toISOString(),
    })
    .eq('id', template.id)
    .eq('org_id', orgId)
  if (error) throw error

  // An authored variation price stands in — then there is nothing to report.
  return price === null ? { price, tier, noPrice } : { price, tier }
}
