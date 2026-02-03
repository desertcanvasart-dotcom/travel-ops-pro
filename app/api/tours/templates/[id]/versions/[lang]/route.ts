import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

    const { data, error } = await supabaseAdmin
      .from('tour_template_versions')
      .select('*')
      .eq('template_id', id)
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
    console.error('Error fetching tour template version:', error)
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

    if (body.template_name !== undefined) updateData.template_name = body.template_name
    if (body.short_description !== undefined) updateData.short_description = body.short_description
    if (body.long_description !== undefined) updateData.long_description = body.long_description
    if (body.highlights !== undefined) updateData.highlights = body.highlights
    if (body.main_attractions !== undefined) updateData.main_attractions = body.main_attractions
    if (body.best_for !== undefined) updateData.best_for = body.best_for
    if (body.inclusions !== undefined) updateData.inclusions = body.inclusions
    if (body.exclusions !== undefined) updateData.exclusions = body.exclusions
    if (body.itinerary !== undefined) updateData.itinerary = body.itinerary

    const { data, error } = await supabaseAdmin
      .from('tour_template_versions')
      .update(updateData)
      .eq('template_id', id)
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
    console.error('Error updating tour template version:', error)
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
    const { data: allVersions } = await supabaseAdmin
      .from('tour_template_versions')
      .select('language')
      .eq('template_id', id)

    if (allVersions && allVersions.length <= 1) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete the last language version' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('tour_template_versions')
      .delete()
      .eq('template_id', id)
      .eq('language', lang)

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: `${lang.toUpperCase()} version deleted successfully`
    })
  } catch (error) {
    console.error('Error deleting tour template version:', error)
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
