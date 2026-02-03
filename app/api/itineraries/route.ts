import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

// Generate unique itinerary code
function generateItineraryCode(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 9000) + 1000
  return `ITN-${year}-${random}`
}

// Calculate days between two dates
function calculateTotalDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 1
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays + 1 // Include both start and end day
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    // Fetch itineraries with their language versions
    const { data: itineraries, error } = await supabase
      .from('itineraries')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Database error:', error)
      throw error
    }

    // Fetch available languages for each itinerary
    const itineraryIds = itineraries?.map(i => i.id) || []

    let versionsMap: Record<string, string[]> = {}

    if (itineraryIds.length > 0) {
      const { data: versions, error: versionsError } = await supabase
        .from('itinerary_versions')
        .select('itinerary_id, language')
        .in('itinerary_id', itineraryIds)

      if (!versionsError && versions) {
        // Group languages by itinerary_id
        versionsMap = versions.reduce((acc, v) => {
          if (!acc[v.itinerary_id]) {
            acc[v.itinerary_id] = []
          }
          acc[v.itinerary_id].push(v.language)
          return acc
        }, {} as Record<string, string[]>)
      }
    }

    // Add available_languages to each itinerary
    const dataWithLanguages = itineraries?.map(itinerary => ({
      ...itinerary,
      available_languages: versionsMap[itinerary.id] || []
    })) || []

    console.log('✅ Found itineraries:', dataWithLanguages.length)

    return NextResponse.json({
      success: true,
      data: dataWithLanguages
    })
  } catch (error: any) {
    console.error('❌ API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()

    // Generate itinerary_code if not provided
    if (!body.itinerary_code) {
      body.itinerary_code = generateItineraryCode()
    }

    // Calculate total_days from dates if not provided
    if (!body.total_days && body.start_date && body.end_date) {
      body.total_days = calculateTotalDays(body.start_date, body.end_date)
    } else if (!body.total_days) {
      body.total_days = 1
    }

    // Set default status if not provided
    if (!body.status) {
      body.status = 'draft'
    }

    // Set default values for other required fields
    body.num_adults = body.num_adults || 1
    body.num_children = body.num_children || 0
    body.total_cost = body.total_cost || 0
    body.currency = body.currency || 'USD'

    // Set timestamps
    const now = new Date().toISOString()
    body.created_at = body.created_at || now
    body.updated_at = now

    const { data, error } = await supabase
      .from('itineraries')
      .insert([body])
      .select()
      .single()

    if (error) {
      console.error('Error creating itinerary:', error)
      throw error
    }

    // Create English version automatically
    if (data) {
      const { error: versionError } = await supabase
        .from('itinerary_versions')
        .insert({
          itinerary_id: data.id,
          language: 'en',
          trip_name: body.trip_name || 'Untitled Trip',
          notes: body.notes || null,
          pickup_location: body.pickup_location || null,
          guide_notes: body.guide_notes || null,
          vehicle_notes: body.vehicle_notes || null
        })

      if (versionError) {
        console.warn('Warning: Could not create English version:', versionError)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        available_languages: ['en']
      }
    })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}