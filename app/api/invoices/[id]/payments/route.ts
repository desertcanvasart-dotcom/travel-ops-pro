import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncInvoicePayment } from '@/lib/accounting'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { paymentCurrencyFor } from '@/lib/payment-currency'

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

    // invoice_payments is a child table without org_id — verify the parent
    // invoice belongs to this org before listing its payments.
    const { data: parent } = await supabaseAdmin
      .from('invoices')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parent) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const { data, error } = await supabaseAdmin
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', id)
      .order('payment_date', { ascending: false })

    if (error) {
      console.error('Error fetching invoice payments:', error)
      return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error in invoice payments GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const body = await request.json()

    // Validate required fields. A number: "abc" passed `!amount || amount <= 0`
    // and surfaced as a 500, and "50" compared as text.
    const amount = typeof body.amount === 'string' && body.amount.trim() === '' ? NaN : Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'Valid payment amount is required' },
        { status: 400 }
      )
    }

    // Verify invoice exists in this org and get current balance
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('balance_due, currency, status')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Money is taken against an invoice that has been sent. The balance trigger
    // turns the status into paid / partial whatever it was, so a payment on a
    // cancelled invoice reopened it, and one on a draft that was never sent
    // made it 'partial'.
    if (invoice.status === 'cancelled' || invoice.status === 'draft') {
      return NextResponse.json(
        { error: invoice.status === 'cancelled'
            ? 'This invoice is cancelled; payments cannot be recorded against it.'
            : 'This invoice has not been sent yet; mark it as sent before recording a payment.' },
        { status: 409 }
      )
    }

    // In the invoice's currency (lib/payment-currency): the balance trigger
    // sums amounts with no currency of their own.
    const paid = paymentCurrencyFor(body.currency, invoice.currency)
    if (!paid.ok) return NextResponse.json({ error: paid.error }, { status: 400 })

    // Check if payment exceeds balance (allow small overpayment for rounding)
    if (amount > Number(invoice.balance_due) + 0.01) {
      return NextResponse.json(
        { error: `Payment amount exceeds balance due (${invoice.balance_due})` },
        { status: 400 }
      )
    }

    const newPayment = {
      invoice_id: id,
      amount,
      currency: paid.currency,
      payment_method: body.payment_method || 'bank_transfer',
      payment_date: body.payment_date || new Date().toISOString().split('T')[0],
      transaction_reference: body.transaction_reference || null,
      notes: body.notes || null,
      created_at: new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('invoice_payments')
      .insert([newPayment])
      .select()
      .single()

    if (error) {
      // The database refuses an amount above the balance too (a trigger that
      // locks the invoice): two payments recorded at once both passed the
      // check above. 23514 = check_violation.
      if (error.code === '23514') {
        return NextResponse.json({ error: 'Payment amount exceeds balance due' }, { status: 400 })
      }
      console.error('Error creating payment:', error)
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }

    // Note: The trigger function will automatically update the invoice's
    // amount_paid, balance_due, and status

    // Fire-and-forget accounting sync
    if (data?.id) {
      syncInvoicePayment(data.id).catch(err => console.error('Accounting sync failed:', err))
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Error in invoice payments POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
