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
    const body = await request.json().catch(() => ({}))
    const override = body.override === true

    // Fetch current state
    const { data: invoice, error } = await supabaseAdmin
      .from('supplier_invoices')
      .select('match_status, status')
      .eq('id', id)
      .single()

    if (error || !invoice) {
      return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 })
    }

    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      return NextResponse.json(
        { error: `Cannot approve invoice with status: ${invoice.status}` },
        { status: 400 }
      )
    }

    // Require matched status unless override
    if (invoice.match_status !== 'matched' && !override) {
      return NextResponse.json(
        { error: 'Invoice must be fully matched before approval. Pass override: true to approve with discrepancy.' },
        { status: 400 }
      )
    }

    const { data, error: updateError } = await supabaseAdmin
      .from('supplier_invoices')
      .update({
        status: 'approved',
        approved_by: body.userId || null,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: 'Failed to approve' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error approving supplier invoice:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
