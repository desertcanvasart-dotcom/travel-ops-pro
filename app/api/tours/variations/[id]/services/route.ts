import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'

// ============================================
// TOUR VARIATION SERVICES API - CRUD + BULK
// File: app/api/tours/variations/[id]/services/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getRateDetails(rateType: string, rateId: string) {
  let result = null

  switch (rateType) {
    case 'transportation':
      const { data: transport } = await supabaseAdmin
        .from('transportation_rates')
        .select('id, service_code, service_type, route_name, city, origin_city, destination_city, sedan_rate_eur, minivan_rate_eur, van_rate_eur, minibus_rate_eur, bus_rate_eur')
        .eq('id', rateId)
        .single()
      if (transport) {
        const tRates = [transport.sedan_rate_eur, transport.minivan_rate_eur, transport.van_rate_eur, transport.minibus_rate_eur, transport.bus_rate_eur].filter(Boolean) as number[]
        const minTRate = tRates.length > 0 ? Math.min(...tRates) : 0
        result = {
          id: transport.id,
          name: transport.route_name || transport.service_type || transport.service_code,
          rate_eur: minTRate,
          rate_non_eur: minTRate,
          city: transport.city || transport.origin_city,
          details: `${tRates.length} vehicle tier${tRates.length !== 1 ? 's' : ''} | from €${minTRate}`
        }
      }
      break

    case 'guide':
      const { data: guide } = await supabaseAdmin
        .from('guide_rates')
        .select('id, guide_type, city, half_day_rate, full_day_rate')
        .eq('id', rateId)
        .single()
      if (guide) {
        result = {
          id: guide.id,
          name: guide.guide_type,
          rate_half_day: guide.half_day_rate,
          rate_full_day: guide.full_day_rate,
          city: guide.city,
          details: `Half: €${guide.half_day_rate} | Full: €${guide.full_day_rate}`
        }
      }
      break

    case 'activity':
      const { data: activity } = await supabaseAdmin
        .from('activity_rates')
        .select('id, activity_name, activity_category, city, base_rate_eur, base_rate_non_eur')
        .eq('id', rateId)
        .single()
      if (activity) {
        result = {
          id: activity.id,
          name: activity.activity_name,
          rate_eur: activity.base_rate_eur,
          rate_non_eur: activity.base_rate_non_eur,
          city: activity.city,
          details: activity.activity_category
        }
      }
      break

    case 'meal':
      const { data: meal } = await supabaseAdmin
        .from('meal_rates')
        .select('id, restaurant_name, meal_type, tier, city, base_rate_eur, base_rate_non_eur')
        .eq('id', rateId)
        .single()
      if (meal) {
        result = {
          id: meal.id,
          name: meal.restaurant_name,
          rate_eur: meal.base_rate_eur,
          rate_non_eur: meal.base_rate_non_eur,
          city: meal.city,
          details: `${meal.meal_type} - ${meal.tier}`
        }
      }
      break

    case 'accommodation':
      const { data: hotel } = await supabaseAdmin
        .from('accommodation_rates')
        .select('id, hotel_name, room_type, city, rate_low_season_sgl, rate_high_season_sgl, rate_peak_season_sgl')
        .eq('id', rateId)
        .single()
      if (hotel) {
        result = {
          id: hotel.id,
          name: hotel.hotel_name,
          rate_low: hotel.rate_low_season_sgl,
          rate_high: hotel.rate_high_season_sgl,
          rate_peak: hotel.rate_peak_season_sgl,
          city: hotel.city,
          details: hotel.room_type
        }
      }
      break

    case 'cruise':
      const { data: cruise } = await supabaseAdmin
        .from('nile_cruises')
        .select('id, ship_name, cabin_type, rate_low_season, rate_high_season, rate_peak_season')
        .eq('id', rateId)
        .single()
      if (cruise) {
        result = {
          id: cruise.id,
          name: cruise.ship_name,
          rate_low: cruise.rate_low_season,
          rate_high: cruise.rate_high_season,
          rate_peak: cruise.rate_peak_season,
          details: cruise.cabin_type
        }
      }
      break
  }

  return result
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('tour_variation_services')
      .select('*')
      .eq('variation_id', id)
      .order('sequence_order')

    if (error) {
      console.error('Error fetching variation services:', error)
      return NextResponse.json({ error: clientMessage(error, 'Failed to fetch services') }, { status: 500 })
    }

    const enrichedServices = await Promise.all((data || []).map(async (service) => {
      if (service.rate_type && service.rate_id) {
        const rateDetails = await getRateDetails(service.rate_type, service.rate_id)
        return { ...service, rate_details: rateDetails }
      }
      return { ...service, rate_details: null }
    }))

    return NextResponse.json({ success: true, data: enrichedServices })
  } catch (error: any) {
    console.error('Error in variation services GET:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to fetch services') }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { data: maxSeq } = await supabaseAdmin
      .from('tour_variation_services')
      .select('sequence_order')
      .eq('variation_id', id)
      .order('sequence_order', { ascending: false })
      .limit(1)
      .single()

    const nextOrder = (maxSeq?.sequence_order || 0) + 1

    const { data, error } = await supabaseAdmin
      .from('tour_variation_services')
      .insert({
        variation_id: id,
        service_name: body.service_name,
        service_category: body.service_category,
        rate_type: body.rate_type,
        rate_id: body.rate_id,
        quantity_mode: body.quantity_mode || 'per_pax',
        quantity_value: body.quantity_value || 1,
        cost_per_unit: body.cost_per_unit,
        day_number: body.day_number,
        is_optional: body.is_optional || false,
        optional_price_override: body.optional_price_override,
        notes: body.notes,
        sequence_order: body.sequence_order || nextOrder
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating variation service:', error)
      return NextResponse.json({ error: clientMessage(error, 'Failed to create service') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error: any) {
    console.error('Error in variation services POST:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to create service') }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { services, mode } = body

    if (!Array.isArray(services)) {
      return NextResponse.json({ error: 'services array is required' }, { status: 400 })
    }

    // Mode: 'replace' = delete all and re-insert (default for ServiceLinkerModal)
    // Mode: 'update' = update existing by ID
    if (mode === 'update') {
      // Update existing services by ID
      const results = await Promise.all(services.map(async (service: any) => {
        const { data, error } = await supabaseAdmin
          .from('tour_variation_services')
          .update({
            service_name: service.service_name,
            service_category: service.service_category,
            rate_type: service.rate_type,
            rate_id: service.rate_id,
            quantity_mode: service.quantity_mode,
            quantity_value: service.quantity_value,
            cost_per_unit: service.cost_per_unit,
            day_number: service.day_number,
            is_optional: service.is_optional,
            optional_price_override: service.optional_price_override,
            notes: service.notes,
            sequence_order: service.sequence_order
          })
          .eq('id', service.id)
          .eq('variation_id', id)
          .select()
          .single()

        return { success: !error, data, error }
      }))

      const hasErrors = results.some(r => !r.success)
      return NextResponse.json({
        success: !hasErrors,
        data: results.filter(r => r.data).map(r => r.data),
        errors: results.filter(r => r.error).map(r => r.error)
      })
    } else {
      // Default: Replace all services (delete existing, insert new)
      // Step 1: Delete all existing services for this variation
      const { error: deleteError } = await supabaseAdmin
        .from('tour_variation_services')
        .delete()
        .eq('variation_id', id)

      if (deleteError) {
        console.error('Error deleting variation services:', deleteError)
        return NextResponse.json({ error: clientMessage(deleteError, 'Failed to save services') }, { status: 500 })
      }

      // Step 2: Insert all new services
      if (services.length > 0) {
        const servicesWithVariation = services.map((service: any, index: number) => ({
          variation_id: id,
          service_name: service.service_name,
          service_category: service.service_category,
          rate_type: service.rate_type || null,
          rate_id: service.rate_id || null,
          quantity_mode: service.quantity_mode || 'per_pax',
          quantity_value: service.quantity_value || 1,
          cost_per_unit: service.cost_per_unit || 0,
          day_number: service.day_number || null,
          is_optional: service.is_optional || false,
          optional_price_override: service.optional_price_override || null,
          notes: service.notes || null,
          sequence_order: service.sequence_order || index + 1
        }))

        const { error: insertError } = await supabaseAdmin
          .from('tour_variation_services')
          .insert(servicesWithVariation)

        if (insertError) {
          console.error('Error inserting variation services:', insertError)
          return NextResponse.json({ error: clientMessage(insertError, 'Failed to save services') }, { status: 500 })
        }
      }

      // Fetch and return updated services
      const { data, error } = await supabaseAdmin
        .from('tour_variation_services')
        .select('*')
        .eq('variation_id', id)
        .order('sequence_order')

      if (error) {
        console.error('Error fetching saved variation services:', error)
        return NextResponse.json({ error: clientMessage(error, 'Failed to save services') }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        data,
        message: `${services.length} services saved`
      })
    }
  } catch (error: any) {
    console.error('Error in variation services PUT:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to save services') }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const serviceId = searchParams.get('serviceId')

    if (!serviceId) {
      return NextResponse.json({ error: 'serviceId is required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('tour_variation_services')
      .delete()
      .eq('id', serviceId)
      .eq('variation_id', id)

    if (error) {
      console.error('Error deleting variation service:', error)
      return NextResponse.json({ error: clientMessage(error, 'Failed to delete service') }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Service deleted' })
  } catch (error: any) {
    console.error('Error in variation services DELETE:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to delete service') }, { status: 500 })
  }
}