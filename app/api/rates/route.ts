// Rates API Endpoint
// Location: /app/api/rates/route.ts
// Updated to pull from actual resource management tables

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
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
        // ✅ Pull from hotel_contacts table
        const accommodationQuery = supabase
          .from('hotel_contacts')
          .select('*')
          .eq('is_active', true)
        
        if (city) {
          accommodationQuery.ilike('city', city)
        }
        
        const accommodationResult = await accommodationQuery
        
        // Transform hotel data to match rates format
        data = (accommodationResult.data || []).map(hotel => ({
          service_code: hotel.id,
          property_name: hotel.name,
          property_type: hotel.property_type,
          star_rating: hotel.star_rating,
          city: hotel.city,
          address: hotel.address,
          supplier_name: hotel.contact_person,
          notes: hotel.notes,
          // For now, set placeholder rates (you can add rate fields to hotel_contacts table later)
          base_rate_eur: 0,
          base_rate_non_eur: 0
        }))
        error = accommodationResult.error
        break

      case 'meal':
        // ✅ Pull from restaurant_contacts table
        const mealQuery = supabase
          .from('restaurant_contacts')
          .select('*')
          .eq('is_active', true)
        
        if (city) {
          mealQuery.ilike('city', city)
        }
        
        const mealResult = await mealQuery
        
        // Transform restaurant data to match rates format
        data = (mealResult.data || []).map(restaurant => ({
          service_code: restaurant.id,
          restaurant_name: restaurant.name,
          meal_type: restaurant.meal_types?.[0] || 'lunch',
          cuisine_type: restaurant.cuisine_type,
          restaurant_type: restaurant.restaurant_type,
          city: restaurant.city,
          supplier_name: restaurant.contact_person,
          notes: restaurant.notes,
          // Placeholder rates
          base_rate_eur: 0,
          base_rate_non_eur: 0,
          eur_rate: 0,
          non_eur_rate: 0
        }))
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
        // ✅ Pull from vehicles table
        const transportQuery = supabase
          .from('vehicles')
          .select('*')
          .eq('is_active', true)
        
        const transportResult = await transportQuery
        
        // Transform vehicle data to match rates format
        data = (transportResult.data || []).map(vehicle => ({
          service_code: vehicle.id,
          service_type: vehicle.name,
          vehicle_type: vehicle.vehicle_type,
          city: 'Cairo', // Default city, you can add city field to vehicles table
          capacity_min: 1,
          capacity_max: vehicle.passenger_capacity,
          supplier_name: vehicle.default_driver_name,
          notes: vehicle.notes,
          base_rate_eur: vehicle.daily_rate || 0,
          base_rate_non_eur: vehicle.daily_rate || 0,
          eur_rate: vehicle.daily_rate || 0,
          non_eur_rate: vehicle.daily_rate || 0
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
          guide_language: guide.languages?.[0] || 'English',
          guide_type: guide.specialties?.[0] || 'General',
          city: 'Cairo', // Default city, you can add city field to guides table
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

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid type parameter' },
          { status: 400 }
        )
    }

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
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