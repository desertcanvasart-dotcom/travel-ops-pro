// ============================================
// USER PREFERENCES
// Extracted from generate-itinerary/route.ts
// ============================================
// Fetches default preferences for the authenticated user.
// Used in itinerary generation to fill in missing parameters.

import { type ServiceTier, normalizeTier } from '@/lib/ai/parsing-utils'

// Default margin percentage (used if no user preference)
export const DEFAULT_MARGIN_PERCENT = 25

export interface UserGenerationPreferences {
  default_cost_mode: 'auto' | 'manual'
  default_tier: ServiceTier
  default_margin_percent: number
  default_currency: string
}

/**
 * Fetch generation-relevant user preferences from the database.
 * Returns sensible defaults if no preferences are found or user is not authenticated.
 */
export async function getUserPreferences(supabase: any): Promise<UserGenerationPreferences> {
  const defaults: UserGenerationPreferences = {
    default_cost_mode: 'auto',
    default_tier: 'standard',
    default_margin_percent: DEFAULT_MARGIN_PERCENT,
    default_currency: 'EUR'
  }

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return defaults

    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!prefs) return defaults

    return {
      default_cost_mode: prefs.default_cost_mode || defaults.default_cost_mode,
      default_tier: normalizeTier(prefs.default_tier) || defaults.default_tier,
      default_margin_percent: prefs.default_margin_percent ?? defaults.default_margin_percent,
      default_currency: prefs.default_currency || defaults.default_currency
    }
  } catch (error) {
    return defaults
  }
}
