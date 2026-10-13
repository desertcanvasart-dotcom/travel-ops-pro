// ============================================
// USER PREFERENCES
// Extracted from generate-itinerary/route.ts
// ============================================
// Fetches default preferences for the authenticated user.
// Used in itinerary generation to fill in missing parameters.
//
// The person is the request's signed-in user (getCurrentUserId), not
// `supabase.auth.getUser()`: generation passes the service-role client, which
// has no session, so that call always answered "nobody" and every generation
// that named no currency came out in EUR at the constant margin — whatever the
// person or the company had set. With no preference of the person's own, the
// company's default currency (organizations.default_currency) and margin
// apply.

import { type ServiceTier, tierKeyOrPreset } from '@/lib/ai/parsing-utils'
import { getCurrentOrgId, getCurrentUserId } from '@/lib/auth/current-org'
import { getOrgDefaultMargin, resolveMarginPercent } from '@/lib/org-default-margin'
import { getOrgDefaultCurrency } from '@/lib/org-default-currency'

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
 * Returns the company's defaults if the person has none, and sensible
 * defaults when there is no signed-in user or company.
 */
export async function getUserPreferences(supabase: any): Promise<UserGenerationPreferences> {
  const defaults: UserGenerationPreferences = {
    default_cost_mode: 'auto',
    default_tier: 'standard',
    default_margin_percent: DEFAULT_MARGIN_PERCENT,
    default_currency: await getOrgDefaultCurrency(supabase, null),
  }

  try {
    const userId = await getCurrentUserId()
    if (!userId) return defaults

    // The company's margin and currency sit under the user's own: a colleague
    // who never opened Settings still quotes at what the company decided.
    const orgId = await getCurrentOrgId()
    if (!orgId) return defaults
    const orgMargin = await getOrgDefaultMargin(supabase, orgId)
    defaults.default_margin_percent = resolveMarginPercent({ orgDefault: orgMargin })
    defaults.default_currency = await getOrgDefaultCurrency(supabase, orgId)

    // The person's preferences IN THIS COMPANY (user_preferences is per
    // (user_id, org_id), migration 20261209): a tier key of the other
    // company's vocabulary, or its margin, never prices this one's trip.
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .maybeSingle()

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
