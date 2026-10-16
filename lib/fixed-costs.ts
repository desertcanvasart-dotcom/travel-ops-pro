import { createClient } from '@supabase/supabase-js'
import type { RateNormalizer } from '@/lib/rates/rate-currency'
import { WATER_COST_TYPE, WATER_DEFAULT_PER_PERSON_PER_DAY, isWaterCostType, isTipsCostType } from '@/lib/fixed-cost-types'

export { WATER_COST_TYPE, isWaterCostType }

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// Fixed daily costs (Rates › Fixed Costs)
// ============================================
// Pricing charges EVERY active cost in this table, each as its own named line,
// per person for each sightseeing day (the day count water has always used).
// Each is converted from its own currency. "Water Bottle" (case and spacing
// ignored) is the one with a safety net: with no usable row it is priced at the
// built-in default (2.00 in the run currency) and `warnings` says why. Any other
// cost has no fallback — no row, no line — and a row whose currency cannot be
// converted is not charged and raises a warning naming the cost. An inactive row
// never charges. Tips are priced from tipping_rates, never from here.
// ============================================

// Default fallback values (used when DB has no data)
const DEFAULTS = {
  [WATER_COST_TYPE]: WATER_DEFAULT_PER_PERSON_PER_DAY,
}

export interface FixedCostItem {
  /** The cost's name — the line's name for every cost but water. */
  name: string
  /** Per person, per sightseeing day, in the run currency. */
  perPersonPerDay: number
  isWater: boolean
}

export interface FixedDailyCosts {
  waterPerPersonPerDay: number
  /** Every cost to charge (water first, then the others by name). */
  items: FixedCostItem[]
  /** The items except water — each is its own extra line. */
  extraItems: FixedCostItem[]
  /** Why the built-in default was used, or a cost was not charged. Empty = all priced. */
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
type FixedCostRow = { id?: string; cost_type: string; cost_per_person_per_day: number | null; rate_currency?: string | null; is_active?: boolean | null }
const cachedRows = new Map<string, { rows: FixedCostRow[]; fetchedAt: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

const fallback = (why: string): FixedDailyCosts => ({
  waterPerPersonPerDay: DEFAULTS[WATER_COST_TYPE],
  items: [{ name: WATER_COST_TYPE, perPersonPerDay: DEFAULTS[WATER_COST_TYPE], isWater: true }],
  extraItems: [],
  warnings: [`Water priced at the built-in ${DEFAULTS[WATER_COST_TYPE].toFixed(2)} per person per day: ${why}`],
})

/**
 * The water cost from already-fetched (and, when the run converts, already
 * converted) active rows. Pure.
 */
export function waterCostFromRows(rows: FixedCostRow[], opts: { converted?: boolean } = {}): { waterPerPersonPerDay: number; warnings: string[] } {
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
 * Every cost to charge, from already-fetched (and, when the run converts,
 * already converted) rows. Pure. Water comes first, from waterCostFromRows (so
 * its fallback and warning are unchanged); every other active row is its own
 * item. A zero amount adds no line; an amount that cannot be priced is not
 * charged and warns, naming the cost.
 */
export function fixedCostItemsFromRows(rows: FixedCostRow[], opts: { converted?: boolean } = {}): FixedDailyCosts {
  const active = rows.filter(r => r.is_active !== false)
  const water = waterCostFromRows(active, opts)
  const items: FixedCostItem[] = [{ name: WATER_COST_TYPE, perPersonPerDay: water.waterPerPersonPerDay, isWater: true }]
  const warnings = [...water.warnings]
  const others = active
    .filter(r => !isWaterCostType(r.cost_type) && !isTipsCostType(r.cost_type) && String(r.cost_type ?? '').trim() !== '')
    .sort((a, b) => a.cost_type.localeCompare(b.cost_type))
  for (const row of others) {
    const name = row.cost_type.trim().replace(/\s+/g, ' ')
    const raw = row.cost_per_person_per_day
    const missing = raw === null || raw === undefined
    const value = missing ? NaN : Number(raw)
    if (!Number.isFinite(value) || value < 0) {
      warnings.push(missing && opts.converted
        ? `"${name}" not charged: the row is in ${row.rate_currency ?? 'another currency'} and no exchange rate was available`
        : `"${name}" not charged: the row has no usable amount`)
      continue
    }
    if (value === 0) continue
    items.push({ name, perPersonPerDay: value, isWater: false })
  }
  return {
    waterPerPersonPerDay: water.waterPerPersonPerDay,
    items,
    extraItems: items.filter(i => !i.isWater),
    warnings,
  }
}

/**
 * Fetch the fixed daily costs (water and every other active cost) from the database.
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

  const result = fixedCostItemsFromRows(converted, { converted: Boolean(normalizer) })
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
