import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Default fallback values (used when DB has no data)
const DEFAULTS = {
  'Water Bottle': 2,
  'Daily Tips': 5,
}

export interface FixedDailyCosts {
  waterPerPersonPerDay: number
  tipsPerPersonPerDay: number
}

let cachedCosts: { data: FixedDailyCosts; fetchedAt: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch fixed daily costs (water bottles, tips) from the database.
 * Uses a 5-minute in-memory cache to avoid repeated DB queries.
 * Falls back to hardcoded defaults if DB is unavailable.
 */
export async function getFixedDailyCosts(): Promise<FixedDailyCosts> {
  // Return cached if still fresh
  if (cachedCosts && Date.now() - cachedCosts.fetchedAt < CACHE_TTL) {
    return cachedCosts.data
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('fixed_daily_costs')
      .select('cost_type, cost_per_person_per_day')
      .eq('is_active', true)

    if (error) {
      console.warn('[FixedCosts] DB query failed, using defaults:', error.message)
      return {
        waterPerPersonPerDay: DEFAULTS['Water Bottle'],
        tipsPerPersonPerDay: DEFAULTS['Daily Tips'],
      }
    }

    const findRate = (type: string) => {
      const record = (data || []).find((r: any) => r.cost_type === type)
      return record?.cost_per_person_per_day ?? DEFAULTS[type as keyof typeof DEFAULTS] ?? 0
    }

    const costs: FixedDailyCosts = {
      waterPerPersonPerDay: findRate('Water Bottle'),
      tipsPerPersonPerDay: findRate('Daily Tips'),
    }

    cachedCosts = { data: costs, fetchedAt: Date.now() }
    return costs
  } catch (err: any) {
    console.warn('[FixedCosts] Exception fetching costs, using defaults:', err.message)
    return {
      waterPerPersonPerDay: DEFAULTS['Water Bottle'],
      tipsPerPersonPerDay: DEFAULTS['Daily Tips'],
    }
  }
}

/** Clear the cache (e.g. after updating rates via the API) */
export function clearFixedCostsCache() {
  cachedCosts = null
}
