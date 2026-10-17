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
//
// Rate Unit (Rates › Tipping). Every unit the page offers is priced — the
// engine used to read `per_day` rows only, so a per-service porter tip or a
// per-cruise crew tip was saved, shown and never charged. priceTip() is the
// one rule (one occurrence = one day the role is on duty):
//   per_day      once that day, however many services the role does
//   per_service  once per service that day (two airports = two porter tips)
//   per_night    once per night the role covers — a hotel or cruise night is
//                the day it is charged on
//   per_cruise   once per cruise, on its first day
//   per_person   per traveller, that day
// An agency-added unit has no rule here and stays unpriced, as before.
// ============================================

import type { RateNormalizer } from '@/lib/rates/rate-currency'

// Matches no organisation: tips are one company's (tipping_rates.org_id), and
// a read with no organisation reads none.
const NO_ORG = '00000000-0000-0000-0000-000000000000'

// ---- Types ----

// 'hotel_assistant' was 'hotel_staff' until the vocabulary was unified: the
// suppliers screen, the rate screens and the expense categories now all call
// this person an assistant, and a tip role that said otherwise was the last
// place the old word survived. tipping_rates was empty, so no data moved.
export type TipRoleType = 'guide' | 'driver' | 'boat_crew' | 'porter' | 'hotel_assistant' | 'restaurant' | 'other'
export type TipContext = 'day_tour' | 'half_day_tour' | 'cruise' | 'transfer' | 'airport' | 'hotel' | 'restaurant' | 'felucca' | 'motorboat'

export const TIP_RATE_UNITS = ['per_day', 'per_service', 'per_cruise', 'per_night', 'per_person'] as const
export type TipRateUnit = (typeof TIP_RATE_UNITS)[number]

export function isTipRateUnit(unit: unknown): unit is TipRateUnit {
  return (TIP_RATE_UNITS as readonly unknown[]).includes(unit)
}

export interface ItemizedTipRate {
  role_type: TipRoleType
  context: TipContext | null
  /** Where this rate applies; null = anywhere (the country-wide rate). */
  city: string | null
  rate_eur: number          // Already tier-adjusted
  /** How the rate is counted (Rates › Tipping, Rate Unit). */
  rate_unit: TipRateUnit
  service_code: string
}

/** One tip line for one occurrence (a day the role is on duty). */
export interface TipLine {
  /** Per-person amount for a per_person tip, else the group amount per unit. */
  unitCost: number
  quantity: number
  /** unitCost × quantity: per person for a per_person tip, else for the group. */
  total: number
  /** true = charged per traveller (scales with pax). */
  perPax: boolean
}

/**
 * A tip priced by its unit for one occurrence. `quantity` is how many
 * services the role does that day (determineTipRolesForDay); `cruiseStart`
 * says whether this is the first day of a cruise (undefined = not known,
 * read as yes). Null = nothing to charge today.
 */
export function priceTip(
  tip: { rate_eur: number; rate_unit: TipRateUnit },
  occurrence: { quantity?: number; cruiseStart?: boolean }
): TipLine | null {
  const rate = Number(tip.rate_eur) || 0
  if (rate <= 0) return null
  const services = Math.max(1, Math.floor(occurrence.quantity ?? 1) || 1)
  switch (tip.rate_unit) {
    case 'per_service':
      return { unitCost: rate, quantity: services, total: roundCents(rate * services), perPax: false }
    case 'per_cruise':
      if (occurrence.cruiseStart === false) return null
      return { unitCost: rate, quantity: 1, total: rate, perPax: false }
    case 'per_person':
      return { unitCost: rate, quantity: 1, total: rate, perPax: true }
    case 'per_day':
    case 'per_night':
    default:
      return { unitCost: rate, quantity: 1, total: rate, perPax: false }
  }
}

/** How a tip sits in the Pricing Grid, which prices each day's picks: a
 *  per_person tip per traveller, every other unit once per pick per day for
 *  the group (the operator picks the days — a per-cruise tip on one day of
 *  the cruise, which its label says). An unknown unit keeps the row's rule. */
export function tipGridOption(rateUnit: unknown): { pricing_basis?: 'flat' | 'per_person'; unit_capacity?: null; unitLabel: string | null } {
  switch (rateUnit) {
    case 'per_person': return { pricing_basis: 'per_person', unit_capacity: null, unitLabel: 'Per person' }
    case 'per_day': return { pricing_basis: 'flat', unit_capacity: null, unitLabel: 'Per day, for the group' }
    case 'per_service': return { pricing_basis: 'flat', unit_capacity: null, unitLabel: 'Per service, for the group' }
    case 'per_night': return { pricing_basis: 'flat', unit_capacity: null, unitLabel: 'Per night, for the group' }
    case 'per_cruise': return { pricing_basis: 'flat', unit_capacity: null, unitLabel: 'Per cruise, for the group — pick it on one day of the cruise' }
    default: return { unitLabel: null }
  }
}

/** The code a tip gets when Service Code is left blank: role, context and
 *  CITY. Without the city, "guide / day tour / Cairo" and then
 *  "guide / day tour / Aswan" both became TIP-GUIDE-DAY_TOUR — the server
 *  allows the pair (the city is part of its duplicate check), the database
 *  did not (UNIQUE(org_id, service_code)), and the second save was a 500. */
export function tipServiceCode(role: string, context?: string | null, city?: string | null): string {
  const part = (v: string | null | undefined) => String(v ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return ['TIP', part(role) || 'OTHER', part(context) || 'GEN', part(city)].filter(Boolean).join('-')
}

/** Currency rounding — tips are money, not whole units (2.50 stays 2.50). */
function roundCents(n: number): number {
  return Math.round(n * 100) / 100
}

export interface ItemizedTippingRates {
  allRates: ItemizedTipRate[]
  /** The ONE row that applies to a role, in a city (same chain as getRate),
   *  with its unit — for a caller that prices by priceTip(). */
  getTip: (role: TipRoleType, context?: TipContext, city?: string | null) => ItemizedTipRate | null
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
  /** Whose tips. */
  orgId: string | null | undefined,
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
    .eq('org_id', orgId ?? NO_ORG)
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
  return roundCents(baseDailyTips * multiplier)
}

// ---- Itemized rates (context-aware) ----

/**
 * Fetch all active tipping rates from the database, apply tier multiplier to
 * each, and return a structured object for per-role lookups. Every unit the
 * Tipping page offers is kept (see priceTip); an agency-added one is not.
 *
 * The returned object provides:
 * - allRates: full list of tier-adjusted rates
 * - getRate(role, context): look up a single role+context rate
 * - sumRates(roles): sum multiple lookups
 */
export async function getItemizedTippingRates(
  supabase: any,
  /** Whose tips. */
  orgId: string | null | undefined,
  tier: string = 'standard',
  /** Converts rows entered in another currency into the run currency —
   *  see lib/rates/rate-currency.ts. Omitted = rows are taken as-is. */
  normalizer?: RateNormalizer,
  /** The group size, for getRate()'s per_person rows (getTip/priceTip callers
   *  apply pax themselves). Omitted = 1. */
  opts: { pax?: number } = {}
): Promise<ItemizedTippingRates> {
  const { data, error } = await supabase
    .from('tipping_rates')
    .select('*')
    .eq('org_id', orgId ?? NO_ORG)
    .eq('is_active', true)

  if (error) {
    console.warn('[Tipping] Failed to fetch tipping_rates:', error.message)
    return buildEmptyRates()
  }
  const rates = normalizer ? await normalizer.normalize('tipping_rates', data) : data

  return buildRatesObject(itemizeTipRows(rates || [], tier), opts)
}

/** Active rows as tier-adjusted rates: every known unit, rounded to cents
 *  (a whole-unit Math.round charged a 2.50 tip as 3). */
export function itemizeTipRows(rows: any[], tier: string = 'standard'): ItemizedTipRate[] {
  const multiplier = TIPPING_TIER_MULTIPLIERS[tier] || 1.0
  const unknown = rows.filter((t: any) => !isTipRateUnit(t.rate_unit))
  if (unknown.length > 0) {
    console.warn(`[Tipping] ${unknown.length} tip(s) with a unit the engine has no rule for (${[...new Set(unknown.map((t: any) => String(t.rate_unit)))].join(', ')}) are not priced`)
  }
  const allRates: ItemizedTipRate[] = rows
    .filter((t: any) => isTipRateUnit(t.rate_unit))
    .map((t: any) => ({
      role_type: t.role_type as TipRoleType,
      context: (t.context || null) as TipContext | null,
      city: (t.city || null) as string | null,
      rate_eur: roundCents((parseFloat(t.rate_eur) || 0) * multiplier),
      rate_unit: t.rate_unit as TipRateUnit,
      service_code: t.service_code || `TIP-${(t.role_type || 'OTHER').toUpperCase()}`,
    }))

  if (allRates.length === 0) {
    console.warn('[Tipping] No tipping rates found in tipping_rates table — tips will be 0')
  }
  return allRates
}

function buildEmptyRates(): ItemizedTippingRates {
  return {
    allRates: [],
    getTip: () => null,
    getRate: () => 0,
    sumRates: () => 0,
  }
}

export function buildRatesObject(allRates: ItemizedTipRate[], opts: { pax?: number } = {}): ItemizedTippingRates {
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

  const getTip = (role: TipRoleType, context?: TipContext, city?: string | null): ItemizedTipRate | null => {
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
      if (hit) return hit
    }
    return null
  }

  // getRate answers "what does this role cost per occurrence?" for callers
  // that multiply by the services count themselves and add a group cost
  // (the AI itinerary and cruise builders). It follows the unit as far as
  // that shape allows: a per_cruise tip is charged on the FIRST ask only —
  // one rates object is built per cruise / per itinerary — and a per_person
  // tip is the rate × the group size this object was built with.
  const cruiseCharged = new Set<ItemizedTipRate>()
  const pax = Math.max(1, Math.floor(opts.pax ?? 1) || 1)
  const getRate = (role: TipRoleType, context?: TipContext, city?: string | null): number => {
    const hit = getTip(role, context, city)
    if (!hit) return 0
    if (hit.rate_unit === 'per_cruise') {
      if (cruiseCharged.has(hit)) return 0
      cruiseCharged.add(hit)
    }
    if (hit.rate_unit === 'per_person') return roundCents(hit.rate_eur * pax)
    return hit.rate_eur
  }

  const sumRates = (
    roles: Array<{ role: TipRoleType; context?: TipContext; quantity?: number }>,
    city?: string | null
  ): number => {
    return roles.reduce((sum, r) => sum + getRate(r.role, r.context, city) * (r.quantity || 1), 0)
  }

  return { allRates, getTip, getRate, sumRates }
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
