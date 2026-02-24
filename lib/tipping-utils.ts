// ============================================
// TIPPING UTILITIES
// Single source of truth for daily tipping rate calculations.
//
// Two modes of access:
// 1. getDailyTippingRate()      — flat total (backward compat, used by estimation paths)
// 2. getItemizedTippingRates()  — context-aware per-role rates (used by service creation)
//
// determineTipRolesForDay() is a pure function that maps day context flags
// to the tip roles that should be applied.
// ============================================

// ---- Types ----

export type TipRoleType = 'guide' | 'driver' | 'boat_crew' | 'porter' | 'hotel_staff' | 'restaurant' | 'other'
export type TipContext = 'day_tour' | 'half_day_tour' | 'cruise' | 'transfer' | 'airport' | 'hotel' | 'restaurant' | 'felucca' | 'motorboat'

export interface ItemizedTipRate {
  role_type: TipRoleType
  context: TipContext | null
  rate_eur: number          // Already tier-adjusted
  service_code: string
}

export interface ItemizedTippingRates {
  allRates: ItemizedTipRate[]
  /** Get tier-adjusted rate for a role+context.
   *  Falls back: exact role+context → role with context=null → 0 */
  getRate: (role: TipRoleType, context?: TipContext) => number
  /** Sum rates for multiple role lookups */
  sumRates: (roles: Array<{ role: TipRoleType; context?: TipContext; quantity?: number }>) => number
}

export interface DayTipContext {
  hasGuide: boolean
  hasDriver: boolean            // true unless free day or cruise-only
  hasAirportService: boolean    // arrival/departure/domestic flight
  airportServiceCount: number   // 1 for single, 2 for domestic flight (2 airports)
  hasHotelNight: boolean        // staying at hotel tonight
  isCruiseDay: boolean
  isTransferOnly: boolean       // departure/transfer with no sightseeing
  isFreeDay: boolean
}

export interface DayTipRole {
  role: TipRoleType
  context?: TipContext
  quantity: number
}

// ---- Constants ----

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

// ---- Flat total (backward compat for estimation paths) ----

/**
 * Fetch the total daily tipping rate from the `tipping_rates` table,
 * adjusted by tier multiplier. Sums ALL active per_day entries.
 *
 * Used by simple estimation paths that don't need per-role breakdown.
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

// ---- Itemized rates (context-aware) ----

/**
 * Fetch all active per_day tipping rates from the database, apply tier
 * multiplier to each, and return a structured object for per-role lookups.
 *
 * The returned object provides:
 * - allRates: full list of tier-adjusted rates
 * - getRate(role, context): look up a single role+context rate
 * - sumRates(roles): sum multiple lookups
 */
export async function getItemizedTippingRates(
  supabase: any,
  tier: string = 'standard'
): Promise<ItemizedTippingRates> {
  const { data: rates, error } = await supabase
    .from('tipping_rates')
    .select('role_type, context, rate_eur, rate_unit, service_code')
    .eq('is_active', true)

  if (error) {
    console.warn('[Tipping] Failed to fetch tipping_rates:', error.message)
    return buildEmptyRates()
  }

  const multiplier = TIPPING_TIER_MULTIPLIERS[tier] || 1.0

  const allRates: ItemizedTipRate[] = (rates || [])
    .filter((t: any) => t.rate_unit === 'per_day')
    .map((t: any) => ({
      role_type: t.role_type as TipRoleType,
      context: (t.context || null) as TipContext | null,
      rate_eur: Math.round((parseFloat(t.rate_eur) || 0) * multiplier),
      service_code: t.service_code || `TIP-${(t.role_type || 'OTHER').toUpperCase()}`,
    }))

  if (allRates.length === 0) {
    console.warn('⚠️ No per_day tipping rates found in tipping_rates table — tips will be €0')
  }

  return buildRatesObject(allRates)
}

function buildEmptyRates(): ItemizedTippingRates {
  return {
    allRates: [],
    getRate: () => 0,
    sumRates: () => 0,
  }
}

function buildRatesObject(allRates: ItemizedTipRate[]): ItemizedTippingRates {
  /**
   * Look up the tier-adjusted rate for a role + optional context.
   * Fallback chain: exact role+context → role with context=null → 0
   */
  const getRate = (role: TipRoleType, context?: TipContext): number => {
    // 1. Try exact match (role + context)
    if (context) {
      const exact = allRates.find(r => r.role_type === role && r.context === context)
      if (exact) return exact.rate_eur
    }
    // 2. Fallback to role with no context (default rate for that role)
    const fallback = allRates.find(r => r.role_type === role && !r.context)
    if (fallback) return fallback.rate_eur
    // 3. No rate found
    return 0
  }

  const sumRates = (roles: Array<{ role: TipRoleType; context?: TipContext; quantity?: number }>): number => {
    return roles.reduce((sum, r) => sum + getRate(r.role, r.context) * (r.quantity || 1), 0)
  }

  return { allRates, getRate, sumRates }
}

// ---- Day context → tip roles (pure function) ----

/**
 * Determine which tip roles apply for a given day based on what
 * services are present. Returns an array of { role, context, quantity }.
 */
export function determineTipRolesForDay(ctx: DayTipContext): DayTipRole[] {
  const tips: DayTipRole[] = []

  // Free days: no services, no tips
  if (ctx.isFreeDay) return tips

  // Guide tip
  if (ctx.hasGuide) {
    tips.push({
      role: 'guide',
      context: ctx.isCruiseDay ? 'cruise' : 'day_tour',
      quantity: 1,
    })
  }

  // Driver tip (whenever there's land transport — not on cruise-only days)
  if (ctx.hasDriver) {
    tips.push({
      role: 'driver',
      context: ctx.isTransferOnly ? 'transfer' : 'day_tour',
      quantity: 1,
    })
  }

  // Porter tip (at airports — per airport service)
  if (ctx.hasAirportService && ctx.airportServiceCount > 0) {
    tips.push({
      role: 'porter',
      context: 'airport',
      quantity: ctx.airportServiceCount,
    })
  }

  // Hotel staff tip (when staying at a hotel tonight)
  if (ctx.hasHotelNight) {
    tips.push({
      role: 'hotel_staff',
      context: 'hotel',
      quantity: 1,
    })
  }

  // Boat crew tip (on cruise days)
  if (ctx.isCruiseDay) {
    tips.push({
      role: 'boat_crew',
      context: 'cruise',
      quantity: 1,
    })
  }

  return tips
}

// ---- Formatting helpers ----

const ROLE_DISPLAY_NAMES: Record<TipRoleType, string> = {
  guide: 'Guide Tip',
  driver: 'Driver Tip',
  porter: 'Porter Tip',
  boat_crew: 'Boat Crew Tip',
  hotel_staff: 'Hotel Staff Tip',
  restaurant: 'Restaurant Tip',
  other: 'Tips',
}

export function formatTipServiceName(role: TipRoleType, context?: TipContext): string {
  return ROLE_DISPLAY_NAMES[role] || 'Tip'
}

export function formatTipNotes(role: TipRoleType, context?: TipContext, quantity?: number): string {
  const qtyNote = quantity && quantity > 1 ? ` x${quantity}` : ''
  const contextNote = context === 'airport' ? ' — airport assistance'
    : context === 'hotel' ? ' — hotel porterage'
    : context === 'cruise' ? ' — on board'
    : context === 'transfer' ? ' — transfer'
    : ''
  return `${role.replace(/_/g, ' ')} tip${contextNote}${qtyNote}`
}

export { TIPPING_TIER_MULTIPLIERS }
