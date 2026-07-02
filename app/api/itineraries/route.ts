import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()

    // Fetch itineraries with their language versions
    const { searchParams } = new URL(request.url)
    const includeB2B = searchParams.get('include_b2b') === 'true'

    // Clamp the caller-supplied limit to a sane range so a huge `?limit=` can't
    // be used to extract the whole table / exhaust memory. Default 100, max 1000.
    const requestedLimit = parseInt(searchParams.get('limit') || '100')
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 1000) : 100
    const requestedPage = parseInt(searchParams.get('page') || '1')
    const page = Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1
    const from = (page - 1) * limit

    // Only the scalar columns the list/picker consumers actually render —
    // deliberately excludes the wide JSONB payloads (parsed data, generation
    // warnings, cabin allocation, ...) that made select('*') expensive here.
    const LIST_COLUMNS = 'id, itinerary_code, client_name, client_email, trip_name, start_date, end_date, total_days, num_adults, num_children, total_cost, total_paid, payment_status, currency, status, created_at, assigned_guide_id, assigned_vehicle_id'

    let query = supabase
      .from('itineraries')
      .select(LIST_COLUMNS, { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1)

    // By default, exclude B2B itineraries from the list
    if (!includeB2B) {
      query = query.not('source', 'eq', 'b2b_custom')
    }

    const { data: itineraries, error, count } = await query

    if (error) {
      console.error('❌ Database error:', error)
      throw error
    }

    // Fetch available languages for each itinerary
    const itineraryIds = itineraries?.map((i: { id: string }) => i.id) || []

    let versionsMap: Record<string, string[]> = {}

    if (itineraryIds.length > 0) {
      const { data: versions, error: versionsError } = await supabase
        .from('itinerary_versions')
        .select('itinerary_id, language')
        .in('itinerary_id', itineraryIds)

      if (!versionsError && versions) {
        // Group languages by itinerary_id
        versionsMap = versions.reduce((acc: Record<string, string[]>, v: { itinerary_id: string; language: string }) => {
          if (!acc[v.itinerary_id]) {
            acc[v.itinerary_id] = []
          }
          acc[v.itinerary_id].push(v.language)
          return acc
        }, {} as Record<string, string[]>)
      }
    }

    // Add available_languages to each itinerary
    const dataWithLanguages = itineraries?.map((itinerary: { id: string; [key: string]: any }) => ({
      ...itinerary,
      available_languages: versionsMap[itinerary.id] || []
    })) || []

    console.log('✅ Found itineraries:', dataWithLanguages.length)

    return NextResponse.json({
      success: true,
      data: dataWithLanguages,
      count: count ?? dataWithLanguages.length,
      page,
      limit
    })
  } catch (error: any) {
    console.error('❌ API error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()
    const body = await request.json()
    body.org_id = orgId

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
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}