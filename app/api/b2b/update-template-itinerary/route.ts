import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// B2B: Update Template Itinerary JSONB
//
// Persists itinerary edits from the calculator page editor
// back to both tour_templates and tour_template_versions.
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { template_id, itinerary } = body

    if (!template_id) {
      return NextResponse.json(
        { success: false, error: 'template_id is required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(itinerary)) {
      return NextResponse.json(
        { success: false, error: 'itinerary must be an array' },
        { status: 400 }
      )
    }

    // Derive updated metadata from itinerary
    const durationDays = itinerary.length
    const durationNights = Math.max(0, durationDays - 1)
    const citiesCovered = [...new Set(
      itinerary
        .map((d: any) => d.city)
        .filter(Boolean)
    )]

    // 1. Update tour_templates
    const { error: templateError } = await supabaseAdmin
      .from('tour_templates')
      .update({
        itinerary,
        duration_days: durationDays,
        duration_nights: durationNights,
        cities_covered: citiesCovered,
        updated_at: new Date().toISOString()
      })
      .eq('id', template_id)

    if (templateError) {
      console.error('[update-template-itinerary] Template update failed:', templateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update template' },
        { status: 500 }
      )
    }

    // 2. Update tour_template_versions (English version)
    const { error: versionError } = await supabaseAdmin
      .from('tour_template_versions')
      .update({ itinerary })
      .eq('template_id', template_id)
      .eq('language', 'en')

    if (versionError) {
      // Non-fatal: log warning but don't fail the request
      console.warn('[update-template-itinerary] Version update warning:', versionError.message)
    }

    return NextResponse.json({
      success: true,
      duration_days: durationDays,
      duration_nights: durationNights,
      cities_covered: citiesCovered
    })
  } catch (err: any) {
    console.error('[update-template-itinerary] Error:', err)
    return NextResponse.json(
      { success: false, error: clientMessage(err, 'Internal server error') },
      { status: 500 }
    )
  }
}
