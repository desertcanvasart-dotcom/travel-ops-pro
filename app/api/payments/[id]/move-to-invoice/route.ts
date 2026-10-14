import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncInvoicePayment } from '@/lib/accounting'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { planMoveToInvoice } from '@/lib/payments/move-to-invoice'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * "Move to invoice" on the Payments list: a trip payment recorded before the
 * trip had an invoice becomes a payment on that invoice (same amount, currency,
 * date, method, reference), then the trip row is deleted. The invoice payment
 * is inserted FIRST, so a failure never loses the money; if the delete then
 * fails the answer says so, and the leftover trip row is not counted twice
 * (totals skip trip payments of an invoiced trip).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Whoever may record payments (the middleware lists the same roles).
    const forbidden = await requireRole(['admin', 'manager', 'agent'])
    if (forbidden) return forbidden

    const { id } = await params

    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!payment) return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 })

    let invoices: Array<{ id: string; invoice_number: string | null; status: string | null; currency: string | null; balance_due: number | null }> = []
    if (payment.itinerary_id) {
      const { data, error } = await supabaseAdmin
        .from('invoices')
        .select('id, invoice_number, status, currency, balance_due')
        .eq('org_id', orgId)
        .eq('itinerary_id', payment.itinerary_id)
        .neq('status', 'cancelled')
      if (error) {
        console.error('Error reading the trip invoices:', error)
        return NextResponse.json({ success: false, error: 'Failed to read the trip invoice' }, { status: 500 })
      }
      invoices = data ?? []
    }

    const plan = planMoveToInvoice(payment, invoices)
    if (!plan.ok) return NextResponse.json({ success: false, error: plan.error }, { status: plan.status })

    const { data: created, error: insertError } = await supabaseAdmin
      .from('invoice_payments')
      .insert([plan.invoicePayment])
      .select()
      .single()
    if (insertError || !created) {
      // 23514: the database's own balance check (two payments at once).
      if (insertError?.code === '23514') {
        return NextResponse.json({ success: false, error: 'Payment amount exceeds balance due, so it was not moved.' }, { status: 400 })
      }
      console.error('Error moving the payment to the invoice:', insertError)
      return NextResponse.json({ success: false, error: 'Failed to record the payment on the invoice. Nothing was changed.' }, { status: 500 })
    }

    if (created.id) {
      syncInvoicePayment(created.id).catch(err => console.error('Accounting sync failed:', err))
    }

    const { error: deleteError } = await supabaseAdmin
      .from('payments')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)
    if (deleteError) {
      console.error('Error deleting the moved trip payment:', deleteError)
      return NextResponse.json({
        success: false,
        moved: true,
        invoice_payment_id: created.id,
        error: `The payment was recorded on ${plan.invoice.invoice_number || 'the invoice'}, but the original trip payment could not be deleted. Delete the trip payment by hand; the money is counted once, on the invoice.`,
      }, { status: 500 })
    }

    return NextResponse.json({ success: true, invoice_id: plan.invoice.id, invoice_payment: created })
  } catch (error) {
    console.error('Error in move-to-invoice:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
