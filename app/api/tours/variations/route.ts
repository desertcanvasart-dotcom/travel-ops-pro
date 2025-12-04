import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

// GET - List all variations (optionally filter by template_id)
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    const { searchParams } = new URL(request.url)
    const templateId = searchParams.get('template_id')

    let query = supabase
      .from('tour_variations')
      .select('*')
      .order('tier', { ascending: true })

    if (templateId) {
      query = query.eq('template_id', templateId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching variations:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch variations' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    })

  } catch (error) {
    console.error('Error in variations GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new variation
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()

    if (!body.template_id || !body.variation_name || !body.tier) {
      return NextResponse.json(
        { success: false, error: 'Template ID, variation name, and tier are required' },
        { status: 400 }
      )
    }

    // Generate variation code
    const variationCode = body.variation_code || 
      `${body.variation_name.toUpperCase().replace(/\s+/g, '-').substring(0, 20)}-${body.tier.toUpperCase()}`

    const variationData = {
      template_id: body.template_id,
      variation_code: variationCode,
      variation_name: body.variation_name,
      tier: body.tier, // budget, standard, luxury
      group_type: body.group_type || 'private', // private, shared
      min_pax: body.min_pax || 1,
      max_pax: body.max_pax || 20,
      optimal_pax: body.optimal_pax || null,
      inclusions: body.inclusions || [],
      exclusions: body.exclusions || [],
      optional_extras: body.optional_extras || [],
      guide_type: body.guide_type || null,
      guide_languages: body.guide_languages || ['English'],
      vehicle_type: body.vehicle_type || null,
      accommodation_standard: body.accommodation_standard || null,
      meal_quality: body.meal_quality || null,
      private_experience: body.private_experience || false,
      skip_line_access: body.skip_line_access || false,
      vip_treatment: body.vip_treatment || false,
      flexible_itinerary: body.flexible_itinerary || false,
      typical_start_time: body.typical_start_time || null,
      typical_end_time: body.typical_end_time || null,
      pickup_time_range: body.pickup_time_range || null,
      is_active: body.is_active !== false,
      available_seasons: body.available_seasons || []
    }

    const { data, error } = await supabase
      .from('tour_variations')
      .insert([variationData])
      .select()
      .single()

    if (error) {
      console.error('Error creating variation:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create variation' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Variation created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in variations POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}