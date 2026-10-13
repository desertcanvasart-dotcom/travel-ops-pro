import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { orgAuth } from '@/lib/auth/org-auth'
import { shiftDateISO } from '@/lib/today'
import { recordsInOrg } from '@/lib/org-refs'
import { rowInOrg } from '@/lib/api/org-scope'
import { DEPARTURE_STATUSES, heldPax, seatCounts, type SeatHold } from '@/lib/departures/seats'
import {
  MIRRORED_MESSAGE,
  durationError,
  mirroredFieldsTouched,
  paxRangeError,
  seatsBelowTakenMessage,
} from '@/lib/departures/validate'

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
        tour_template:tour_templates(id, template_name, template_code, duration_days, short_description)
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

    // Its seat holds, newest first — this company's rows only, read on their
    // own rather than embedded so the org filter is explicit.
    const { data: holdRows, error: holdErr } = await supabase
      .from('departure_bookings')
      .select('id, client_id, itinerary_id, client_name, pax, status, notes, created_at')
      .eq('departure_id', id)
      .eq('org_id', org_id)
      .order('created_at', { ascending: false })
    if (holdErr) {
      console.error('Error fetching departure holds:', holdErr)
      return NextResponse.json(
        { success: false, error: clientMessage(holdErr, 'Internal server error') },
        { status: 500 }
      )
    }
    const bookings = (holdRows ?? []) as Array<SeatHold & { id: string }>

    // The seats as every screen counts them (lib/departures/seats): booked
    // outside the app + confirmed + pending holds.
    return NextResponse.json({
      success: true,
      data: { ...data, bookings, ...seatCounts(data, bookings.filter(b => b.status !== 'cancelled')) }
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
    if (updateData.status !== undefined) {
      if (!(DEPARTURE_STATUSES as readonly string[]).includes(updateData.status as string)) {
        return NextResponse.json(
          { success: false, error: `Invalid status. Must be one of: ${DEPARTURE_STATUSES.join(', ')}` },
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

    // A tour length is a whole number of days. `Number(x) || current` let
    // 2.5 through and silently ignored 0.
    if (updateData.duration_days !== undefined) {
      const bad = durationError(updateData.duration_days)
      if (bad) return NextResponse.json({ success: false, error: bad }, { status: 400 })
      updateData.duration_days = Number(updateData.duration_days)
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

    const { data: current } = await supabase
      .from('tour_departures')
      .select('id, start_date, duration_days, max_pax, min_pax, booked_pax, status, externally_managed')
      .eq('id', id)
      .eq('org_id', org_id)
      .maybeSingle()
    if (!current) {
      return NextResponse.json(
        { success: false, error: 'Departure not found' },
        { status: 404 }
      )
    }

    // A departure an integration mirrors is the partner's: the next sync
    // puts its own dates, seats, status and price back over any edit here.
    // The office's own columns (fuel, AIR, website rates, internal notes,
    // guide and vehicle) stay editable.
    if (current.externally_managed) {
      const touched = mirroredFieldsTouched(updateData)
      if (touched.length > 0) {
        return NextResponse.json(
          { success: false, error: `${MIRRORED_MESSAGE} (${touched.join(', ')})` },
          { status: 409 }
        )
      }
    }

    // The guide is one of this company's suppliers and the vehicle one of its
    // vehicles — the same checks as a trip's (app/api/itineraries/[id]). The
    // columns have no foreign key, so another company's id was stored as is.
    if (updateData.assigned_guide_id !== undefined) {
      if (updateData.assigned_guide_id && !(await recordsInOrg(supabase, org_id, { supplier_id: updateData.assigned_guide_id }))) {
        return NextResponse.json({ success: false, error: 'Guide not found' }, { status: 404 })
      }
      updateData.assigned_guide_id = updateData.assigned_guide_id || null
    }
    if (updateData.assigned_vehicle_id !== undefined) {
      if (updateData.assigned_vehicle_id && (typeof updateData.assigned_vehicle_id !== 'string' ||
          !(await rowInOrg(supabase, 'vehicles', updateData.assigned_vehicle_id, org_id)))) {
        return NextResponse.json({ success: false, error: 'Vehicle not found' }, { status: 404 })
      }
      updateData.assigned_vehicle_id = updateData.assigned_vehicle_id || null
    }

    const rangeError = paxRangeError(
      updateData.max_pax ?? current.max_pax,
      updateData.min_pax !== undefined ? updateData.min_pax : current.min_pax
    )
    if (rangeError) {
      return NextResponse.json({ success: false, error: rangeError }, { status: 400 })
    }

    // Cancelling releases the date's pending holds (the trigger from
    // migration 20261215); the answer says what happened to them.
    let cancellation: { holds_released: number; confirmed_holds: number } | null = null
    if (updateData.status === 'cancelled' && current.status !== 'cancelled') {
      const { data: live } = await supabase
        .from('departure_bookings')
        .select('pax, status')
        .eq('org_id', org_id)
        .eq('departure_id', id)
        .in('status', ['pending', 'confirmed'])
      const rows = (live ?? []) as SeatHold[]
      cancellation = {
        holds_released: rows.filter(h => h.status === 'pending').length,
        confirmed_holds: rows.filter(h => h.status === 'confirmed').length,
      }
    }

    // max_pax and booked_pax change in the database, under the departure's
    // row lock, and only while booked_pax + the live holds still fit
    // (set_departure_seats, migration 20261215). Checked here against
    // booked_pax alone and written without the lock, six pending web-order
    // holds and max_pax lowered to 4 left the date held past its maximum.
    if (updateData.max_pax !== undefined || updateData.booked_pax !== undefined) {
      const { data: seats, error: seatsErr } = await supabase.rpc('set_departure_seats', {
        p_org_id: org_id,
        p_departure_id: id,
        p_max_pax: updateData.max_pax as number | undefined,
        p_booked_pax: updateData.booked_pax as number | undefined,
      })
      const r = seats as { ok?: boolean; reason?: string; booked_pax?: number; held?: number; taken?: number } | null
      if (seatsErr || !r) {
        console.error('Error updating departure seats:', seatsErr ?? 'no answer')
        return NextResponse.json(
          { success: false, error: clientMessage(seatsErr, 'Could not change the seats') },
          { status: 500 }
        )
      }
      if (!r.ok) {
        return r.reason === 'not_found'
          ? NextResponse.json({ success: false, error: 'Departure not found' }, { status: 404 })
          : NextResponse.json({ success: false, error: seatsBelowTakenMessage(r) }, { status: 400 })
      }
      delete updateData.max_pax
      delete updateData.booked_pax
    }

    // Recalculate end_date if start_date or duration_days changed.
    // Calendar arithmetic on the date string: a UTC parse plus local
    // setDate() lost a day across a DST change on a host east of UTC.
    if (updateData.start_date !== undefined || updateData.duration_days !== undefined) {
      const startDate = (updateData.start_date as string | undefined) ?? current.start_date
      const durationDays = Number(updateData.duration_days ?? current.duration_days) || 1
      updateData.end_date = shiftDateISO(String(startDate), durationDays - 1)
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
      // The (org, programme, start date) key — the same answer POST gives.
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A departure for this tour on this date already exists' },
          { status: 409 }
        )
      }
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

    const { data: holds } = await supabase
      .from('departure_bookings')
      .select('pax, status')
      .eq('org_id', org_id)
      .eq('departure_id', id)
      .in('status', ['pending', 'confirmed'])

    return NextResponse.json({
      success: true,
      data: { ...data, ...seatCounts(data, (holds ?? []) as SeatHold[]) },
      ...(cancellation ? { cancellation } : {})
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

    const { data: current } = await supabase
      .from('tour_departures')
      .select('id, externally_managed')
      .eq('id', id)
      .eq('org_id', org_id)
      .maybeSingle()
    if (!current) {
      return NextResponse.json(
        { success: false, error: 'Departure not found' },
        { status: 404 }
      )
    }
    // A mirrored departure deleted here is re-inserted by the next sync.
    if (current.externally_managed) {
      return NextResponse.json(
        { success: false, error: `${MIRRORED_MESSAGE}. Remove it at the partner.` },
        { status: 409 }
      )
    }

    // Live holds (pending or confirmed) block the delete, and the answer
    // names them; the departure page releases them. Cancelled holds go with
    // the departure (ON DELETE CASCADE).
    const { data: live, error: liveErr } = await supabase
      .from('departure_bookings')
      .select('client_name, pax, status')
      .eq('departure_id', id)
      .eq('org_id', org_id)
      .in('status', ['pending', 'confirmed'])
    if (liveErr) {
      console.error('Error reading departure holds:', liveErr)
      return NextResponse.json(
        { success: false, error: clientMessage(liveErr, 'Internal server error') },
        { status: 500 }
      )
    }

    const holds = (live ?? []) as Array<{ client_name: string | null; pax: number; status: string }>
    if (holds.length > 0) {
      const { confirmed, pending } = heldPax(holds)
      const who = holds.map(h => `${h.client_name || 'unnamed'} (${h.pax}, ${h.status})`).join(', ')
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete: ${holds.length} live seat hold(s) — ${pending} pending, ${confirmed} confirmed seat(s): ${who}. Release them on the departure's page first.`,
          holds: holds.length
        },
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
