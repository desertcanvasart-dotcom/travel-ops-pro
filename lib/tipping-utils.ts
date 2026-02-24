// ============================================
// TIPPING UTILITIES
// Single source of truth for daily tipping rate calculations.
// All pricing paths should use getDailyTippingRate() instead of
// querying tipping_rates and summing per_day entries inline.
// ============================================

/**
 * Canonical tier multipliers for tipping rates.
 * Higher tiers = proportionally higher tips.
 */
const TIPPING_TIER_MULTIPLIERS: Record<string, number> = {
  budget: 0.8,
  standard: 1.0,
  deluxe: 1.2,
  luxury: 1.5,
}

/**
 * Fetch the total daily tipping rate from the `tipping_rates` table,
 * adjusted by tier multiplier.
 *
 * Logic:
 * 1. Query all active tipping_rates
 * 2. Sum entries where rate_unit === 'per_day' (guide tips + driver tips + others)
 * 3. Apply tier multiplier (budget 0.8×, standard 1.0×, deluxe 1.2×, luxury 1.5×)
 * 4. Return rounded integer amount
 *
 * @param supabase - Supabase client instance
 * @param tier - Service tier (budget | standard | deluxe | luxury)
 * @returns Daily tipping amount in EUR (flat per day, not per person)
 */
export async function getDailyTippingRate(
  supabase: any,
  tier: string = 'standard'
): Promise<number> {
  const { data: rates, error } = await supabase
    .from('tipping_rates')
    .select('rate_eur, rate_unit')
    .eq('is_active', true)

  if (error) {
    console.warn('[Tipping] Failed to fetch tipping_rates:', error.message)
    return 0
  }

  const baseDailyTips = (rates || []).reduce(
    (sum: number, t: any) => t.rate_unit === 'per_day' ? sum + (parseFloat(t.rate_eur) || 0) : sum,
    0
  )

  if (baseDailyTips === 0) {
    console.warn('⚠️ No per_day tipping rates found in tipping_rates table — tips will be €0')
  }

  const multiplier = TIPPING_TIER_MULTIPLIERS[tier] || 1.0
  return Math.round(baseDailyTips * multiplier)
}

export { TIPPING_TIER_MULTIPLIERS }
