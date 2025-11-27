// ============================================
// API Route: /api/resources
// ============================================
// Main endpoint to fetch all resource types
// GET: Returns guides, vehicles, hotels, restaurants, airport staff, hotel staff
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const city = searchParams.get('city')
    const isActive = searchParams.get('is_active')

    if (!type) {
      return NextResponse.json(
        { success: false, error: 'Type parameter is required' },
        { status: 400 }
      )
    }

    let data = []
    let error = null

    switch (type) {
      case 'guides':
        let guidesQuery = supabase
          .from('guides')
          .select('*')
          .order('name', { ascending: true })
        
        if (city) {
          guidesQuery = guidesQuery.ilike('city', `%${city}%`)
        }
        
        if (isActive !== null) {
          guidesQuery = guidesQuery.eq('is_active', isActive === 'true')
        }
        
        const guidesResult = await guidesQuery
        data = guidesResult.data || []
        error = guidesResult.error
        break

      case 'vehicles':
        let vehiclesQuery = supabase
          .from('vehicles')
          .select('*')
          .order('name', { ascending: true })
        
        if (isActive !== null) {
          vehiclesQuery = vehiclesQuery.eq('is_active', isActive === 'true')
        }
        
        const vehiclesResult = await vehiclesQuery
        data = vehiclesResult.data || []
        error = vehiclesResult.error
        break

      case 'hotels':
        let hotelsQuery = supabase
          .from('hotel_contacts')
          .select('*')
          .order('name', { ascending: true })
        
        if (city) {
          hotelsQuery = hotelsQuery.ilike('city', `%${city}%`)
        }
        
        if (isActive !== null) {
          hotelsQuery = hotelsQuery.eq('is_active', isActive === 'true')
        }
        
        const hotelsResult = await hotelsQuery
        data = hotelsResult.data || []
        error = hotelsResult.error
        break

      case 'restaurants':
        let restaurantsQuery = supabase
          .from('restaurant_contacts')
          .select('*')
          .order('name', { ascending: true })
        
        if (city) {
          restaurantsQuery = restaurantsQuery.ilike('city', `%${city}%`)
        }
        
        if (isActive !== null) {
          restaurantsQuery = restaurantsQuery.eq('is_active', isActive === 'true')
        }
        
        const restaurantsResult = await restaurantsQuery
        data = restaurantsResult.data || []
        error = restaurantsResult.error
        break

      case 'airport_staff':
        let airportStaffQuery = supabase
          .from('airport_staff')
          .select('*')
          .order('name', { ascending: true })
        
        if (city) {
          airportStaffQuery = airportStaffQuery.ilike('airport_location', `%${city}%`)
        }
        
        if (isActive !== null) {
          airportStaffQuery = airportStaffQuery.eq('is_active', isActive === 'true')
        }
        
        const airportStaffResult = await airportStaffQuery
        data = airportStaffResult.data || []
        error = airportStaffResult.error
        break

      case 'hotel_staff':
        let hotelStaffQuery = supabase
          .from('hotel_staff')
          .select(`
            *,
            hotel:hotel_id (
              id,
              name,
              city
            )
          `)
          .order('name', { ascending: true })
        
        if (isActive !== null) {
          hotelStaffQuery = hotelStaffQuery.eq('is_active', isActive === 'true')
        }
        
        const hotelStaffResult = await hotelStaffQuery
        data = hotelStaffResult.data || []
        error = hotelStaffResult.error
        break

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid type parameter. Use: guides, vehicles, hotels, restaurants, airport_staff, hotel_staff' },
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
        error: error instanceof Error ? error.message : 'Failed to fetch resources' 
      },
      { status: 500 }
    )
  }
}