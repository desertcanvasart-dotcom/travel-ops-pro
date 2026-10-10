import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { orgAuth } from '@/lib/auth/org-auth'
import { shiftDateISO } from '@/lib/today'

// ============================================
// SINGLE TOUR DEPARTURE API
// File: app/api/departures/[id]/route.ts
//
// Get, update, and delete individual departures
// ============================================

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/departures/[id]
 * Get a single departure with bookings
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await orgAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, org_id } = authResult
    if (!supabase || !org_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { id } = await params

    const { data, error } = await supabase
      .from('tour_departures')
      .select(`
        *,
        tour_template:tour_templates(id, template_name, template_code, duration_days, short_description),
        bookings:departure_bookings(
          id, client_id, itinerary_id, client_name, pax, status, notes, created_at
        )
      `)
      .eq('id', id)
      .eq('org_id', org_id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Departure not found' },
          { status: 404 }
        )
      }
      console.error('Error fetching departure:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: unknown) {
    console.error('Departure GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/departures/[id]
 * Update a departure
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await orgAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, org_id } = authResult
    if (!supabase || !org_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()

    // Fields that can be updated
    const allowedFields = [
      'tour_name', 'tour_code', 'start_date', 'end_date', 'duration_days',
      'max_pax', 'min_pax', 'booked_pax', 'status', 'cutoff_days',
      'is_guaranteed', 'price_per_person', 'currency',
      'assigned_guide_id', 'assigned_vehicle_id',
      'public_notes', 'internal_notes',
      // Departures grid (migration 20261030): the manual 燃油 surcharge, the
      // booked air class, and the manual AIR fare override (air_pp) recorded
      // per departure.
      'fuel_surcharge_pp', 'flight_class', 'air_pp',
      // Per-class AIR fares and typed website rates (migration 20261105).
      'air_business_pp', 'air_oneway_business_pp',
      'web_price_economy', 'web_price_business', 'web_price_oneway_business'
    ]

    const updateData: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Validate status if provided
    if (updateData.status) {
      const validStatuses = ['draft', 'open', 'limited', 'full', 'guaranteed', 'cancelled']
      if (!validStatuses.includes(updateData.status as string)) {
        return NextResponse.json(
          { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        )
      }
    }

    if (updateData.start_date !== undefined &&
        (typeof updateData.start_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(updateData.start_date))) {
      return NextResponse.json(
        { success: false, error: 'start_date must be YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Seats. The grid refused seats below what is already sold, but only in
    // the browser — any other PUT could set max_pax under booked_pax: an
    // oversold date whose available seats went negative.
    for (const f of ['max_pax', 'min_pax', 'booked_pax']) {
      if (updateData[f] === undefined || (f === 'min_pax' && updateData[f] === null)) continue
      const n = Number(updateData[f])
      if (updateData[f] === null || !Number.isInteger(n) || n < 0 || (f === 'max_pax' && n < 1)) {
        return NextResponse.json(
          { success: false, error: `${f} must be a whole number${f === 'max_pax' ? ' of at least 1' : ''}` },
          { status: 400 }
        )
      }
      updateData[f] = n
    }
    if (updateData.max_pax !== undefined || updateData.booked_pax !== undefined) {
      const { data: seats } = await supabase
        .from('tour_departures')
        .select('max_pax, booked_pax')
        .eq('id', id)
        .eq('org_id', org_id)
        .maybeSingle()
      if (!seats) {
        return NextResponse.json(
          { success: false, error: 'Departure not found' },
          { status: 404 }
        )
      }
      const maxPax = Number(updateData.max_pax ?? seats.max_pax)
      const bookedPax = Number(updateData.booked_pax ?? seats.booked_pax ?? 0)
      if (bookedPax > maxPax) {
        return NextResponse.json(
          { success: false, error: `This date already has ${bookedPax} booked — seats cannot go below that` },
          { status: 400 }
        )
      }
    }

    // Recalculate end_date if start_date or duration_days changed
    if (updateData.start_date || updateData.duration_days) {
      // Fetch current departure to get existing values
      const { data: current } = await supabase
        .from('tour_departures')
        .select('start_date, duration_days')
        .eq('id', id)
        .eq('org_id', org_id)
        .single()

      if (current) {
        const startDate = (updateData.start_date as string) || current.start_date
        const durationDays = Number(updateData.duration_days) || current.duration_days

        // Calendar arithmetic on the date string: a UTC parse plus local
        // setDate() lost a day across a DST change on a host east of UTC.
        updateData.end_date = shiftDateISO(String(startDate), durationDays - 1)
      }
    }

    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('tour_departures')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', org_id)
      .select(`
        *,
        tour_template:tour_templates(id, template_name, template_code, duration_days)
      `)
      .single()

    if (error) {
      console.error('Error updating departure:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Departure not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: unknown) {
    console.error('Departure PUT error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/departures/[id] — the same partial update as PUT. The departures
 * grid has always saved its cells (燃油, AIR, …) with PATCH, which this route
 * did not export, so those saves failed with 405 and nothing was stored.
 */
export const PATCH = PUT

/**
 * DELETE /api/departures/[id]
 * Delete a departure (and its bookings via CASCADE)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await orgAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, org_id } = authResult
    if (!supabase || !org_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Check if departure has bookings
    const { count } = await supabase
      .from('departure_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('departure_id', id)
      .eq('org_id', org_id)
      .in('status', ['pending', 'confirmed'])

    if (count && count > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete departure with ${count} active booking(s). Cancel bookings first.` },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('tour_departures')
      .delete()
      .eq('id', id)
      .eq('org_id', org_id)

    if (error) {
      console.error('Error deleting departure:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Departure deleted successfully'
    })
  } catch (error: unknown) {
    console.error('Departure DELETE error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
