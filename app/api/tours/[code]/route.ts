import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(
  request: Request,
  { params }: { params: { code: string } }
) {
  try {
    const { code } = await params

    // Fetch variation with all related data
    const { data: variation, error: varError } = await supabase
      .from('tour_variations')
      .select(`
        *,
        tour_templates (
          template_code,
          template_name,
          short_description,
          long_description,
          highlights,
          main_attractions,
          duration_days,
          duration_nights,
          tour_categories (category_name),
          destinations (destination_name)
        )
      `)
      .eq('variation_code', code)
      .single()

    if (varError) throw varError
    if (!variation) {
      return NextResponse.json(
        { success: false, error: 'Tour not found' },
        { status: 404 }
      )
    }

    // Fetch pricing
    const { data: pricing } = await supabase
      .from('variation_pricing')
      .select('min_pax, max_pax, price_per_person, single_supplement')
      .eq('variation_id', variation.id)
      .order('min_pax', { ascending: true })

    // Fetch services
    const { data: services } = await supabase
      .from('variation_services')
      .select('service_category, service_name, quantity_type, cost_per_unit, applies_to_day')
      .eq('variation_id', variation.id)
      .eq('is_mandatory', true)
      .order('service_category')

    // Fetch daily itinerary
    const { data: dailyItinerary } = await supabase
      .from('variation_daily_itinerary')
      .select('*')
      .eq('variation_id', variation.id)
      .order('day_number', { ascending: true })

    // Format response
    const tourDetail = {
      // Template info
      template_name: variation.tour_templates.template_name,
      template_code: variation.tour_templates.template_code,
      category_name: variation.tour_templates.tour_categories?.category_name || 'Uncategorized',
      destination_name: variation.tour_templates.destinations?.destination_name || 'Various',
      duration_days: variation.tour_templates.duration_days,
      duration_nights: variation.tour_templates.duration_nights || 0,
      short_description: variation.tour_templates.short_description,
      long_description: variation.tour_templates.long_description,
      highlights: variation.tour_templates.highlights || [],
      main_attractions: variation.tour_templates.main_attractions || [],

      // Variation info
      variation_name: variation.variation_name,
      variation_code: variation.variation_code,
      tier: variation.tier,
      group_type: variation.group_type,
      min_pax: variation.min_pax,
      max_pax: variation.max_pax,
      
      // Details
      inclusions: variation.inclusions || [],
      exclusions: variation.exclusions || [],
      optional_extras: variation.optional_extras || [],
      
      // Guide & vehicle
      guide_type: variation.guide_type,
      guide_languages: variation.guide_languages || [],
      vehicle_type: variation.vehicle_type,
      
      // Pricing
      pricing: pricing || [],
      
      // Services
      services: services || [],
      
      // Daily itinerary
      daily_itinerary: dailyItinerary || []
    }

    return NextResponse.json({
      success: true,
      data: tourDetail
    })

  } catch (error) {
    console.error('Error fetching tour detail:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch tour details',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}