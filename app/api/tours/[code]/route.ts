import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// ============================================
// TOUR DETAIL API - WITH VARIATION_ID
// File: app/api/tours/[code]/route.ts
// ============================================

// Service-role client (route is session-gated by middleware). This route
// previously used the raw anon key inline — it only worked because
// tour_templates/tour_variations were anon-readable, which the 20260714
// rate-table RLS tightening closes.
const supabase = createServerClient()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params

    let variation = null

    // First, try to find by variation_code
    const { data: varByCode, error: varCodeError } = await supabase
      .from('tour_variations')
      .select(`
        *,
        tour_templates (
          id,
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

    if (varByCode) {
      variation = varByCode
    } else {
      // Check if it's a UUID (template_id) - UUIDs are 36 chars with dashes
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)

      if (isUUID) {
        // Try to find by template_id and get the first variation
        const { data: varByTemplateId } = await supabase
          .from('tour_variations')
          .select(`
            *,
            tour_templates (
              id,
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
          .eq('template_id', code)
          .order('tier', { ascending: true })
          .limit(1)
          .single()

        if (varByTemplateId) {
          variation = varByTemplateId
        }
      } else {
        // Try to find by template_code and get the first variation
        const { data: template } = await supabase
          .from('tour_templates')
          .select('id')
          .eq('template_code', code)
          .single()

        if (template) {
          const { data: varByTemplate } = await supabase
            .from('tour_variations')
            .select(`
              *,
              tour_templates (
                id,
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
            .eq('template_id', template.id)
            .order('tier', { ascending: true })
            .limit(1)
            .single()

          if (varByTemplate) {
            variation = varByTemplate
          }
        }
      }
    }

    if (!variation) {
      // ============================================
      // TEMPLATE FALLBACK — no variations exist
      // ============================================
      // Programmes imported from documents (the A.T.S catalogue) carry their
      // day-by-day in tour_templates.itinerary and have NO variations. They
      // must still open: build the detail from the template itself. Pricing
      // runs template-direct — calculate-price accepts template_id and prices
      // via the auto-pricing engine at the default tier.
      const isTemplateUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)
      const { data: template } = await supabase
        .from('tour_templates')
        .select(`
          id, template_code, template_name, short_description, long_description,
          highlights, main_attractions, duration_days, duration_nights,
          itinerary, cities_covered,
          tour_categories (category_name),
          destinations (destination_name)
        `)
        .eq(isTemplateUUID ? 'id' : 'template_code', code)
        .single()

      if (!template) {
        return NextResponse.json(
          { success: false, error: 'Tour not found' },
          { status: 404 }
        )
      }

      const tpl = template as any
      const templateItinerary = Array.isArray(tpl.itinerary) ? tpl.itinerary : []
      const dailyItinerary = templateItinerary.map((day: any) => ({
        day_number: day.day,
        day_title: day.title,
        day_description: day.description,
        city: day.city,
        overnight_city: day.overnight_city,
        breakfast_included: Array.isArray(day.meals) && day.meals.includes('breakfast'),
        lunch_included: Array.isArray(day.meals) && day.meals.includes('lunch'),
        dinner_included: Array.isArray(day.meals) && day.meals.includes('dinner'),
        is_cruise_day: day.is_cruise_day || false
      }))

      return NextResponse.json({
        success: true,
        data: {
          variation_id: null,
          template_id: tpl.id,
          template_name: tpl.template_name,
          template_code: tpl.template_code,
          category_name: tpl.tour_categories?.category_name || 'Uncategorized',
          destination_name:
            tpl.destinations?.destination_name ||
            (Array.isArray(tpl.cities_covered) && tpl.cities_covered.length
              ? tpl.cities_covered.join(', ')
              : 'Various'),
          duration_days: tpl.duration_days,
          duration_nights: tpl.duration_nights || 0,
          short_description: tpl.short_description,
          long_description: tpl.long_description,
          highlights: tpl.highlights || [],
          main_attractions: tpl.main_attractions || [],
          variation_name: null,
          variation_code: null,
          tier: 'standard',
          group_type: 'private',
          min_pax: 1,
          max_pax: 15,
          inclusions: [],
          exclusions: [],
          optional_extras: [],
          guide_type: null,
          guide_languages: ['English', 'Arabic'],
          vehicle_type: null,
          services: [],
          daily_itinerary: dailyItinerary,
          has_dynamic_pricing: false,
          pricing_source: 'template'
        }
      })
    }

    // Fetch services from tour_variation_services (for B2B pricing)
    const { data: variationServices } = await supabase
      .from('tour_variation_services')
      .select('*')
      .eq('variation_id', variation.id)
      .order('sequence_order')

    // Also fetch legacy services if they exist
    const { data: legacyServices } = await supabase
      .from('variation_services')
      .select('service_category, service_name, quantity_type, cost_per_unit, applies_to_day')
      .eq('variation_id', variation.id)
      .eq('is_mandatory', true)
      .order('service_category')

    // Fetch daily itinerary from variation_daily_itinerary
    const { data: varItinerary } = await supabase
      .from('variation_daily_itinerary')
      .select('*')
      .eq('variation_id', variation.id)
      .order('day_number', { ascending: true })

    const dailyItinerary = (varItinerary || []).map(day => ({
      day_number: day.day_number,
      day_title: day.day_title || day.title,
      day_description: day.day_description || day.description,
      city: day.city,
      overnight_city: day.overnight_city,
      breakfast_included: day.breakfast_included,
      lunch_included: day.lunch_included,
      dinner_included: day.dinner_included,
      // Cruise package day flag - uses bundled transport package
      is_cruise_day: day.is_cruise_day || false
    }))

    // Combine services - prefer new system, fall back to legacy
    const services = variationServices && variationServices.length > 0
      ? variationServices.map(s => ({
          service_category: s.service_category,
          service_name: s.service_name,
          quantity_type: s.quantity_mode,
          cost_per_unit: s.cost_per_unit
        }))
      : legacyServices || []

    // Format response - INCLUDE variation_id for dynamic pricing
    const tourDetail = {
      variation_id: variation.id,  // <-- KEY ADDITION FOR DYNAMIC PRICING
      template_id: variation.tour_templates?.id,
      template_name: variation.tour_templates?.template_name,
      template_code: variation.tour_templates?.template_code,
      category_name: variation.tour_templates?.tour_categories?.category_name || 'Uncategorized',
      destination_name: variation.tour_templates?.destinations?.destination_name || 'Various',
      duration_days: variation.tour_templates?.duration_days,
      duration_nights: variation.tour_templates?.duration_nights || 0,
      short_description: variation.tour_templates?.short_description,
      long_description: variation.tour_templates?.long_description,
      highlights: variation.tour_templates?.highlights || [],
      main_attractions: variation.tour_templates?.main_attractions || [],
      variation_name: variation.variation_name,
      variation_code: variation.variation_code,
      tier: variation.tier,
      group_type: variation.group_type,
      min_pax: variation.min_pax,
      max_pax: variation.max_pax,
      inclusions: variation.inclusions || [],
      exclusions: variation.exclusions || [],
      optional_extras: variation.optional_extras || [],
      guide_type: variation.guide_type,
      guide_languages: variation.guide_languages || ['English', 'Arabic'],
      vehicle_type: variation.vehicle_type,
      services: services,
      daily_itinerary: dailyItinerary,
      // Flag to indicate if dynamic pricing is available
      has_dynamic_pricing: variationServices && variationServices.length > 0
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