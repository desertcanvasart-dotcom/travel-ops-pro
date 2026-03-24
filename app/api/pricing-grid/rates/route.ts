// GET /api/pricing-grid/rates?tier=standard
// Fetches all available rate options from existing Supabase tables,
// structured by grid slot for dropdown population.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const tier = searchParams.get('tier') || 'standard'

    // Fetch all rate tables in parallel
    const [
      { data: transportRates },
      { data: guideRates },
      { data: airportRates },
      { data: hotelServiceRates },
      { data: tippingRates },
      { data: activityRates },
      { data: accommodationRates },
      { data: entranceFees },
      { data: mealRates },
      { data: cruiseRates },
    ] = await Promise.all([
      supabase.from('transportation_rates').select('*').eq('is_active', true),
      supabase.from('guide_rates').select('*').eq('is_active', true),
      supabase.from('airport_staff_rates').select('*').eq('is_active', true),
      supabase.from('hotel_staff_rates').select('*').eq('is_active', true),
      supabase.from('tipping_rates').select('*').eq('is_active', true),
      supabase.from('activity_rates').select('*').eq('is_active', true),
      supabase.from('accommodation_rates').select('*').eq('is_active', true).eq('tier', tier),
      supabase.from('entrance_fees').select('*').eq('is_active', true),
      supabase.from('meal_rates').select('*').eq('is_active', true),
      supabase.from('cruise_rates').select('*').eq('is_active', true).eq('tier', tier),
    ])

    // Map to RateOption format per slot
    const rates = {
      vehicle: (transportRates || [])
        .filter((r: any) => r.service_type === 'day_tour')
        .map((r: any) => ({
          id: r.id,
          name: `${r.vehicle_type || 'Vehicle'} (${r.capacity_min}-${r.capacity_max} pax)`,
          rateEur: toNum(r.base_rate_eur),
          rateNonEur: toNum(r.base_rate_non_eur || r.base_rate_eur),
          city: r.origin_city || r.city,
          details: r.vehicle_type,
          capacity_min: r.capacity_min,
          capacity_max: r.capacity_max,
          service_type: r.service_type,
        })),

      route: (transportRates || [])
        .filter((r: any) => r.service_type === 'intercity_transfer' || r.service_type === 'airport_transfer')
        .map((r: any) => ({
          id: r.id,
          name: `${r.origin_city || ''} → ${r.destination_city || ''}`.trim() || r.service_code,
          rateEur: toNum(r.base_rate_eur),
          rateNonEur: toNum(r.base_rate_non_eur || r.base_rate_eur),
          city: r.origin_city,
          details: `${r.service_type} | ${r.vehicle_type || ''}`,
          service_type: r.service_type,
        })),

      guide: (guideRates || []).map((r: any) => ({
        id: r.id,
        name: `${r.guide_language || 'Guide'} (${r.guide_type || 'Egyptologist'})`,
        rateEur: toNum(r.base_rate_eur || r.rate_eur),
        rateNonEur: toNum(r.base_rate_non_eur || r.rate_non_eur || r.base_rate_eur || r.rate_eur),
        city: r.city,
        details: r.guide_language,
      })),

      airport_services: (airportRates || []).map((r: any) => ({
        id: r.id,
        name: `${r.airport_code} - ${r.direction || 'both'}`,
        rateEur: toNum(r.rate_eur),
        rateNonEur: toNum(r.rate_eur),  // Airport rates are typically same for all
        city: r.airport_code,
        details: r.direction,
      })),

      hotel_services: (hotelServiceRates || []).map((r: any) => ({
        id: r.id,
        name: `${r.service_type || 'Hotel Service'}${r.destination ? ` (${r.destination})` : ''}`,
        rateEur: toNum(r.rate_eur),
        rateNonEur: toNum(r.rate_eur),
        category: r.hotel_category,
        details: r.description,
      })),

      tipping: (tippingRates || []).map((r: any) => ({
        id: r.id,
        name: r.role || r.service_code || 'Tip',
        rateEur: toNum(r.rate_eur || r.amount_eur),
        rateNonEur: toNum(r.rate_eur || r.amount_eur),
        details: r.description,
      })),

      boat_rides: (activityRates || [])
        .filter((r: any) => /boat|felucca|motor/i.test(r.activity_name || r.category || ''))
        .map((r: any) => ({
          id: r.id,
          name: r.activity_name,
          rateEur: toNum(r.rate_eur || r.base_rate_eur),
          rateNonEur: toNum(r.rate_non_eur || r.base_rate_non_eur || r.rate_eur || r.base_rate_eur),
          city: r.city,
          details: r.pricing_type,
        })),

      accommodation: (accommodationRates || []).map((r: any) => ({
        id: r.id,
        name: `${r.property_name} (${r.city})`,
        rateEur: toNum(r.pp_double_eur),
        rateNonEur: toNum(r.pp_double_non_eur),
        city: r.city,
        details: `${r.tier} | ${r.board_basis || 'RO'}`,
        board_basis: r.board_basis,
        single_supp_eur: toNum(r.single_supp_eur),
        single_supp_non_eur: toNum(r.single_supp_non_eur),
      })),

      entrance_fees: (entranceFees || []).map((r: any) => ({
        id: r.id,
        name: r.attraction_name,
        rateEur: toNum(r.eur_rate),
        rateNonEur: toNum(r.non_eur_rate),
        city: r.city,
        category: r.category,
      })),

      flights: [],  // Flights are manual entry

      experiences: (activityRates || [])
        .filter((r: any) => !/boat|felucca|motor/i.test(r.activity_name || r.category || ''))
        .map((r: any) => ({
          id: r.id,
          name: r.activity_name,
          rateEur: toNum(r.rate_eur || r.base_rate_eur),
          rateNonEur: toNum(r.rate_non_eur || r.base_rate_non_eur || r.rate_eur || r.base_rate_eur),
          city: r.city,
          details: r.pricing_type,
        })),

      meals: (mealRates || []).map((r: any) => ({
        id: r.id,
        name: `${r.meal_type} - ${r.restaurant_name || 'Restaurant'} (${r.city})`,
        rateEur: toNum(r.base_rate_eur || r.rate_eur),
        rateNonEur: toNum(r.base_rate_non_eur || r.rate_non_eur || r.base_rate_eur || r.rate_eur),
        city: r.city,
        category: r.meal_type,
        details: r.restaurant_name,
      })),

      water: [
        { id: 'water-standard', name: 'Water Bottles', rateEur: 0.50, rateNonEur: 0.50, details: 'Per person per day' }
      ],

      cruise: (cruiseRates || []).map((r: any) => ({
        id: r.id,
        name: `${r.ship_name} (${r.nights}N, ${r.cabin_type})`,
        rateEur: toNum(r.rate_double_eur || r.pp_double_eur),
        rateNonEur: toNum(r.rate_double_non_eur || r.pp_double_non_eur || r.rate_double_eur || r.pp_double_eur),
        details: `${r.route || ''} | ${r.season || ''} | ${r.cabin_type || 'Standard'}`,
        single_rate_eur: toNum(r.rate_single_eur),
        single_rate_non_eur: toNum(r.rate_single_non_eur),
      })),
    }

    return NextResponse.json({ success: true, data: rates })
  } catch (error: any) {
    console.error('Failed to fetch grid rates:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

function toNum(v: any): number {
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}
