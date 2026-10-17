import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { orgAuth } from '@/lib/auth/org-auth'
import { holdTransition } from '@/lib/departures/holds'
import { seatCounts, type SeatHold } from '@/lib/departures/seats'

// ============================================
// ONE SEAT HOLD ON A DEPARTURE
// File: app/api/departures/[id]/holds/[holdId]/route.ts
//
// PATCH { action: 'confirm' | 'release' } — the office confirms a website
// order's pending hold, or releases a hold so its seats are free again
// (lib/departures/holds). This company's departure and hold only.
// ============================================

interface RouteParams {
  params: Promise<{ id: string; holdId: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await orgAuth()
    if (authResult.error) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, org_id } = authResult
    if (!supabase || !org_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const { id, holdId } = await params
    const body = await request.json().catch(() => ({}))

    const { data: departure } = await supabase
      .from('tour_departures')
      .select('id, status, max_pax, booked_pax')
      .eq('id', id)
      .eq('org_id', org_id)
      .maybeSingle()
    if (!departure) {
      return NextResponse.json({ success: false, error: 'Departure not found' }, { status: 404 })
    }

    const { data: hold } = await supabase
      .from('departure_bookings')
      .select('id, status')
      .eq('id', holdId)
      .eq('departure_id', id)
      .eq('org_id', org_id)
      .maybeSingle()
    if (!hold) {
      return NextResponse.json({ success: false, error: 'Hold not found' }, { status: 404 })
    }

    const step = holdTransition(body?.action, hold.status, departure.status)
    if ('error' in step) {
      return NextResponse.json({ success: false, error: step.error }, { status: step.status })
    }

    // Only from the status just read: a second click, or another member
    // acting on the same hold, finds nothing to change instead of
    // overwriting their answer.
    const { data: updated, error } = await supabase
      .from('departure_bookings')
      .update({ status: step.to, updated_at: new Date().toISOString() })
      .eq('id', holdId)
      .eq('departure_id', id)
      .eq('org_id', org_id)
      .eq('status', step.from)
      .select('id, client_id, itinerary_id, client_name, pax, status, notes, created_at')
      .maybeSingle()
    if (error) {
      console.error('Error updating seat hold:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }
    if (!updated) {
      return NextResponse.json({ success: false, error: 'This hold was changed by someone else — reload the page' }, { status: 409 })
    }

    const { data: live } = await supabase
      .from('departure_bookings')
      .select('pax, status')
      .eq('org_id', org_id)
      .eq('departure_id', id)
      .in('status', ['pending', 'confirmed'])

    return NextResponse.json({
      success: true,
      data: { hold: updated, seats: seatCounts(departure, (live ?? []) as SeatHold[]) },
    })
  } catch (error: unknown) {
    console.error('Seat hold PATCH error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
