import { createClient } from '@supabase/supabase-js'
import type { RateNormalizer } from '@/lib/rates/rate-currency'
import { WATER_COST_TYPE, WATER_DEFAULT_PER_PERSON_PER_DAY, isWaterCostType } from '@/lib/fixed-cost-types'

export { WATER_COST_TYPE, isWaterCostType }

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// Fixed daily costs (Rates › Fixed Costs)
// ============================================
// Pricing reads ONE cost from this table: "Water Bottle", per person per
// touring day. Any other cost type is stored and listed but not priced — the
// page says so on every such card. The match ignores case and spacing, so
// "water bottle" is the same cost (the case-sensitive match used to drop it
// and price the built-in default without a word).
//
// The built-in default (2.00 in the run currency) is used only when there is
// no usable active row — and never silently: `warnings` says why, and the
// pricing engine shows it on the quote.
// ============================================

// Default fallback values (used when DB has no data)
const DEFAULTS = {
  [WATER_COST_TYPE]: WATER_DEFAULT_PER_PERSON_PER_DAY,
}

export interface FixedDailyCosts {
  waterPerPersonPerDay: number
  /** Why the built-in default was used, if it was. Empty = a real row priced. */
  warnings: string[]
}

// The cache holds the RAW rows, not derived costs: rows may carry a
// rate_currency (per-rate currency work), and the conversion target depends
// on the run — caching a converted number would leak one run's currency into
// the next. Keyed by organisation: each company has its own fixed costs
// (fixed_daily_costs.org_id), and one cache served every company's.
//
// The cache is per server instance: an edit clears the instance that served
// it at once (clearFixedCostsCache); another instance may price the old
// figure for up to CACHE_TTL.
type FixedCostRow = { id?: string; cost_type: string; cost_per_person_per_day: number | null; rate_currency?: string | null }
const cachedRows = new Map<string, { rows: FixedCostRow[]; fetchedAt: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

const fallback = (why: string): FixedDailyCosts => ({
  waterPerPersonPerDay: DEFAULTS[WATER_COST_TYPE],
  warnings: [`Water priced at the built-in ${DEFAULTS[WATER_COST_TYPE].toFixed(2)} per person per day: ${why}`],
})

/**
 * The water cost from already-fetched (and, when the run converts, already
 * converted) active rows. Pure.
 */
export function waterCostFromRows(rows: FixedCostRow[], opts: { converted?: boolean } = {}): FixedDailyCosts {
  const record = rows.find(r => isWaterCostType(r.cost_type))
  if (!record) return fallback(`no active "${WATER_COST_TYPE}" row in Rates › Fixed Costs`)
  const value = record.cost_per_person_per_day
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    // The normaliser nulls a row whose currency has no exchange rate.
    return fallback(opts.converted
      ? `the "${WATER_COST_TYPE}" row is in ${record.rate_currency ?? 'another currency'} and no exchange rate was available`
      : `the "${WATER_COST_TYPE}" row has no amount`)
  }
  return { waterPerPersonPerDay: Number(value), warnings: [] }
}

/**
 * Fetch fixed daily costs (water bottles) from the database.
 * Uses a 5-minute in-memory cache to avoid repeated DB queries.
 * Falls back to the built-in default, with a warning, if there is no row or
 * the DB is unavailable.
 *
 * NOTE: Tipping is handled separately via tipping_rates table.
 * Use getItemizedTippingRates() from lib/tipping-utils.ts for tips.
 */
export async function getFixedDailyCosts(
  /** Whose costs. No organisation, the built-in defaults. */
  orgId: string | null | undefined,
  /** Converts rows entered in another currency into the run currency —
   *  see lib/rates/rate-currency.ts. Omitted = rows are taken as-is. */
  normalizer?: RateNormalizer
): Promise<FixedDailyCosts> {
  let rows: FixedCostRow[]
  if (!orgId) return fallback('no company')

  const cached = cachedRows.get(orgId)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    rows = cached.rows
  } else {
    try {
      const { data, error } = await supabaseAdmin
        .from('fixed_daily_costs')
        // select('*') so this deploys safely before the rate_currency migration.
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)

      if (error) {
        console.warn('[FixedCosts] DB query failed, using defaults:', error.message)
        return fallback('the fixed costs could not be read')
      }
      rows = (data as FixedCostRow[]) || []
      cachedRows.set(orgId, { rows, fetchedAt: Date.now() })
    } catch (err: any) {
      console.warn('[FixedCosts] Exception fetching costs, using defaults:', err.message)
      return fallback('the fixed costs could not be read')
    }
  }

  const converted = normalizer
    ? (await normalizer.normalize('fixed_daily_costs', rows)) ?? rows
    : rows

  const result = waterCostFromRows(converted, { converted: Boolean(normalizer) })
  for (const w of result.warnings) console.warn(`[FixedCosts] ${w}`)
  return result
}

/** Clear the cache (e.g. after updating rates via the API) — one
 *  organisation's, or every one's. */
export function clearFixedCostsCache(orgId?: string) {
  // An entry fetched at time 0 is always stale: the next read refetches.
  if (orgId) cachedRows.set(orgId, { rows: [], fetchedAt: 0 })
  else cachedRows.clear()
}
