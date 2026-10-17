import { createClient } from '@supabase/supabase-js'
import { normalizeServiceType } from '@/lib/service-types'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, getCurrentUserRole, noOrgResponse } from '@/lib/auth/current-org'
import { roleAllows } from '@/lib/auth/roles'
import { insertWithTemplateCode } from '@/lib/tours/template-code'

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

    // TENANT BOUNDARY — the service role reads any org's trip; only ours.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // 1. Fetch the itinerary
    const { data: itinerary, error: itinError } = await supabaseAdmin
      .from('itineraries')
      .select('*')
      .eq('id', itinerary_id)
      .eq('org_id', orgId)
      .maybeSingle()

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
        normalizeServiceType(s.service_type) === 'airport_service' &&
        (s.service_name?.toLowerCase().includes('meet') ||
         s.service_name?.toLowerCase().includes('arrival') ||
         s.service_name?.toLowerCase().includes('greet'))
      ) || (isFirstDay && daySvcs.some((s: any) => normalizeServiceType(s.service_type) === 'airport_service'))

      const airportDeparture = daySvcs.some((s: any) =>
        normalizeServiceType(s.service_type) === 'airport_service' &&
        (s.service_name?.toLowerCase().includes('departure') ||
         s.service_name?.toLowerCase().includes('farewell') ||
         s.service_name?.toLowerCase().includes('assist'))
      ) || (isLastDay && daySvcs.some((s: any) => normalizeServiceType(s.service_type) === 'airport_service'))

      // Hotel services: check-in vs check-out
      const hotelCheckin = daySvcs.some((s: any) =>
        normalizeServiceType(s.service_type) === 'hotel_service' &&
        s.service_name?.toLowerCase().includes('check-in')
      ) || (isFirstDay && daySvcs.some((s: any) => normalizeServiceType(s.service_type) === 'hotel_service'))

      const hotelCheckout = daySvcs.some((s: any) =>
        normalizeServiceType(s.service_type) === 'hotel_service' &&
        (s.service_name?.toLowerCase().includes('check-out') ||
         s.service_name?.toLowerCase().includes('porter'))
      ) || (isLastDay && daySvcs.some((s: any) => normalizeServiceType(s.service_type) === 'hotel_service'))

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
        // The day's own travel, carried across. Without these the template
        // forgets that a day flew at all — so a trip built from an itinerary
        // priced its flights as road transfers, and an international arrival
        // (whose route CANNOT be inferred, there being no day before it) was
        // not collected as a leg at all.
        transport_type: day.transport_type || undefined,
        transport_rate_id: day.transport_rate_id || undefined,
        leg_from: day.leg_from || undefined,
        leg_to: day.leg_to || undefined,
        leg_assist: day.leg_assist || undefined,
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

    const tripName = itinerary.trip_name || 'Custom Tour'

    // Agents reach this route (/api/b2b is agent-and-above) from the WhatsApp
    // parser's B2B mode and the Pricing Grid, but the catalogue is the
    // managers' (Tours › Tour Templates). Owner decision: an agent's template
    // is created INACTIVE — it prices on the calculator straight away, and
    // stays out of the catalogue, the inventory and the pickers until a
    // manager reviews it and switches it on. A manager's (or admin's, or the
    // owner's) is active, as before.
    const role = await getCurrentUserRole()
    const needsReview = !roleAllows(role, ['admin', 'manager'])

    // 7 + 8. The template, under a generated code that is drawn again when it
    // clashes with one of the company's codes (lib/tours/template-code).
    const inserted = await insertWithTemplateCode<Record<string, any>>(
      (template_code) => supabaseAdmin
        .from('tour_templates')
        .insert({
          org_id: orgId,
          template_code,
          template_name: tripName,
          tour_type: tourType,
          duration_days: itinerary.total_days || days.length,
          duration_nights: (itinerary.total_days || days.length) - 1,
          cities_covered: cities,
          short_description: `Custom tour created from WhatsApp inquiry`,
          itinerary: templateItinerary,
          is_active: !needsReview,
          is_featured: false,
        })
        .select()
        .single(),
      { cities, tourType }
    )

    if (inserted.error || !inserted.data) {
      console.error('Failed to create template:', inserted.error)
      return NextResponse.json(
        { success: false, error: clientMessage(inserted.error, 'Internal server error') },
        { status: inserted.clash ? 409 : 500 }
      )
    }

    return await createVariationAndRespond(inserted.data, tripName, tier, itinerary_id, needsReview)

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
  itineraryId: string,
  needsReview: boolean
) {
  // The variation first: the template and its variation are made together or
  // not at all. inclusions / exclusions are text[] NOT NULL with no default
  // (baseline tour_variations) — leaving them out failed EVERY call with
  // `null value in column "inclusions"`, after the template had been
  // inserted, so each attempt left another variation-less template in the
  // catalogue. The trip's own days carry what is included; the lists start
  // empty and are filled in Tour Manager.
  const variationName = `${tripName} - ${tier.charAt(0).toUpperCase() + tier.slice(1)}`
  const variationCode = `${template.template_code}-${tier.toUpperCase()}`

  const { data: variation, error: varError } = await supabaseAdmin
    .from('tour_variations')
    .insert({
      // A variation lives in its template's company.
      org_id: template.org_id,
      template_id: template.id,
      variation_code: variationCode,
      variation_name: variationName,
      tier,
      group_type: 'private',
      min_pax: 1,
      max_pax: 40,
      inclusions: [],
      exclusions: [],
      is_active: true,
    })
    .select()
    .single()

  if (varError || !variation) {
    console.error('Failed to create variation:', varError)
    // No half-made programme: the template just created goes again (nothing
    // can refer to it yet; its version rows cascade).
    const { error: undoError } = await supabaseAdmin
      .from('tour_templates')
      .delete()
      .eq('id', template.id)
      .eq('org_id', template.org_id)
    if (undoError) console.error('Failed to remove the template after the variation failed:', undoError)
    return NextResponse.json(
      { success: false, error: clientMessage(varError, 'Failed to create variation') },
      { status: 500 }
    )
  }

  // English version — best-effort, as in /api/tours/templates POST.
  const { error: versionError } = await supabaseAdmin
    .from('tour_template_versions')
    .insert({
      template_id: template.id,
      language: 'en',
      template_name: tripName,
      short_description: template.short_description,
      itinerary: template.itinerary
    })
  if (versionError) console.warn('Warning: Could not create English version:', versionError)

  console.log('✅ Template + Variation created from itinerary:', {
    templateId: template.id,
    templateCode: template.template_code,
    variationId: variation.id,
    variationName,
    itineraryId,
    needsReview,
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
      is_active: !needsReview,
      pending_review: needsReview,
    },
    ...(needsReview
      ? { message: 'Template created inactive: a manager reviews it in Tours › Tour Templates and switches it on. It can be priced now.' }
      : {}),
  }, { status: 201 })
}
