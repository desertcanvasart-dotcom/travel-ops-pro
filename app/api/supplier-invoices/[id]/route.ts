import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Fetch supplier invoice
    const { data: invoice, error } = await supabaseAdmin
      .from('supplier_invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !invoice) {
      return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 })
    }

    // Fetch matched expenses
    const { data: matches } = await supabaseAdmin
      .from('supplier_invoice_expenses')
      .select('*, expense:expenses(*)')
      .eq('supplier_invoice_id', id)

    return NextResponse.json({
      ...invoice,
      matched_expenses: matches || [],
    })
  } catch (error) {
    console.error('Error fetching supplier invoice:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Remove immutable fields AND reconciliation/state fields — those are owned by
    // the approve / pay / match / dispute routes, not this generic edit endpoint.
    const {
      id: _, created_at, internal_reference, matched_expenses,
      status, match_status, matched_amount, discrepancy_amount, discrepancy_notes,
      paid_at, payment_date, payment_method, payment_reference, approved_at, approved_by,
      ...updateData
    } = body

    const { data, error } = await supabaseAdmin
      .from('supplier_invoices')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating supplier invoice:', error)
      return NextResponse.json({ error: 'Failed to update supplier invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in supplier-invoices PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await supabaseAdmin
      .from('supplier_invoices')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting supplier invoice:', error)
      return NextResponse.json({ error: 'Failed to delete supplier invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in supplier-invoices DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
