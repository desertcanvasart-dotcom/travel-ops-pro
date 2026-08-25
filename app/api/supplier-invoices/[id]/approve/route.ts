import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const override = body.override === true

    // Fetch current state
    const { data: invoice, error } = await supabaseAdmin
      .from('supplier_invoices')
      .select('match_status, status')
      .eq('id', id)
      .eq('org_id', orgId)
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

    // M29: conditional UPDATE protects against the check-then-write race.
    // Even if two requests both passed the pre-check, only ONE will
    // satisfy this WHERE clause and produce a row.
    //   - status must NOT already be 'paid' or 'cancelled'
    //   - match_status must be 'matched' unless override=true
    // The pre-checks above stay so well-formed bad-state requests still
    // get specific 400 messages; the conditional update is the safety net.
    let updateQuery = supabaseAdmin
      .from('supplier_invoices')
      .update({
        status: 'approved',
        // Attribution is the signed-in approver, never a client-supplied id —
        // an approval record a caller can forge the author of is worthless.
        approved_by: await getCurrentUserId(),
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .neq('status', 'paid')
      .neq('status', 'cancelled')
    if (!override) {
      updateQuery = updateQuery.eq('match_status', 'matched')
    }
    const { data, error: updateError } = await updateQuery.select().maybeSingle()

    if (updateError) {
      return NextResponse.json({ error: 'Failed to approve' }, { status: 500 })
    }
    if (!data) {
      // Pre-check passed but the UPDATE matched 0 rows — a concurrent
      // request changed the invoice's status or match_status. Returning
      // 409 lets the caller refresh rather than silently no-op.
      return NextResponse.json(
        { error: 'Invoice state changed since the request was issued (likely approved/paid by a concurrent request, or match_status flipped)' },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error approving supplier invoice:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
