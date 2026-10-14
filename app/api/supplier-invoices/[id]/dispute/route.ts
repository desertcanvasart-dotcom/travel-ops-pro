import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { statusAfterDispute } from '@/lib/finance/supplier-bills'

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
    const { reason } = await request.json()

    // Guard: the invoice must exist and be in a disputable state. Without this a
    // PUT could flip an already-paid or already-disputed invoice to 'disputed'.
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('supplier_invoices')
      .select('status')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 })
    }
    if (existing.status === 'paid' || existing.status === 'disputed' || existing.status === 'cancelled') {
      return NextResponse.json(
        { error: `Cannot dispute an invoice with status '${existing.status}'` },
        { status: 409 }
      )
    }

    // ATOMIC. The pre-check above read the status, but a payment could land
    // between that read and this write; without re-checking status in the WHERE,
    // the dispute would overwrite a 'paid' row and lose the payment. Excluding
    // paid/disputed here means a concurrent payment wins and this matches 0 rows.
    const { data, error } = await supabaseAdmin
      .from('supplier_invoices')
      .update({
        status: 'disputed',
        discrepancy_notes: reason || 'Disputed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .neq('status', 'paid')
      .neq('status', 'disputed')
      .neq('status', 'cancelled')
      .select()
      .maybeSingle()

    if (!error && !data) {
      return NextResponse.json(
        { error: 'Invoice can no longer be disputed (it was paid or disputed concurrently).' },
        { status: 409 }
      )
    }

    if (error) {
      return NextResponse.json({ error: 'Failed to dispute' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error disputing supplier invoice:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Resolve a dispute. Disputed was a dead end: approve, match, pay and
// edit all refuse a disputed bill and nothing led out of it. The bill goes back
// to what its match says ('matched' when fully matched, else 'received') and
// must be approved again; an earlier approval does not survive a dispute.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('supplier_invoices')
      .select('status, match_status')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()
    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 })
    }
    if (existing.status !== 'disputed') {
      return NextResponse.json(
        { error: `Only a disputed invoice can be resolved (status is '${existing.status}')` },
        { status: 409 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('supplier_invoices')
      .update({
        status: statusAfterDispute(existing.match_status),
        discrepancy_notes: null,
        approved_by: null,
        approved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .eq('status', 'disputed')
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Failed to resolve dispute' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'The dispute was already resolved.' }, { status: 409 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error resolving supplier invoice dispute:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
