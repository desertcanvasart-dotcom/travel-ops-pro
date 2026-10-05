// =====================================================
// BOOKING SUPPLIERS API
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { syncSupplierExpense } from '@/lib/bookings/supplier-expense'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List suppliers for a booking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    // M3 Phase 2A: verify the parent booking belongs to this org BEFORE
    // returning its child supplier rows. booking_supplier_status inherits
    // org scoping via FK.
    const { data: parentBooking } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parentBooking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    const { data: suppliers, error } = await supabaseAdmin
      .from('booking_supplier_status')
      .select('*')
      .eq('booking_id', id)
      .order('service_date', { ascending: true })

    if (error) {
      console.error('Error fetching suppliers:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // Each row's expense (made when it was confirmed), for the page's link.
    const ids = (suppliers || []).map(r => r.id as string)
    const expenseByRow = new Map<string, unknown>()
    if (ids.length) {
      const { data: expenses, error: expErr } = await supabaseAdmin
        .from('expenses')
        .select('id, expense_number, status, amount, currency, booking_supplier_status_id')
        .eq('org_id', orgId)
        .in('booking_supplier_status_id', ids)
      if (expErr) console.error('Error fetching supplier expenses:', expErr.message)
      for (const e of expenses || []) expenseByRow.set(e.booking_supplier_status_id as string, e)
    }

    return NextResponse.json({
      success: true,
      data: (suppliers || []).map(r => ({ ...r, expense: expenseByRow.get(r.id as string) ?? null })),
    })
  } catch (error: unknown) {
    console.error('Suppliers GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Add supplier or update status
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const body = await request.json()

    // M3 Phase 2A: verify the parent booking belongs to this org BEFORE
    // mutating any child rows (insert or status update). booking_supplier_
    // status has no org_id of its own — without this pre-check a caller
    // could insert a supplier row against another org's booking_id.
    const { data: parentBooking } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parentBooking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    // If supplier_id is provided in body, update existing supplier
    if (body.id) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

      // Update status and confirmation details
      if (body.status !== undefined) updates.status = body.status
      if (body.confirmation_number !== undefined) updates.confirmation_number = body.confirmation_number
      if (body.confirmation_notes !== undefined) updates.confirmation_notes = body.confirmation_notes
      if (body.confirmed_cost !== undefined) {
        const cost = body.confirmed_cost === null || body.confirmed_cost === '' ? null : Number(body.confirmed_cost)
        if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
          return NextResponse.json({ success: false, error: 'confirmed_cost must be a positive number' }, { status: 400 })
        }
        updates.confirmed_cost = cost
      }

      // If marking as confirmed, set confirmed_at
      if (body.status === 'confirmed' && !body.confirmed_at) {
        updates.confirmed_at = new Date().toISOString()
      }

      const { data: supplier, error } = await supabaseAdmin
        .from('booking_supplier_status')
        .update(updates)
        .eq('id', body.id)
        .eq('booking_id', id)
        .select()
        .single()

      if (error) {
        console.error('Error updating supplier:', error)
        return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
      }

      // Check if all suppliers are confirmed and update booking status
      await checkAndUpdateBookingStatus(id)

      // Confirmed with a cost → the trip owes this supplier: keep its expense
      // in step (lib/bookings/supplier-expense). The status save stands even
      // if this fails; the page says the expense was not recorded.
      const sync = await syncSupplierExpense(supabaseAdmin, orgId, supplier.id)
      if (!sync.ok) {
        console.error('[bookings/suppliers] expense sync:', sync.error)
        return NextResponse.json({ success: true, data: { ...supplier, expense: null }, expense_error: 'Saved, but the expense could not be recorded' })
      }
      return NextResponse.json({ success: true, data: { ...supplier, expense: sync.expense }, expense_action: sync.action })
    }

    // Create new supplier entry
    const { supplier_type, supplier_name } = body

    if (!supplier_type || !supplier_name) {
      return NextResponse.json({
        success: false,
        error: 'supplier_type and supplier_name are required'
      }, { status: 400 })
    }

    const { data: supplier, error } = await supabaseAdmin
      .from('booking_supplier_status')
      .insert({
        booking_id: id,
        supplier_id: body.supplier_id || null,
        supplier_type,
        supplier_name,
        service_description: body.service_description || null,
        service_date: body.service_date || null,
        contact_name: body.contact_name || null,
        contact_email: body.contact_email || null,
        contact_phone: body.contact_phone || null,
        quoted_cost: body.quoted_cost || null,
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating supplier:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: supplier }, { status: 201 })
  } catch (error: unknown) {
    console.error('Suppliers POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to check if all suppliers are confirmed and update booking status
async function checkAndUpdateBookingStatus(bookingId: string) {
  const { data: suppliers } = await supabaseAdmin
    .from('booking_supplier_status')
    .select('status')
    .eq('booking_id', bookingId)

  if (!suppliers || suppliers.length === 0) return

  const allConfirmed = suppliers.every(s => s.status === 'confirmed')

  if (allConfirmed) {
    // Get current booking status
    const { data: booking } = await supabaseAdmin
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .single()

    // Only auto-update if still in pending status
    if (booking && booking.status === 'pending') {
      await supabaseAdmin
        .from('bookings')
        // Every linked supplier is confirmed, so this promotion IS backed by
        // the supplier rows — any earlier operator override is now moot.
        .update({ status: 'supplier_confirmed', status_override: null, updated_at: new Date().toISOString() })
        .eq('id', bookingId)
    }
  }
}
