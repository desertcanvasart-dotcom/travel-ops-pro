import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Fetch current state
    const { data: invoice, error } = await supabaseAdmin
      .from('supplier_invoices')
      .select('status')
      .eq('id', id)
      .single()

    if (error || !invoice) {
      return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 })
    }

    if (invoice.status !== 'approved') {
      return NextResponse.json(
        { error: 'Invoice must be approved before payment' },
        { status: 400 }
      )
    }

    // M29: conditional UPDATE — the WHERE clause includes the expected
    // previous state, so two concurrent /pay requests can't both succeed.
    // The earlier .single() pre-read above is retained only to produce a
    // friendly 400 ("must be approved") for clearly-wrong states; the
    // .eq('status','approved') below is the actual race-safety guard.
    // .maybeSingle() returns data=null when 0 rows match, which means
    // another concurrent caller already flipped the invoice — return 409.
    const { data, error: updateError } = await supabaseAdmin
      .from('supplier_invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: body.payment_method || null,
        payment_reference: body.payment_reference || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'approved')
      .select()
      .maybeSingle()

    if (updateError) {
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }
    if (!data) {
      // Invoice was 'approved' at pre-check but is no longer — a concurrent
      // request won the race. Returning 409 lets the caller refresh and
      // see the actual state instead of silently re-cascading expenses.
      return NextResponse.json(
        { error: 'Invoice state changed since the request was issued (likely already paid by a concurrent request)' },
        { status: 409 }
      )
    }

    // Cascade: mark linked expenses as paid. Only runs when THIS request
    // was the winning racer — the conditional UPDATE above guarantees
    // exactly one winner per concurrent batch, so expenses can't be
    // double-cascaded.
    const { data: links } = await supabaseAdmin
      .from('supplier_invoice_expenses')
      .select('expense_id')
      .eq('supplier_invoice_id', id)

    if (links && links.length > 0) {
      const expenseIds = links.map(l => l.expense_id)
      await supabaseAdmin
        .from('expenses')
        .update({
          status: 'paid',
          payment_method: body.payment_method || null,
          payment_date: new Date().toISOString().split('T')[0],
          payment_reference: body.payment_reference || null,
          updated_at: new Date().toISOString(),
        })
        .in('id', expenseIds)
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error paying supplier invoice:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
