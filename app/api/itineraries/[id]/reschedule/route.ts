// ============================================
// POST /api/itineraries/[id]/reschedule — move a trip to a new start date
// ============================================
// The calendar's drag. The trip, its days and its resource assignments move
// together by the same number of days, in one database call; a trip with a
// booking or supplier documents is refused (see lib/itineraries/reschedule).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { businessToday } from '@/lib/today'
import { rescheduleCheck } from '@/lib/itineraries/reschedule'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const newStart = typeof body?.start_date === 'string' ? body.start_date : ''

    const { data: trip } = await supabase
      .from('itineraries')
      .select('id, status, start_date, end_date')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!trip) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })

    const [{ data: booking }, { count: documents }] = await Promise.all([
      supabase.from('bookings').select('booking_code, status').eq('itinerary_id', id).eq('org_id', orgId).limit(1).maybeSingle(),
      supabase.from('supplier_documents').select('id', { count: 'exact', head: true })
        .eq('itinerary_id', id).eq('org_id', orgId).neq('status', 'cancelled'),
    ])

    const check = rescheduleCheck({
      status: trip.status ?? null,
      startDate: String(trip.start_date),
      newStartDate: newStart,
      today: businessToday(),
      booking: booking ? { booking_code: booking.booking_code ?? null, status: booking.status ?? null } : null,
      supplierDocuments: documents ?? 0,
    })
    if ('refusal' in check) {
      return NextResponse.json({ success: false, code: 'reschedule_refused', error: check.refusal }, { status: check.status })
    }
    if (check.days === 0) return NextResponse.json({ success: true, data: trip, shifted_days: 0 })

    const { error } = await supabase.rpc('shift_itinerary_dates', { p_itinerary_id: id, p_org_id: orgId, p_days: check.days })
    if (error) {
      console.error('Error moving the trip:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Could not move the trip') }, { status: 500 })
    }

    const { data: moved } = await supabase
      .from('itineraries')
      .select('id, status, start_date, end_date')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    return NextResponse.json({ success: true, data: moved, shifted_days: check.days })
  } catch (error) {
    console.error('Reschedule error:', error)
    return NextResponse.json({ success: false, error: 'Could not move the trip' }, { status: 500 })
  }
}
