// Hermetic rate-table fixtures for the day-based pricing engine.
//
// Schema mirrors the real Supabase tables that lib/auto-pricing-service.ts
// reads (verified column-by-column against the lookups). Each builder returns
// FRESH objects so tests can mutate without cross-contamination.
//
// fullRateTables()    — every lookup resolves to a real row (no fabrication).
// missingHotelTables() — drops accommodation_rates to force the DEFAULT_RATES
//                        hotel fallback (the fabrication Phase 1 must flip).
//
// See PRICING-HARNESS-PLAN.md (Layer 0).

import type { MockTables } from '../_mock-supabase'

export const TEMPLATE_ID = 'tpl-fixture-cairo-2d'

/** A minimal 2-day template: arrival + Cairo hotel night + sightseeing, then departure. */
function templateRow() {
  return {
    id: TEMPLATE_ID,
    template_name: 'Cairo Gateway 2D/1N',
    template_code: 'CAIRO-2D',
    duration_days: 2,
    tour_type: 'city_tour',
    category_id: 'cat-cairo',
    itinerary: [
      {
        day: 1,
        title: 'Arrival & Pyramids of Giza',
        city: 'Cairo',
        overnight_city: 'Cairo',
        accommodation_type: 'hotel',
        meals: { breakfast: 'none', lunch: 'external', dinner: 'none' },
        attractions: ['Giza Plateau'],
        services: {
          airport_arrival: true,
          airport_departure: false,
          hotel_checkin: true,
          hotel_checkout: false,
          guide_required: true,
        },
      },
      {
        day: 2,
        title: 'Departure',
        city: 'Cairo',
        overnight_city: 'Cairo',
        accommodation_type: 'none',
        meals: { breakfast: 'none', lunch: 'none', dinner: 'none' },
        attractions: [],
        services: {
          airport_arrival: false,
          airport_departure: true,
          hotel_checkin: false,
          hotel_checkout: true,
          guide_required: false,
        },
      },
    ],
  }
}

function accommodationRates() {
  return [
    {
      id: 'acc-cairo-std',
      tier: 'standard',
      is_active: true,
      city: 'Cairo',
      property_name: 'Cairo Standard Hotel',
      pp_double_eur: 85,
      pp_double_non_eur: 95,
      single_supp_eur: 45,
      single_supp_non_eur: 50,
      created_at: '2024-01-01T00:00:00Z',
    },
  ]
}

function entranceFees() {
  return [
    {
      id: 'ent-giza',
      attraction_name: 'Giza Plateau',
      is_active: true,
      eur_rate: 20,
      non_eur_rate: 30,
    },
  ]
}

function guideRates() {
  return [
    {
      id: 'guide-en',
      guide_language: 'English',
      tier: 'standard',
      is_active: true,
      base_rate_eur: 75,
      rate_eur: 75,
    },
  ]
}

function mealRates() {
  // After the PR-4 change to getMealRates (filter by tier, no multiplier),
  // the fixture needs one row per tier rather than a single synthetic row.
  // The numbers below are the OLD multiplier output (0.8 budget / 1.0
  // standard / 1.3 deluxe / 1.6 luxury × the original {30, 40}) baked in
  // as per-tier base rates, so existing golden snapshots remain unchanged.
  return [
    { id: 'meals-budget',   is_active: true, tier: 'budget',   lunch_rate_eur: 24, dinner_rate_eur: 32 },
    { id: 'meals-standard', is_active: true, tier: 'standard', lunch_rate_eur: 30, dinner_rate_eur: 40 },
    { id: 'meals-deluxe',   is_active: true, tier: 'deluxe',   lunch_rate_eur: 39, dinner_rate_eur: 52 },
    { id: 'meals-luxury',   is_active: true, tier: 'luxury',   lunch_rate_eur: 48, dinner_rate_eur: 64 },
  ]
}

function airportStaffRates() {
  return [
    { id: 'air-cai-arr', airport_code: 'CAI', direction: 'arrival', rate_eur: 25, is_active: true },
    { id: 'air-cai-dep', airport_code: 'CAI', direction: 'departure', rate_eur: 25, is_active: true },
  ]
}

function hotelStaffRates() {
  return [
    { id: 'hot-checkin', service_type: 'checkin_assist', hotel_category: 'all', rate_eur: 20, is_active: true },
    { id: 'hot-checkout', service_type: 'checkout_assist', hotel_category: 'all', rate_eur: 20, is_active: true },
    { id: 'hot-porter', service_type: 'porter', hotel_category: 'all', rate_eur: 15, is_active: true },
  ]
}

function transportationRates() {
  const tiers = {
    base_rate_eur: 70, base_rate_non_eur: 80,
    sedan_rate_eur: 70, sedan_rate_non_eur: 80,
    minivan_rate_eur: 85, minivan_rate_non_eur: 95,
    van_rate_eur: 100, van_rate_non_eur: 110,
    minibus_rate_eur: 120, minibus_rate_non_eur: 130,
    bus_rate_eur: 150, bus_rate_non_eur: 160,
    capacity_min: 1, capacity_max: 45,
  }
  return [
    {
      id: 'trn-cai-airport', service_code: 'CAI-AIRPORT', service_type: 'airport_transfer',
      vehicle_type: null, city: 'Cairo', origin_city: 'Cairo', destination_city: 'Cairo',
      duration: 'one_way', area: 'cairo', route_name: 'Cairo Airport Transfer',
      is_active: true, ...tiers,
    },
    {
      id: 'trn-cai-daytour', service_code: 'CAI-DAYTOUR', service_type: 'day_tour',
      vehicle_type: null, city: 'Cairo', origin_city: 'Cairo', destination_city: 'Cairo',
      duration: 'full_day', area: 'cairo', route_name: 'Cairo Day Tour',
      is_active: true, ...tiers,
    },
    // B3 (PR #9): per-day transport rule engine now distinguishes half_day
    // (4-hour) from day_tour (full_day), so Pyramids-area visits resolve to
    // half_day. Fixture must provide one or the test flags a transport hole.
    {
      id: 'trn-cai-halfday', service_code: 'CAI-HALFDAY', service_type: 'half_day',
      vehicle_type: null, city: 'Cairo', origin_city: 'Cairo', destination_city: 'Cairo',
      duration: 'half_day', area: 'pyramids', route_name: 'Cairo Half Day Pyramids',
      is_active: true, ...tiers,
    },
  ]
}

function tippingRates() {
  return [
    { id: 'tip-guide', role_type: 'guide', context: null, rate_eur: 10, rate_unit: 'per_day', service_code: 'TIP-GUIDE', is_active: true },
    { id: 'tip-driver', role_type: 'driver', context: null, rate_eur: 5, rate_unit: 'per_day', service_code: 'TIP-DRIVER', is_active: true },
  ]
}

function fixedDailyCosts() {
  return [
    { id: 'fdc-water', cost_type: 'Water Bottle', cost_per_person_per_day: 1, is_active: true },
  ]
}

/** Full dataset — every lookup resolves; result should be fully rate-backed. */
export function fullRateTables(): MockTables {
  return {
    tour_templates: [templateRow()],
    accommodation_rates: accommodationRates(),
    entrance_fees: entranceFees(),
    guide_rates: guideRates(),
    guides: [],
    meal_rates: mealRates(),
    airport_staff_rates: airportStaffRates(),
    hotel_staff_rates: hotelStaffRates(),
    transportation_rates: transportationRates(),
    tipping_rates: tippingRates(),
    fixed_daily_costs: fixedDailyCosts(),
    nile_cruises: [],
    b2b_pricing_rules: [],
  }
}

/** Same as full, but no hotel rate for Cairo → a hotel hole (was DEFAULT_RATES fabrication). */
export function missingHotelTables(): MockTables {
  return { ...fullRateTables(), accommodation_rates: [] }
}

/**
 * Full dataset with a Cairo accommodation_rates row for EVERY tier, so the
 * golden-basket drift guard can price budget/standard/deluxe/luxury cleanly.
 * (accommodation_rates is the only tier-keyed table this itinerary reads.)
 */
export function multiTierRateTables(): MockTables {
  return {
    ...fullRateTables(),
    accommodation_rates: [
      { id: 'acc-cairo-budget', tier: 'budget', is_active: true, city: 'Cairo', property_name: 'Cairo Budget Hotel', pp_double_eur: 50, pp_double_non_eur: 60, single_supp_eur: 25, single_supp_non_eur: 30, created_at: '2024-01-01T00:00:00Z' },
      { id: 'acc-cairo-standard', tier: 'standard', is_active: true, city: 'Cairo', property_name: 'Cairo Standard Hotel', pp_double_eur: 85, pp_double_non_eur: 95, single_supp_eur: 45, single_supp_non_eur: 50, created_at: '2024-01-01T00:00:00Z' },
      { id: 'acc-cairo-deluxe', tier: 'deluxe', is_active: true, city: 'Cairo', property_name: 'Cairo Deluxe Hotel', pp_double_eur: 130, pp_double_non_eur: 145, single_supp_eur: 65, single_supp_non_eur: 70, created_at: '2024-01-01T00:00:00Z' },
      { id: 'acc-cairo-luxury', tier: 'luxury', is_active: true, city: 'Cairo', property_name: 'Cairo Luxury Hotel', pp_double_eur: 200, pp_double_non_eur: 220, single_supp_eur: 100, single_supp_non_eur: 110, created_at: '2024-01-01T00:00:00Z' },
    ],
  }
}
