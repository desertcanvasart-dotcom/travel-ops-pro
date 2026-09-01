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

import type { RateNormalizer } from '@/lib/rates/rate-currency'

// ---- Types ----

// 'hotel_assistant' was 'hotel_staff' until the vocabulary was unified: the
// suppliers screen, the rate screens and the expense categories now all call
// this person an assistant, and a tip role that said otherwise was the last
// place the old word survived. tipping_rates was empty, so no data moved.
export type TipRoleType = 'guide' | 'driver' | 'boat_crew' | 'porter' | 'hotel_assistant' | 'restaurant' | 'other'
export type TipContext = 'day_tour' | 'half_day_tour' | 'cruise' | 'transfer' | 'airport' | 'hotel' | 'restaurant' | 'felucca' | 'motorboat'

export interface ItemizedTipRate {
  role_type: TipRoleType
  context: TipContext | null
  /** Where this rate applies; null = anywhere (the country-wide rate). */
  city: string | null
  rate_eur: number          // Already tier-adjusted
  service_code: string
}

export interface ItemizedTippingRates {
  allRates: ItemizedTipRate[]
  /** Get the tier-adjusted rate for a role, in a city.
   *
   *  Most specific wins, and only ONE row is ever charged:
   *    role+context+city → role+context anywhere →
   *    role+city → role anywhere → 0
   *
   *  Omitting the city is the pre-city behaviour: only country-wide rows
   *  match, so every existing itinerary prices exactly as before. */
  getRate: (role: TipRoleType, context?: TipContext, city?: string | null) => number
  /** Sum rates for multiple role lookups, all in the same city. */
  sumRates: (
    roles: Array<{ role: TipRoleType; context?: TipContext; quantity?: number }>,
    city?: string | null
  ) => number
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
 * Tier multipliers for tipping rates.
 * DISABLED: Tipping rates are now used directly from the database
 * as configured in the Rates > Tipping UI. No code-level adjustment.
 * All tiers use multiplier 1.0 (DB values as-is).
 *
 * Previously: budget=0.8, standard=1.0, deluxe=1.2, luxury=1.5
 */
const TIPPING_TIER_MULTIPLIERS: Record<string, number> = {
  budget: 1.0,
  standard: 1.0,
  deluxe: 1.0,
  luxury: 1.0,
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
  tier: string = 'standard',
  /** Converts rows entered in another currency into the run currency —
   *  see lib/rates/rate-currency.ts. Omitted = rows are taken as-is. */
  normalizer?: RateNormalizer
): Promise<number> {
  const { data, error } = await supabase
    .from('tipping_rates')
    // select('*') so this deploys safely whether or not the rate_currency
    // migration has been applied yet (an explicitly named missing column errors).
    .select('*')
    .eq('is_active', true)

  if (error) {
    console.warn('[Tipping] Failed to fetch tipping_rates:', error.message)
    return 0
  }
  const rates = normalizer ? await normalizer.normalize('tipping_rates', data) : data

  // ONE row per role+context, never a Cairo rate plus an Aswan rate on the
  // same day. This path has no city to match on (it is the flat, trip-level
  // estimate), so it charges the country-wide row for each group and skips
  // groups that only have city-specific rows — an over-estimate would be
  // invented money, and this helper cannot know which city to pick.
  const perDay = (rates || []).filter((t: any) => t.rate_unit === 'per_day')
  const groups = new Map<string, any[]>()
  for (const t of perDay) {
    const key = `${t.role_type ?? ''}|${t.context ?? ''}`
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  let skipped = 0
  let baseDailyTips = 0
  for (const [, rows] of groups) {
    const countryWide = rows.find((t: any) => !t.city)
    if (countryWide) {
      baseDailyTips += parseFloat(countryWide.rate_eur) || 0
    } else {
      skipped += 1
    }
  }
  if (skipped > 0) {
    console.warn(
      `[Tipping] ${skipped} role(s) have only city-specific rates and were skipped by the flat ` +
      `estimate — use getItemizedTippingRates(), which resolves per day and per city.`
    )
  }

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
  tier: string = 'standard',
  /** Converts rows entered in another currency into the run currency —
   *  see lib/rates/rate-currency.ts. Omitted = rows are taken as-is. */
  normalizer?: RateNormalizer
): Promise<ItemizedTippingRates> {
  const { data, error } = await supabase
    .from('tipping_rates')
    .select('*')
    .eq('is_active', true)

  if (error) {
    console.warn('[Tipping] Failed to fetch tipping_rates:', error.message)
    return buildEmptyRates()
  }
  const rates = normalizer ? await normalizer.normalize('tipping_rates', data) : data

  const multiplier = TIPPING_TIER_MULTIPLIERS[tier] || 1.0

  const allRates: ItemizedTipRate[] = (rates || [])
    .filter((t: any) => t.rate_unit === 'per_day')
    .map((t: any) => ({
      role_type: t.role_type as TipRoleType,
      context: (t.context || null) as TipContext | null,
      city: (t.city || null) as string | null,
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
   * Look up the tier-adjusted rate for a role, in a city.
   *
   * Most specific first, and exactly ONE row is charged. That "one row" part
   * is the whole point: the naive reading of a city column — sum every active
   * row — would bill a Cairo driver tip AND an Aswan driver tip on every
   * single day of the trip.
   *
   * Chain: role+context+city → role+context anywhere →
   *        role+city → role anywhere → 0
   *
   * A blank city on a row keeps the meaning it has always had: anywhere. With
   * no city passed in, only those rows match, so an itinerary priced before
   * this column existed prices identically after it.
   */
  const norm = (c?: string | null) => (c || '').trim().toLowerCase()

  const getRate = (role: TipRoleType, context?: TipContext, city?: string | null): number => {
    const here = norm(city)
    const inCity = (r: ItemizedTipRate) => here !== '' && norm(r.city) === here
    const anywhere = (r: ItemizedTipRate) => !r.city

    const candidates: Array<(r: ItemizedTipRate) => boolean> = [
      r => r.role_type === role && !!context && r.context === context && inCity(r),
      r => r.role_type === role && !!context && r.context === context && anywhere(r),
      r => r.role_type === role && !r.context && inCity(r),
      r => r.role_type === role && !r.context && anywhere(r),
    ]
    for (const match of candidates) {
      const hit = allRates.find(match)
      if (hit) return hit.rate_eur
    }
    return 0
  }

  const sumRates = (
    roles: Array<{ role: TipRoleType; context?: TipContext; quantity?: number }>,
    city?: string | null
  ): number => {
    return roles.reduce((sum, r) => sum + getRate(r.role, r.context, city) * (r.quantity || 1), 0)
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
      role: 'hotel_assistant',
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
  hotel_assistant: 'Hotel Assistant Tip',
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
