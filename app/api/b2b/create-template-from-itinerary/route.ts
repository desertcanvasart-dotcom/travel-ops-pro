import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// B2B: Create Tour Template + Variation from WhatsApp Itinerary
//
// Converts a WhatsApp-parsed itinerary into the template/variation
// system so it can be priced via the B2B calculator.
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { itinerary_id, tier = 'standard' } = body

    if (!itinerary_id) {
      return NextResponse.json(
        { success: false, error: 'itinerary_id is required' },
        { status: 400 }
      )
    }

    // 1. Fetch the itinerary
    const { data: itinerary, error: itinError } = await supabaseAdmin
      .from('itineraries')
      .select('*')
      .eq('id', itinerary_id)
      .single()

    if (itinError || !itinerary) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // 2. Fetch itinerary days
    const { data: days, error: daysError } = await supabaseAdmin
      .from('itinerary_days')
      .select('*')
      .eq('itinerary_id', itinerary_id)
      .order('day_number')

    if (daysError || !days || days.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No itinerary days found' },
        { status: 404 }
      )
    }

    // 3. Fetch services for each day to determine meals
    const dayIds = days.map(d => d.id)
    const { data: services } = await supabaseAdmin
      .from('itinerary_services')
      .select('itinerary_day_id, service_type, service_name')
      .in('itinerary_day_id', dayIds)

    // Group services by day
    const servicesByDay: Record<string, any[]> = {}
    for (const svc of (services || [])) {
      if (!servicesByDay[svc.itinerary_day_id]) {
        servicesByDay[svc.itinerary_day_id] = []
      }
      servicesByDay[svc.itinerary_day_id].push(svc)
    }

    // 4. Convert itinerary days to template itinerary JSONB format
    // IMPORTANT: Carry ALL pricing-relevant fields from itinerary_days + itinerary_services
    // so the B2B pricing engine doesn't have to reconstruct them from titles.
    const templateItinerary = days.map((day, index) => {
      const daySvcs = servicesByDay[day.id] || []
      const meals: string[] = []

      // Always include breakfast for multi-day tours
      meals.push('breakfast')

      // Check for lunch/dinner services
      const hasLunch = daySvcs.some((s: any) =>
        s.service_type === 'meal' && s.service_name?.toLowerCase().includes('lunch')
      )
      const hasDinner = daySvcs.some((s: any) =>
        s.service_type === 'meal' && s.service_name?.toLowerCase().includes('dinner')
      )
      if (hasLunch) meals.push('lunch')
      if (hasDinner) meals.push('dinner')

      // Detect cruise day from services or day flag
      const isCruiseDay = daySvcs.some((s: any) => s.service_type === 'cruise') || day.is_cruise_day

      // Derive service flags from itinerary_services
      const hasGuideService = daySvcs.some((s: any) => s.service_type === 'guide')
      const isFirstDay = index === 0
      const isLastDay = index === days.length - 1

      // Airport: determine arrival vs departure from service name + position
      const airportArrival = daySvcs.some((s: any) =>
        s.service_type === 'airport_service' &&
        (s.service_name?.toLowerCase().includes('meet') ||
         s.service_name?.toLowerCase().includes('arrival') ||
         s.service_name?.toLowerCase().includes('greet'))
      ) || (isFirstDay && daySvcs.some((s: any) => s.service_type === 'airport_service'))

      const airportDeparture = daySvcs.some((s: any) =>
        s.service_type === 'airport_service' &&
        (s.service_name?.toLowerCase().includes('departure') ||
         s.service_name?.toLowerCase().includes('farewell') ||
         s.service_name?.toLowerCase().includes('assist'))
      ) || (isLastDay && daySvcs.some((s: any) => s.service_type === 'airport_service'))

      // Hotel services: check-in vs check-out
      const hotelCheckin = daySvcs.some((s: any) =>
        s.service_type === 'hotel_service' &&
        s.service_name?.toLowerCase().includes('check-in')
      ) || (isFirstDay && daySvcs.some((s: any) => s.service_type === 'hotel_service'))

      const hotelCheckout = daySvcs.some((s: any) =>
        s.service_type === 'hotel_service' &&
        (s.service_name?.toLowerCase().includes('check-out') ||
         s.service_name?.toLowerCase().includes('porter'))
      ) || (isLastDay && daySvcs.some((s: any) => s.service_type === 'hotel_service'))

      // Infer accommodation_type
      let accommodationType: string = 'hotel'
      if (isCruiseDay) {
        accommodationType = 'cruise'
      } else if (isLastDay && !daySvcs.some((s: any) =>
        s.service_type === 'accommodation' || s.service_type === 'cruise')) {
        accommodationType = 'none'
      }

      return {
        day: day.day_number,
        title: day.title || `Day ${day.day_number}`,
        description: day.description || '',
        meals,
        city: day.city || day.overnight_location || itinerary.city || 'Cairo',
        is_cruise_day: isCruiseDay,
        // Pricing-critical fields from itinerary_days
        attractions: day.attractions || [],
        overnight_city: day.overnight_city || day.overnight_location || null,
        accommodation_type: accommodationType,
        // Service flags derived from itinerary_services
        services: {
          airport_arrival: airportArrival,
          airport_departure: airportDeparture,
          hotel_checkin: hotelCheckin,
          hotel_checkout: hotelCheckout,
          guide_required: day.guide_required ?? hasGuideService,
        },
      }
    })

    // 5. Extract cities from days
    const cities = [...new Set(days.map(d => d.city || d.overnight_location).filter(Boolean))]

    // 6. Determine tour type (valid values: day_tour, multi_day, stopover)
    const totalDays = itinerary.total_days || days.length
    const tourType = totalDays <= 1 ? 'day_tour' : 'multi_day'

    // 7. Generate template code
    const cityPrefix = (cities[0] || 'EGY').substring(0, 3).toUpperCase()
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const templateCode = `${cityPrefix}-MUL-${random}`

    const tripName = itinerary.trip_name || 'Custom Tour'

    // 8. Create tour template
    const { data: template, error: templateError } = await supabaseAdmin
      .from('tour_templates')
      .insert({
        template_code: templateCode,
        template_name: tripName,
        tour_type: tourType,
        duration_days: itinerary.total_days || days.length,
        duration_nights: (itinerary.total_days || days.length) - 1,
        cities_covered: cities,
        short_description: `Custom tour created from WhatsApp inquiry`,
        itinerary: templateItinerary,
        is_active: true,
        is_featured: false,
        source_itinerary_id: itinerary_id,
      })
      .select()
      .single()

    if (templateError) {
      console.error('Failed to create template:', templateError)
      // If source_itinerary_id column doesn't exist, retry without it
      if (templateError.message?.includes('source_itinerary_id')) {
        const { data: template2, error: templateError2 } = await supabaseAdmin
          .from('tour_templates')
          .insert({
            template_code: templateCode,
            template_name: tripName,
            tour_type: tourType,
            duration_days: itinerary.total_days || days.length,
            duration_nights: (itinerary.total_days || days.length) - 1,
            cities_covered: cities,
            short_description: `Custom tour created from WhatsApp inquiry`,
            itinerary: templateItinerary,
            is_active: true,
            is_featured: false,
          })
          .select()
          .single()

        if (templateError2 || !template2) {
          return NextResponse.json(
            { success: false, error: templateError2?.message || 'Failed to create template' },
            { status: 500 }
          )
        }

        // Continue with template2
        return await createVariationAndRespond(template2, tripName, tier, itinerary_id)
      }

      return NextResponse.json(
        { success: false, error: clientMessage(templateError, 'Internal server error') },
        { status: 500 }
      )
    }

    return await createVariationAndRespond(template!, tripName, tier, itinerary_id)

  } catch (error: any) {
    console.error('Error creating template from itinerary:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

async function createVariationAndRespond(
  template: any,
  tripName: string,
  tier: string,
  itineraryId: string
) {
  // Create English version
  await supabaseAdmin
    .from('tour_template_versions')
    .insert({
      template_id: template.id,
      language: 'en',
      template_name: tripName,
      short_description: template.short_description,
      itinerary: template.itinerary
    })

  // Create variation
  const variationName = `${tripName} - ${tier.charAt(0).toUpperCase() + tier.slice(1)}`
  const variationCode = `${template.template_code}-${tier.toUpperCase()}`

  const { data: variation, error: varError } = await supabaseAdmin
    .from('tour_variations')
    .insert({
      template_id: template.id,
      variation_code: variationCode,
      variation_name: variationName,
      tier,
      group_type: 'private',
      min_pax: 1,
      max_pax: 40,
      is_active: true,
    })
    .select()
    .single()

  if (varError || !variation) {
    console.error('Failed to create variation:', varError)
    return NextResponse.json(
      { success: false, error: varError?.message || 'Failed to create variation' },
      { status: 500 }
    )
  }

  console.log('✅ Template + Variation created from itinerary:', {
    templateId: template.id,
    templateCode: template.template_code,
    variationId: variation.id,
    variationName,
    itineraryId,
  })

  return NextResponse.json({
    success: true,
    data: {
      template_id: template.id,
      template_code: template.template_code,
      template_name: tripName,
      variation_id: variation.id,
      variation_code: variation.variation_code,
      variation_name: variationName,
      itinerary_id: itineraryId,
    }
  }, { status: 201 })
}
