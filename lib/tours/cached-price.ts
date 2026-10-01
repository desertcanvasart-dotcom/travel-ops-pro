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
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { activeKeysForOrg } from '@/lib/vocabulary-server'

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
    db.from('guide_rates').select('guide_language').eq('is_active', true),
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

/**
 * Price one template and write its cached "from" price. A template the engine
 * cannot price completely caches NULL — the card shows no price rather than a
 * guess. Throws when the write fails; the caller decides whether that matters.
 */
export async function refreshTemplateCachedPrice(
  db: SupabaseClient,
  template: { id: string; uses_day_builder?: boolean | null; pricing_mode?: string | null },
  ctx: CachedPriceContext
): Promise<CachedPriceResult> {
  let price: number | null = null
  let tier: string | null = null

  // Only templates that use auto-pricing are priced by the engine.
  if (template.uses_day_builder || template.pricing_mode === 'auto') {
    const results = await calculateMultiTierPricing(template.id, [...ctx.tierLadder], CATALOGUE_PAX, true, ctx.pricingOptions)
    ;({ price, tier } = cheapestCompleteTier(results))
  }

  // Fallback: the variation_pricing table.
  if (price === null) {
    const { data: variations } = await db
      .from('tour_variations')
      .select('id')
      .eq('template_id', template.id)
      .eq('is_active', true)

    if (variations && variations.length > 0) {
      const { data: pricing } = await db
        .from('variation_pricing')
        .select('selling_price_per_person, tour_variations!inner(tier)')
        .in('variation_id', variations.map(v => v.id))
        .order('selling_price_per_person', { ascending: true })
        .limit(1)

      if (pricing && pricing.length > 0) {
        price = Math.round(pricing[0].selling_price_per_person)
        const joined = (pricing[0] as { tour_variations?: { tier?: string } | null }).tour_variations
        tier = joined?.tier || 'standard'
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
  if (error) throw error

  return { price, tier }
}
