// =====================================================
// BOOKINGS API - SINGLE BOOKING OPERATIONS
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { supplierBacking } from '@/lib/bookings/supplier-backing'
import { removeBookingDocumentFiles } from '@/lib/portal/traveller-documents'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Get single booking with details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    // Fetch booking with related data
    const { data: booking, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        itinerary:itineraries (
          id,
          itinerary_code,
          status
        )
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error) {
      console.error('Error fetching booking:', error)
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    // Fetch suppliers
    const { data: suppliers } = await supabaseAdmin
      .from('booking_supplier_status')
      .select('*')
      .eq('booking_id', id)
      .order('service_date', { ascending: true })

    // Each supplier row's expense — made when it was confirmed
    // (lib/bookings/supplier-expense) — for the Suppliers tab's link.
    const supplierIds = (suppliers || []).map(r => r.id as string)
    const expenseByRow = new Map<string, unknown>()
    if (supplierIds.length) {
      const { data: rowExpenses, error: expErr } = await supabaseAdmin
        .from('expenses')
        .select('id, expense_number, status, amount, currency, booking_supplier_status_id')
        .eq('org_id', orgId)
        .in('booking_supplier_status_id', supplierIds)
      if (expErr) console.error('Error fetching supplier expenses:', expErr.message)
      for (const e of rowExpenses || []) expenseByRow.set(e.booking_supplier_status_id as string, e)
    }

    // Fetch payments
    const { data: payments } = await supabaseAdmin
      .from('booking_payments')
      .select('*')
      .eq('booking_id', id)
      .order('payment_date', { ascending: false })

    // Fetch assigned guide details if exists
    let assignedGuide = null
    if (booking.assigned_guide_id) {
      const { data: guide } = await supabaseAdmin
        .from('suppliers')
        .select('id, name, phone, email')
        .eq('id', booking.assigned_guide_id)
        .single()
      assignedGuide = guide
    }

    return NextResponse.json({
      success: true,
      data: {
        ...booking,
        suppliers: (suppliers || []).map(r => ({ ...r, expense: expenseByRow.get(r.id as string) ?? null })),
        payments: payments || [],
        assigned_guide: assignedGuide,
        // Rows marked cancelled ("not needed") are out of the count — the
        // same rule as lib/bookings/supplier-backing.
        supplier_summary: {
          total: suppliers?.filter(s => s.status !== 'cancelled').length || 0,
          confirmed: suppliers?.filter(s => s.status === 'confirmed').length || 0,
          pending: suppliers?.filter(s => s.status === 'pending').length || 0,
        },
        payment_summary: {
          total_paid: payments?.reduce((sum, p) => sum + (p.payment_type !== 'refund' ? p.amount : -p.amount), 0) || 0,
        }
      }
    })
  } catch (error: unknown) {
    console.error('Booking GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update booking
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const body = await request.json()

    // Fields that can be updated
    const allowedFields = [
      'status',
      'payment_status',
      'deposit_amount',
      'deposit_paid',
      'deposit_paid_date',
      'balance_due',
      'payment_deadline',
      'assigned_guide_id',
      'assigned_vehicle_id',
      'emergency_contact',
      'emergency_phone',
      'special_requests',
      'operational_notes',
      'cancelled_at',
      'cancellation_reason',
      'portal_mode'
    ]

    // Filter body to only allowed fields
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    // If status is being set to cancelled, set cancelled_at
    if (updates.status === 'cancelled' && !updates.cancelled_at) {
      updates.cancelled_at = new Date().toISOString()
    }

    // ------------------------------------------------------------------
    // "Suppliers Confirmed" has to mean something
    // ------------------------------------------------------------------
    // The status used to be written here with no reference to the booking's
    // suppliers at all, so a booking could announce that every supplier was
    // confirmed while its Suppliers tab was empty. The rule is
    // confirm-and-proceed, not a hard block: the caller gets a 409 naming what
    // is missing, and a second request carrying status_override_ack goes
    // through and records who clicked past the warning. Nothing else about the
    // booking is written on the refused attempt.
    if (updates.status !== undefined) {
      if (updates.status === 'supplier_confirmed') {
        // The 409 below reports this booking's supplier counts, so establish
        // the caller may see them at all: booking_supplier_status is keyed by
        // booking_id alone, and only the UPDATE further down is org-scoped.
        const { data: owned } = await supabaseAdmin
          .from('bookings')
          .select('id')
          .eq('id', id)
          .eq('org_id', orgId)
          .maybeSingle()
        if (!owned) {
          return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
        }

        const { data: supplierRows } = await supabaseAdmin
          .from('booking_supplier_status')
          .select('status')
          .eq('booking_id', id)

        const { total, confirmed, backed } = supplierBacking(supplierRows)

        if (!backed) {
          if (!body.status_override_ack) {
            return NextResponse.json({
              success: false,
              code: 'supplier_status_unbacked',
              error: total === 0
                ? 'This booking has no suppliers linked yet.'
                : `Only ${confirmed} of ${total} suppliers are confirmed.`,
              suppliers: { total, confirmed },
            }, { status: 409 })
          }

          const userId = await getCurrentUserId()
          let email: string | null = null
          if (userId) {
            const { data: profile } = await supabaseAdmin
              .from('user_profiles')
              .select('email')
              .eq('id', userId)
              .maybeSingle()
            email = profile?.email ?? null
          }

          updates.status_override = {
            status: 'supplier_confirmed',
            at: new Date().toISOString(),
            by: userId,
            by_email: email,
            suppliers: { total, confirmed },
          }
        } else {
          // Backed by the supplier rows — no override to remember.
          updates.status_override = null
        }
      } else {
        // The override note describes the status the booking carries NOW, so
        // moving off that status drops it.
        updates.status_override = null
      }
    }

    const { data: booking, error } = await supabaseAdmin
      .from('bookings')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error) {
      console.error('Error updating booking:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    // Friends mode keeps each traveller's passport and health answers to
    // themselves. The booking-level (family) link shows and edits every
    // traveller, so it stops working on the switch — it stayed live, and the
    // lead holding it kept reading the friends' forms.
    let familyLinksRevoked = 0
    if (updates.portal_mode === 'friends') {
      const { data: revoked, error: revokeError } = await supabaseAdmin
        .from('booking_portal_links')
        .update({ revoked_at: new Date().toISOString() })
        .eq('booking_id', id)
        .eq('org_id', orgId)
        .is('passenger_id', null)
        .is('revoked_at', null)
        .select('id')
      if (revokeError) {
        console.error('Error revoking the family portal link:', revokeError)
        return NextResponse.json(
          { success: false, error: 'Switched to friends mode, but the family link could not be revoked — revoke it by hand.' },
          { status: 500 }
        )
      }
      familyLinksRevoked = revoked?.length ?? 0
    }

    return NextResponse.json({ success: true, data: booking, family_links_revoked: familyLinksRevoked })
  } catch (error: unknown) {
    console.error('Booking PUT error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete booking
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    // Check if booking exists in this org. The org_id check here also serves
    // as the pre-flight that prevents the cascading delete from touching
    // another org's child rows via FK cascade (booking_supplier_status,
    // booking_payments).
    const { data: booking, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('id, booking_code, status')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (fetchError || !booking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    // Prevent deletion of in-progress or completed bookings
    if (['in_progress', 'completed'].includes(booking.status)) {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete a booking that is in progress or completed'
      }, { status: 400 })
    }

    // The cascade takes the passport rows with it, but not the files: remove
    // those first, and keep the booking if that fails, so nothing is orphaned.
    const filesError = await removeBookingDocumentFiles(supabaseAdmin, id)
    if (filesError) {
      console.error('Error removing traveller documents:', filesError)
      return NextResponse.json({
        success: false,
        error: 'Could not remove the travellers\' uploaded documents, so the booking was kept. Please try again.',
      }, { status: 500 })
    }

    // Delete booking (cascades to suppliers and payments)
    const { error: deleteError } = await supabaseAdmin
      .from('bookings')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (deleteError) {
      console.error('Error deleting booking:', deleteError)
      return NextResponse.json({ success: false, error: clientMessage(deleteError, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Booking ${booking.booking_code} deleted successfully`
    })
  } catch (error: unknown) {
    console.error('Booking DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
