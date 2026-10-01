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
import { getTemplatePriceRange, type PricingParams } from '@/lib/auto-pricing-service'

export interface CachedPriceResult {
  price: number | null
  tier: string | null
}

export interface CachedPriceContext {
  /** The agency's tier ladder (tierLadderForCurrentOrg). */
  tierLadder: readonly string[]
  /** orgId + rateCurrency at least, or every rate is read as EUR. */
  pricingOptions: Partial<PricingParams>
}

/**
 * Price one template and write its cached "from" price. A template the engine
 * cannot price caches NULL — the card shows no price rather than a guess.
 * Throws when the write fails; the caller decides whether that matters.
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
    const range = await getTemplatePriceRange(template.id, true, ctx.tierLadder, ctx.pricingOptions)
    if (range) {
      price = Math.round(range.minPrice)
      tier = range.tier
    }
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
