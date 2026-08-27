import { createClient } from '@supabase/supabase-js'
import type { RateNormalizer } from '@/lib/rates/rate-currency'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Default fallback values (used when DB has no data)
const DEFAULTS = {
  'Water Bottle': 2,
}

export interface FixedDailyCosts {
  waterPerPersonPerDay: number
}

// The cache holds the RAW rows, not derived costs: rows may carry a
// rate_currency (per-rate currency work), and the conversion target depends
// on the run — caching a converted number would leak one run's currency into
// the next.
type FixedCostRow = { cost_type: string; cost_per_person_per_day: number | null; rate_currency?: string | null }
let cachedRows: { rows: FixedCostRow[]; fetchedAt: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch fixed daily costs (water bottles) from the database.
 * Uses a 5-minute in-memory cache to avoid repeated DB queries.
 * Falls back to hardcoded defaults if DB is unavailable.
 *
 * NOTE: Tipping is handled separately via tipping_rates table.
 * Use getDailyTippingRate() from lib/tipping-utils.ts for tips.
 */
export async function getFixedDailyCosts(
  /** Converts rows entered in another currency into the run currency —
   *  see lib/rates/rate-currency.ts. Omitted = rows are taken as-is. */
  normalizer?: RateNormalizer
): Promise<FixedDailyCosts> {
  let rows: FixedCostRow[]

  if (cachedRows && Date.now() - cachedRows.fetchedAt < CACHE_TTL) {
    rows = cachedRows.rows
  } else {
    try {
      const { data, error } = await supabaseAdmin
        .from('fixed_daily_costs')
        // select('*') so this deploys safely before the rate_currency migration.
        .select('*')
        .eq('is_active', true)

      if (error) {
        console.warn('[FixedCosts] DB query failed, using defaults:', error.message)
        return { waterPerPersonPerDay: DEFAULTS['Water Bottle'] }
      }
      rows = (data as FixedCostRow[]) || []
      cachedRows = { rows, fetchedAt: Date.now() }
    } catch (err: any) {
      console.warn('[FixedCosts] Exception fetching costs, using defaults:', err.message)
      return { waterPerPersonPerDay: DEFAULTS['Water Bottle'] }
    }
  }

  const converted = normalizer
    ? (await normalizer.normalize('fixed_daily_costs', rows)) ?? rows
    : rows

  const findRate = (type: string) => {
    const record = converted.find(r => r.cost_type === type)
    return record?.cost_per_person_per_day ?? DEFAULTS[type as keyof typeof DEFAULTS] ?? 0
  }

  return {
    waterPerPersonPerDay: findRate('Water Bottle'),
  }
}

/** Clear the cache (e.g. after updating rates via the API) */
export function clearFixedCostsCache() {
  cachedRows = null
}
