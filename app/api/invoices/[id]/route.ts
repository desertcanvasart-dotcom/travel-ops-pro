import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { recordsInOrg } from '@/lib/org-refs'
import { roundToCurrency } from '@/lib/currency-totals'
import { switchInvoiceVat } from '@/lib/invoices/totals'
import { isSettableInvoiceStatus, SETTABLE_INVOICE_STATUSES } from '@/lib/invoices/validate'
import { displayStatus } from '@/lib/invoices/status'
import { businessToday } from '@/lib/today'
import { getOrgVatRate, loadTripVatExtras, parseVatApplied, tripVatExcludedShare } from '@/lib/vat'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Why an invoice cannot be cancelled now, or null. Every invoice_payments row
 * is money received (a payment taken back is deleted from the invoice, not
 * flagged), so any row — or a non-zero amount_paid — blocks it. invoice_payments
 * has no org_id; the caller has checked the invoice is this company's.
 */
async function cancelRefusal(invoiceId: string, invoice: { amount_paid?: unknown; currency?: string | null }): Promise<string | null> {
  const { data: rows } = await supabaseAdmin
    .from('invoice_payments')
    .select('amount')
    .eq('invoice_id', invoiceId)
  const recorded = (rows ?? []).reduce((sum: number, r: { amount: unknown }) => sum + (Number(r.amount) || 0), 0)
  const paid = Math.max(recorded, Number(invoice.amount_paid) || 0)
  if ((rows ?? []).length === 0 && paid <= 0) return null
  return (
    `This invoice has ${rows?.length || 1} payment(s) recorded against it (${invoice.currency || ''} ${paid}), so it cannot be cancelled: ` +
    'cancelling would leave that money with no invoice. If it was paid back to the client (refunded), delete the payment(s) ' +
    'from the invoice first, then cancel it. If it was not refunded, leave the invoice as it is.'
  )
}

/**
 * Give back the extras and upgrades this invoice billed (invoiced_at and
 * invoice_id cleared), exactly as deleting the invoice does: they carry the
 * stamp that stops them being billed twice, and a cancelled invoice bills
 * nothing. A database without migration 20260828_booking_extras has no table.
 */
async function releaseExtras(invoiceId: string, orgId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('booking_extras')
    .update({ invoiced_at: null, invoice_id: null })
    .eq('invoice_id', invoiceId)
    .eq('org_id', orgId)
  if (error) console.error('invoices: could not release extras', error)
}

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

    // display_status: 'overdue' worked out as the list does (lib/invoices/status).
    return NextResponse.json({ ...data, balance_due_date, display_status: displayStatus(data, businessToday()) })
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
    // tax_rate / tax_amount are the invoice's recorded VAT (lib/vat.ts): the
    // server works them out when VAT is switched (vat_applied, below) and never
    // takes them from the body.
    // amount_paid / balance_due / paid_at are DERIVED from payment activity (see
    // the payments routes) and are intentionally excluded — otherwise a caller
    // could mark an invoice paid or zero out the balance via this edit endpoint.
    // So is subtotal: it is the total plus the discount, worked out below.
    const allowedFields = [
      'client_id', 'itinerary_id', 'client_name', 'client_email',
      'line_items', 'discount_amount',
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

    // A status set by hand is one of draft / sent / viewed / cancelled. paid and
    // partial follow from the payments (the trigger sets them) and overdue from
    // the due date; `{status: 'paid'}` on an invoice with a balance still due
    // was stored as sent.
    if (updateData.status !== undefined && !isSettableInvoiceStatus(updateData.status)) {
      return NextResponse.json(
        { error: `status must be one of ${SETTABLE_INVOICE_STATUSES.join(', ')} (paid and partial follow from payments)` },
        { status: 400 }
      )
    }

    // Cancelling gives the invoice's extras back, as deleting does, and is
    // refused while money is recorded against it: that money would be left
    // with no invoice. A cancelled invoice stays cancelled (its extras may
    // already be on a new one).
    let cancelling = false
    if (updateData.status !== undefined) {
      const { data: statusRow } = await supabaseAdmin
        .from('invoices')
        .select('status, amount_paid, currency')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle()
      if (!statusRow) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      if (statusRow.status === 'cancelled' && updateData.status !== 'cancelled') {
        return NextResponse.json(
          { error: 'A cancelled invoice cannot be reopened, because its extras may already be on another invoice. Raise a new invoice instead.' },
          { status: 409 }
        )
      }
      if (updateData.status === 'cancelled' && statusRow.status !== 'cancelled') {
        cancelling = true
        const refusal = await cancelRefusal(id, statusRow)
        if (refusal) return NextResponse.json({ error: refusal }, { status: 409 })
      }
    }

    // The amounts of a VAT-applied invoice are worked out together (net, VAT,
    // total): a new total here left tax_amount and the base stale, so the
    // invoice stated the VAT of the old figure. Switch VAT off, change the
    // amounts, switch it on.
    const amountsTouched = ['total_amount', 'discount_amount', 'line_items', 'currency'].some(k => updateData[k] !== undefined)
    if (amountsTouched) {
      const { data: vatCheck } = await supabaseAdmin
        .from('invoices')
        .select('vat_applied')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle()
      if (vatCheck?.vat_applied === true) {
        return NextResponse.json({ error: 'This invoice carries VAT. Switch VAT off before changing its amounts, then switch it on again.' }, { status: 409 })
      }
    }

    // VAT switched on or off: re-worked from the invoice's own net at the
    // company's rate today. Not together with a new total — which figure the
    // VAT is on would be a guess.
    const vatWanted = parseVatApplied(body.vat_applied)
    if (vatWanted !== undefined) {
      if (updateData.total_amount !== undefined || updateData.currency !== undefined) {
        return NextResponse.json({ error: 'Switch VAT on its own, not together with a new total or currency' }, { status: 400 })
      }
      const { data: currentInvoice } = await supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle()
      if (!currentInvoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      if (vatWanted !== (currentInvoice.vat_applied === true)) {
        // On: the base leaves out its insurance and extras lines and the
        // trip's own extras share, as at issue (lib/vat.ts).
        const tripShare = vatWanted && currentInvoice.itinerary_id
          ? tripVatExcludedShare(await loadTripVatExtras(supabaseAdmin, currentInvoice.itinerary_id))
          : 0
        const switched = switchInvoiceVat(currentInvoice, vatWanted, vatWanted ? await getOrgVatRate(supabaseAdmin, orgId) : 0, tripShare)
        if (!switched.ok) return NextResponse.json({ error: switched.error }, { status: 409 })
        Object.assign(updateData, switched.updates)
      }
    }

    // A new total or currency re-derives what the payments leave owing.
    if (updateData.total_amount !== undefined || updateData.currency !== undefined) {
      const { data: currentInvoice } = await supabaseAdmin
        .from('invoices')
        .select('amount_paid, currency, status, paid_at, discount_amount')
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
          // subtotal + tax - discount = total (lib/invoices/totals); no VAT
          // here (guarded above), so the subtotal is the total plus the discount.
          const discount = Number(updateData.discount_amount ?? currentInvoice.discount_amount) || 0
          updateData.subtotal = roundToCurrency(total + discount, currency)
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

    // Cancelled: its extras are owed again (released, or they are never billed).
    if (cancelling) await releaseExtras(id, orgId)

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
    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('id, amount_paid')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // An invoice that has taken money is a record of it, and what was posted
    // to the accounting system stays there: it is not deleted from under its
    // payments. They are deleted first (the payment route flags what was
    // already posted). invoice_payments has no org_id; the invoice was checked above.
    const { count: paymentCount } = await supabaseAdmin
      .from('invoice_payments')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', id)
    if ((paymentCount ?? 0) > 0 || Number(invoice.amount_paid) > 0) {
      return NextResponse.json(
        { error: 'This invoice has payments recorded against it, so it cannot be deleted. If they were entered by mistake, delete the payments first.' },
        { status: 409 }
      )
    }

    // The extras and upgrades this invoice billed carry its id and invoiced_at,
    // which is what stops them being billed twice. booking_extras.invoice_id is
    // ON DELETE SET NULL, so the ids are read first: after the delete only
    // invoiced_at would tell they were billed.
    const { data: billed } = await supabaseAdmin
      .from('booking_extras')
      .select('id')
      .eq('invoice_id', id)
      .eq('org_id', orgId)
    // A database without migration 20260828_booking_extras has no table: nothing to release.
    const billedIds = (billed ?? []).map((e: { id: string }) => e.id)

    // Delete the invoice
    const { error } = await supabaseAdmin
      .from('invoices')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) {
      console.error('Error deleting invoice:', error)
      return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
    }

    // With the invoice gone they are owed again: released, or they are never
    // billed. After the delete, so a failed delete does not free the extras of
    // an invoice that still exists to be billed a second time.
    if (billedIds.length) {
      const { error: releaseError } = await supabaseAdmin
        .from('booking_extras')
        .update({ invoiced_at: null, invoice_id: null })
        .in('id', billedIds)
        .eq('org_id', orgId)
      if (releaseError) console.error('invoices: could not release extras', releaseError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in invoice DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}