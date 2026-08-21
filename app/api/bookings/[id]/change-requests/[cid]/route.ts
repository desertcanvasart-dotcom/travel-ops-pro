// ============================================
// POST /api/bookings/[id]/change-requests/[cid] — approve or reject
// ============================================
// Approve is the ONLY way the customer-requested count actually rises: it bumps
// num_adults and seeds the new passenger rows (which the portal then lets the
// new people fill). It does NOT recompute the price — that is the operator's
// existing pricing flow; the response flags that a re-price is due.

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'

export const dynamic = 'force-dynamic'
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cid: string }> }
) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id, cid } = await params

  const body = await request.json().catch(() => ({}))
  const action = body?.action
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  const { data: req } = await admin
    .from('booking_change_requests')
    .select('id, booking_id, requested_count, status')
    .eq('id', cid)
    .eq('booking_id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (req.status !== 'pending') {
    return NextResponse.json({ error: 'Request already resolved' }, { status: 409 })
  }

  if (action === 'reject') {
    await admin.from('booking_change_requests')
      .update({ status: 'rejected', resolved_at: new Date().toISOString() })
      .eq('id', cid)
    return NextResponse.json({ success: true, status: 'rejected' })
  }

  // Approve: bump the booked count and seed the new (blank) passenger rows.
  const { data: booking } = await admin
    .from('bookings')
    .select('id, num_adults, num_children')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const newAdults = (booking.num_adults ?? 0) + req.requested_count
  const { error: bumpErr } = await admin
    .from('bookings')
    .update({ num_adults: newAdults, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (bumpErr) return NextResponse.json({ error: clientMessage(bumpErr, 'Could not update booking') }, { status: 500 })

  const rows = Array.from({ length: req.requested_count }, () => ({
    org_id: orgId, booking_id: id, first_name: '', last_name: '', passenger_type: 'adult', is_lead_passenger: false,
  }))
  await admin.from('booking_passengers').insert(rows)

  await admin.from('booking_change_requests')
    .update({ status: 'approved', resolved_at: new Date().toISOString() })
    .eq('id', cid)

  return NextResponse.json({
    success: true,
    status: 'approved',
    added: req.requested_count,
    newBookedCount: newAdults + (booking.num_children ?? 0),
    // The count changed; the stored total has not. Operator re-prices next.
    repriceNeeded: true,
  })
}
