import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabase = createServerClient()

// GET - List all language versions for an itinerary
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    // Confirm the itinerary belongs to this org before reading children
    const { data: parent } = await supabase
      .from('itineraries')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parent) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    const { data, error } = await supabase
      .from('itinerary_versions')
      .select('*')
      .eq('itinerary_id', id)
      .order('language', { ascending: true })

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (error) {
    console.error('Error fetching itinerary versions:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch versions',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// POST - Create a new language version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const body = await request.json()

    // Confirm the itinerary belongs to this org before mutating children
    const { data: parent } = await supabase
      .from('itineraries')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parent) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    const { language, ...content } = body

    if (!language || !['en', 'ja'].includes(language)) {
      return NextResponse.json(
        { success: false, error: 'Invalid language. Must be "en" or "ja"' },
        { status: 400 }
      )
    }

    // Check if version already exists
    const { data: existing } = await supabase
      .from('itinerary_versions')
      .select('id')
      .eq('itinerary_id', id)
      .eq('language', language)
      .single()

    if (existing) {
      return NextResponse.json(
        { success: false, error: `${language.toUpperCase()} version already exists` },
        { status: 409 }
      )
    }

    // If no trip_name provided, try to copy from existing version or itinerary
    let tripName = content.trip_name
    if (!tripName) {
      // Try to get from another version
      const { data: otherVersion } = await supabase
        .from('itinerary_versions')
        .select('trip_name')
        .eq('itinerary_id', id)
        .neq('language', language)
        .limit(1)
        .single()

      if (otherVersion?.trip_name) {
        tripName = otherVersion.trip_name
      } else {
        // Fall back to main itinerary
        const { data: itinerary } = await supabase
          .from('itineraries')
          .select('trip_name')
          .eq('id', id)
          .single()
        tripName = itinerary?.trip_name || 'Untitled Trip'
      }
    }

    const { data, error } = await supabase
      .from('itinerary_versions')
      .insert({
        itinerary_id: id,
        language,
        trip_name: tripName,
        notes: content.notes || null,
        pickup_location: content.pickup_location || null,
        guide_notes: content.guide_notes || null,
        vehicle_notes: content.vehicle_notes || null,
        inclusions: content.inclusions || null,
        exclusions: content.exclusions || null,
        created_by: content.created_by || null
      })
      .select()
      .single()

    if (error) {
      console.error('Error inserting itinerary version:', error)
      return NextResponse.json(
        {
          success: false,
          error: `Failed to create version: ${error.message || error.code || 'Unknown DB error'}`
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('Error creating itinerary version:', error)
    return NextResponse.json(
      {
        success: false,
        error: `Failed to create version: ${error?.message || 'Unknown error'}`
      },
      { status: 500 }
    )
  }
}
