// ============================================
// USER PREFERENCES
// Extracted from generate-itinerary/route.ts
// ============================================
// Fetches default preferences for the authenticated user.
// Used in itinerary generation to fill in missing parameters.

import { type ServiceTier, tierKeyOrPreset } from '@/lib/ai/parsing-utils'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { getOrgDefaultMargin, resolveMarginPercent } from '@/lib/org-default-margin'

// Last-resort margin: only reached when neither the user nor the organisation has set one
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

    // The company's margin sits under the user's own: a colleague who never
    // opened Settings still quotes at what the company decided, not at 25.
    const orgMargin = await getOrgDefaultMargin(supabase, await getCurrentOrgId())
    defaults.default_margin_percent = resolveMarginPercent({ orgDefault: orgMargin })

    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!prefs) return defaults

    return {
      default_cost_mode: prefs.default_cost_mode || defaults.default_cost_mode,
      // A default the agency added in Settings → Vocabulary ("5_star") used to
      // collapse to 'standard' here, before any route could see it.
      default_tier: tierKeyOrPreset(prefs.default_tier) || defaults.default_tier,
      default_margin_percent: resolveMarginPercent({ userPreference: prefs.default_margin_percent, orgDefault: orgMargin }),
      default_currency: prefs.default_currency || defaults.default_currency
    }
  } catch (error) {
    return defaults
  }
}
