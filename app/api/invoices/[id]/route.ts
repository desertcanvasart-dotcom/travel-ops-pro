import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { recordsInOrg } from '@/lib/org-refs'
import { roundToCurrency } from '@/lib/currency-totals'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error) {
      console.error('Error fetching invoice:', error)
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // When the balance is due, from the trip's booking — the portal and
    // WhatsApp copies of this invoice print it; the office's own did not.
    let balance_due_date: string | null = null
    if (data?.itinerary_id) {
      const { data: booking } = await supabaseAdmin
        .from('bookings')
        .select('balance_due_date')
        .eq('itinerary_id', data.itinerary_id)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      balance_due_date = (booking?.balance_due_date as string | null) ?? null
    }

    return NextResponse.json({ ...data, balance_due_date })
  } catch (error) {
    console.error('Error in invoice GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const body = await request.json()

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    // List of allowed fields to update.
    // amount_paid / balance_due / paid_at are DERIVED from payment activity (see
    // the payments routes) and are intentionally excluded — otherwise a caller
    // could mark an invoice paid or zero out the balance via this edit endpoint.
    const allowedFields = [
      'client_id', 'itinerary_id', 'client_name', 'client_email',
      'line_items', 'subtotal', 'tax_rate', 'tax_amount', 'discount_amount',
      'total_amount', 'currency', 'status',
      'issue_date', 'due_date', 'notes', 'payment_terms', 'payment_instructions',
      'sent_at'
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (!(await recordsInOrg(supabaseAdmin, orgId, { itinerary_id: updateData.itinerary_id, client_id: updateData.client_id }))) {
      return NextResponse.json({ error: 'Itinerary or client not found' }, { status: 404 })
    }

    // A new total or currency re-derives what the payments leave owing.
    if (updateData.total_amount !== undefined || updateData.currency !== undefined) {
      const { data: currentInvoice } = await supabaseAdmin
        .from('invoices')
        .select('amount_paid, currency, status, paid_at')
        .eq('id', id)
        .eq('org_id', orgId)
        .single()

      if (currentInvoice) {
        const paid = Number(currentInvoice.amount_paid || 0)
        // amount_paid is the sum of payments made in the invoice's currency;
        // relabelling it would state ¥ payments as €.
        if (updateData.currency !== undefined && paid > 0 &&
            String(updateData.currency || '').toUpperCase() !== String(currentInvoice.currency || '').toUpperCase()) {
          return NextResponse.json(
            { error: 'An invoice with payments keeps its currency' },
            { status: 409 }
          )
        }
        if (updateData.total_amount !== undefined) {
          const total = Number(updateData.total_amount)
          if (updateData.total_amount === '' || updateData.total_amount === null || !Number.isFinite(total) || total < 0) {
            return NextResponse.json({ error: 'total_amount must be a non-negative number' }, { status: 400 })
          }
          const currency = updateData.currency ?? currentInvoice.currency
          updateData.balance_due = roundToCurrency(total - paid, currency)
          // As the payment routes: a 'paid' invoice raised above its payments
          // is 'partial' again (and chased); one lowered to them is 'paid'.
          // A status the caller set explicitly stands.
          const status = updateData.status ?? currentInvoice.status
          if (updateData.status === undefined && paid > 0 && !['draft', 'cancelled'].includes(status)) {
            updateData.status = paid >= total ? 'paid' : 'partial'
            updateData.paid_at = updateData.status === 'paid' ? (currentInvoice.paid_at || new Date().toISOString()) : null
          }
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from('invoices')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error) {
      console.error('Error updating invoice:', error)
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in invoice PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    // Verify the invoice belongs to this org BEFORE touching its children.
    // invoice_payments doesn't carry org_id (it inherits via FK), so deleting
    // by invoice_id without this check would let one org delete another's
    // payments while the parent invoice survives the org-scoped delete below.
    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // First delete related payments
    await supabaseAdmin
      .from('invoice_payments')
      .delete()
      .eq('invoice_id', id)

    // Then delete the invoice
    const { error } = await supabaseAdmin
      .from('invoices')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) {
      console.error('Error deleting invoice:', error)
      return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in invoice DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}