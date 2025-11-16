// Rates API Endpoint
// Location: /app/api/rates/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const city = searchParams.get('city')
    const mealType = searchParams.get('meal_type')

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
        const accommodationQuery = supabase
          .from('accommodation_rates')
          .select('*')
        
        if (city) {
          // Case-insensitive city search
          accommodationQuery.ilike('city', city)
        }
        
        const accommodationResult = await accommodationQuery
        data = accommodationResult.data || []
        error = accommodationResult.error
        break

      case 'meal':
        const mealQuery = supabase
          .from('meal_rates')
          .select('*')
        
        if (city) {
          // Case-insensitive city search
          mealQuery.ilike('city', city)
        }
        
        if (mealType) {
          mealQuery.eq('meal_type', mealType)
        }
        
        const mealResult = await mealQuery
        data = mealResult.data || []
        error = mealResult.error
        break

      case 'entrance':
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
        const transportQuery = supabase
          .from('transportation_rates')
          .select('*')
        
        if (city) {
          transportQuery.eq('city', city)
        }
        
        const transportResult = await transportQuery
        data = transportResult.data || []
        error = transportResult.error
        break

      case 'guide':
        const guideQuery = supabase
          .from('guide_rates')
          .select('*')
        
        if (city) {
          guideQuery.eq('city', city)
        }
        
        const guideResult = await guideQuery
        data = guideResult.data || []
        error = guideResult.error
        break

      case 'service':
      case 'service_fee':
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