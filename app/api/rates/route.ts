// Rates API Endpoint
// Location: /app/api/rates/route.ts
// Updated to pull from actual resource management tables

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const city = searchParams.get('city')

    if (!type) {
      return NextResponse.json(
        { success: false, error: 'Type parameter is required' },
        { status: 400 }
      )
    }

    let data = []
    let error = null

    switch (type) {
      case 'accommodation':
        // The RATE table, not hotel_contacts. This used to read the supplier
        // CONTACT directory and hand back each entry as a rate priced at
        // base_rate_eur: 0 — so the rates hub counted 13 "hotels" that were
        // really contact cards, while the hotels rate page (which reads this
        // table) correctly showed none. Two screens, two answers, and the
        // fabricated zeros looked like real prices.
        const accommodationQuery = supabase
          .from('accommodation_rates')
          .select('*')
          .eq('is_active', true)

        if (city) {
          accommodationQuery.ilike('city', city)
        }

        const accommodationResult = await accommodationQuery
        data = accommodationResult.data || []
        error = accommodationResult.error
        break

      case 'meal':
        // The RATE table, not restaurant_contacts — see the note above. The
        // 26 "meals" the hub listed were the restaurant contact directory,
        // every one of them priced at zero.
        const mealQuery = supabase
          .from('meal_rates')
          .select('*')
          .eq('is_active', true)

        if (city) {
          mealQuery.ilike('city', city)
        }

        const mealResult = await mealQuery
        data = mealResult.data || []
        error = mealResult.error
        break

      case 'entrance':
        // ✅ Keep entrance_fees table (already correct)
        const entranceQuery = supabase
          .from('entrance_fees')
          .select('*')
        
        if (city) {
          entranceQuery.eq('city', city)
        }
        
        const entranceResult = await entranceQuery
        data = entranceResult.data || []
        error = entranceResult.error
        break

      case 'transportation':
        // ✅ Pull from transportation_rates table (one row per service with tiered vehicle rates)
        const transportQuery = supabase
          .from('transportation_rates')
          .select('*')
          .eq('is_active', true)

        if (city) {
          transportQuery.eq('city', city)
        }

        const transportResult = await transportQuery.order('city').order('service_type')

        data = (transportResult.data || []).map((rate: any) => ({
          service_code: rate.service_code || rate.id,
          // The row's own entry currency — a transform must not strip it
          // (the attractions round-trip bug, one route over).
          rate_currency: rate.rate_currency ?? null,
          service_type: rate.service_type,
          city: rate.city,
          origin_city: rate.origin_city,
          destination_city: rate.destination_city,
          supplier_name: rate.supplier_name,
          notes: rate.notes,
          includes: rate.includes,
          sedan_rate_eur: rate.sedan_rate_eur,
          minivan_rate_eur: rate.minivan_rate_eur,
          van_rate_eur: rate.van_rate_eur,
          minibus_rate_eur: rate.minibus_rate_eur,
          bus_rate_eur: rate.bus_rate_eur,
          sedan_rate_non_eur: rate.sedan_rate_non_eur,
          minivan_rate_non_eur: rate.minivan_rate_non_eur,
          van_rate_non_eur: rate.van_rate_non_eur,
          minibus_rate_non_eur: rate.minibus_rate_non_eur,
          bus_rate_non_eur: rate.bus_rate_non_eur
        }))
        error = transportResult.error
        break

      case 'guide':
        // ✅ Pull from guides table
        const guideQuery = supabase
          .from('guides')
          .select('*')
          .eq('is_active', true)
        
        const guideResult = await guideQuery
        
        // Transform guide data to match rates format
        data = (guideResult.data || []).map(guide => ({
          service_code: guide.id,
          // Guides here come from the suppliers view, which has no per-rate
          // currency; null = org rate currency, honestly.
          rate_currency: null,
          guide_language: guide.languages?.[0] || 'English',
          guide_type: guide.specialties?.[0] || 'General',
          city: 'Cairo',
          tour_duration: 'full_day',
          notes: `${guide.name} - ${guide.certification_number || ''}`,
          base_rate_eur: guide.daily_rate || 0,
          base_rate_non_eur: guide.daily_rate || 0,
          eur_rate: guide.daily_rate || 0,
          non_eur_rate: guide.daily_rate || 0
        }))
        error = guideResult.error
        break

      case 'service':
      case 'service_fee':
        // Keep service_fees table if it exists
        const serviceQuery = supabase
          .from('service_fees')
          .select('*')
          .eq('is_active', true)
        
        const serviceResult = await serviceQuery
        data = serviceResult.data || []
        error = serviceResult.error
        break

      // ============================================
      // NEW RATE TYPES
      // ============================================

      case 'airport_staff':
        // ✅ Pull from airport_staff_rates table
        const airportStaffQuery = supabase
          .from('airport_staff_rates')
          .select('*')
          .eq('is_active', true)
          .order('airport_code')
          .order('service_type')
        
        const airportStaffResult = await airportStaffQuery
        data = airportStaffResult.data || []
        error = airportStaffResult.error
        break

      case 'hotel_staff':
        // ✅ Pull from hotel_staff_rates table
        const hotelStaffQuery = supabase
          .from('hotel_staff_rates')
          .select('*')
          .eq('is_active', true)
          .order('service_type')
          .order('hotel_category')
        
        const hotelStaffResult = await hotelStaffQuery
        data = hotelStaffResult.data || []
        error = hotelStaffResult.error
        break

      case 'cruises':
        // ✅ Pull from nile_cruises table
        const cruisesQuery = supabase
          .from('nile_cruises')
          .select('*')
          .eq('is_active', true)
          .order('ship_name')
          .order('cabin_type')
        
        const cruisesResult = await cruisesQuery
        data = cruisesResult.data || []
        error = cruisesResult.error
        break

      case 'sleeping_trains':
        // ✅ Pull from sleeping_train_rates table
        const sleepingTrainsQuery = supabase
          .from('sleeping_train_rates')
          .select('*')
          .eq('is_active', true)
          .order('origin_city')
          .order('destination_city')
        
        const sleepingTrainsResult = await sleepingTrainsQuery
        data = sleepingTrainsResult.data || []
        error = sleepingTrainsResult.error
        break

      case 'trains':
        // ✅ Pull from train_rates table
        const trainsQuery = supabase
          .from('train_rates')
          .select('*')
          .eq('is_active', true)
          .order('origin_city')
          .order('destination_city')
        
        const trainsResult = await trainsQuery
        data = trainsResult.data || []
        error = trainsResult.error
        break

      case 'tipping':
        // ✅ Pull from tipping_rates table
        const tippingQuery = supabase
          .from('tipping_rates')
          .select('*')
          .eq('is_active', true)
          .order('role_type')
          .order('context')
        
        const tippingResult = await tippingQuery
        data = tippingResult.data || []
        error = tippingResult.error
        break

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid type parameter' },
          { status: 400 }
        )
    }

    if (error) {
      console.error('Supabase error:', error)
      // Return empty array instead of error for missing tables
      return NextResponse.json({
        success: true,
        data: [],
        count: 0
      })
    }

    return NextResponse.json({
      success: true,
      data: data,
      count: data.length
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch rates' 
      },
      { status: 500 }
    )
  }
}