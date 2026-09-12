// Rates API Endpoint
// Location: /app/api/rates/route.ts
// Updated to pull from actual resource management tables

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { getOrgRateCurrency, normaliseRateCurrency } from '@/lib/org-rate-currency'
import { createRateNormalizer, type RateCurrencyTable } from '@/lib/rates/rate-currency'

// Which rate table each ?type= reads, for the in_org_currency conversion below.
// Types missing here (guide = a VIEW over suppliers, service_fee) carry no
// per-row currency and pass through unchanged.
const TYPE_TABLE: Record<string, RateCurrencyTable> = {
  accommodation: 'accommodation_rates',
  meal: 'meal_rates',
  entrance: 'entrance_fees',
  transportation: 'transportation_rates',
  airport_staff: 'airport_staff_rates',
  hotel_staff: 'hotel_staff_rates',
  cruises: 'nile_cruises',
  sleeping_trains: 'sleeping_train_rates',
  trains: 'train_rates',
  tipping: 'tipping_rates',
}

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

    let data: any[] = []
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
          // The vehicles list (lib/rates/vehicle-bands) — an agency-added
          // vehicle is here and nowhere else; the five columns below are the
          // mirror of the presets for readers not yet converted.
          vehicles: rate.vehicles ?? null,
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
        // The RATE table, not the guides supplier view. The view has no
        // language or price on it (languages/daily_rate are null on every
        // row), so this hub showed each guide as 'English' at 0 while the
        // guide rates page — and the pricing engine — read guide_rates with
        // the real language and rate. Same class as the accommodation fix
        // above: two screens, two answers.
        const guideQuery = supabase
          .from('guide_rates')
          .select('*')
          .eq('is_active', true)

        if (city) {
          guideQuery.ilike('city', city)
        }

        const guideResult = await guideQuery
        data = guideResult.data || []
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
          // The rate names WHICH train it prices; the hub could not show it.
          .select('*, supplier_properties(name)')
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
          // The rate names WHICH train it prices; the hub could not show it.
          .select('*, supplier_properties(name)')
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

    // A PRICING screen may ask for the rows in the org's rate currency
    // (in_org_currency=true). The tour-builder's selectors sum what they get
    // and post it to /api/tours/calculate, which adds numbers up in memory —
    // so a raw 5000 EGP dinner became 5000 dollars in the sidebar. Converted
    // here, once, through the engine's own normaliser; each converted row
    // says what it was entered in, and an unconvertible one comes back
    // unpriced. Without the flag — the rates hub — rows stay as typed: a
    // rates TABLE never converts.
    const table = TYPE_TABLE[type]
    if (searchParams.get('in_org_currency') === 'true' && table) {
      const run = await getOrgRateCurrency(supabase, await getCurrentOrgId())
      const normalizer = createRateNormalizer(run)
      const converted = (await normalizer.normalize(table, data as Record<string, unknown>[])) || []
      const missed = new Set(normalizer.misses.map(m => String(m.id)))
      data = converted.map((row, i) => {
        const original = normaliseRateCurrency((data[i] as any)?.rate_currency)
        if (missed.has(String(row.id))) return { ...row, converted_from: (data[i] as any)?.rate_currency ?? null, conversion_missing: true }
        if (original && original !== run) return { ...row, rate_currency: run, converted_from: original }
        return row
      })
      return NextResponse.json({ success: true, data, count: data.length, currency: run })
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