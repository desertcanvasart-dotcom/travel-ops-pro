import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

const supabase = createClient()

// GET - Get a specific language version
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lang: string }> }
) {
  try {
    const { id, lang } = await params

    if (!['en', 'ja'].includes(lang)) {
      return NextResponse.json(
        { success: false, error: 'Invalid language. Must be "en" or "ja"' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('itinerary_versions')
      .select('*')
      .eq('itinerary_id', id)
      .eq('language', lang)
      .single()

    if (error && error.code === 'PGRST116') {
      return NextResponse.json(
        { success: false, error: `${lang.toUpperCase()} version not found` },
        { status: 404 }
      )
    }

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error fetching itinerary version:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch version',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// PUT - Update a specific language version
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lang: string }> }
) {
  try {
    const { id, lang } = await params
    const body = await request.json()

    if (!['en', 'ja'].includes(lang)) {
      return NextResponse.json(
        { success: false, error: 'Invalid language. Must be "en" or "ja"' },
        { status: 400 }
      )
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (body.trip_name !== undefined) updateData.trip_name = body.trip_name
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.pickup_location !== undefined) updateData.pickup_location = body.pickup_location
    if (body.guide_notes !== undefined) updateData.guide_notes = body.guide_notes
    if (body.vehicle_notes !== undefined) updateData.vehicle_notes = body.vehicle_notes

    const { data, error } = await supabase
      .from('itinerary_versions')
      .update(updateData)
      .eq('itinerary_id', id)
      .eq('language', lang)
      .select()
      .single()

    if (error && error.code === 'PGRST116') {
      return NextResponse.json(
        { success: false, error: `${lang.toUpperCase()} version not found` },
        { status: 404 }
      )
    }

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error updating itinerary version:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update version',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// DELETE - Delete a specific language version
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lang: string }> }
) {
  try {
    const { id, lang } = await params

    if (!['en', 'ja'].includes(lang)) {
      return NextResponse.json(
        { success: false, error: 'Invalid language. Must be "en" or "ja"' },
        { status: 400 }
      )
    }

    // Check how many versions exist - don't allow deleting the last one
    const { data: allVersions } = await supabase
      .from('itinerary_versions')
      .select('language')
      .eq('itinerary_id', id)

    if (allVersions && allVersions.length <= 1) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete the last language version' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('itinerary_versions')
      .delete()
      .eq('itinerary_id', id)
      .eq('language', lang)

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: `${lang.toUpperCase()} version deleted successfully`
    })
  } catch (error) {
    console.error('Error deleting itinerary version:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete version',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
