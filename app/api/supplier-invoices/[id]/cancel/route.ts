import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { CANCELLABLE_BILL_STATUSES } from '@/lib/finance/supplier-bills'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST - Cancel a bill that should not be paid (entered twice, or wrong).
// Nothing in the app set 'cancelled' before, so a bad bill past "matched"
// could be neither deleted nor taken out of play. A cancelled bill keeps its
// record, frees its supplier invoice number, drops out of every owed figure,
// and lets the expenses it was matched to be matched elsewhere. Paid is final.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const { reason } = await request.json().catch(() => ({} as { reason?: string }))

    const { data: existing } = await supabaseAdmin
      .from('supplier_invoices')
      .select('status, amount, notes')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 })
    }
    if (!(CANCELLABLE_BILL_STATUSES as readonly string[]).includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot cancel an invoice with status '${existing.status}'` },
        { status: 409 }
      )
    }

    // The status is in the WHERE: a payment landing between the read and this
    // write wins and this matches no row.
    const { data, error } = await supabaseAdmin
      .from('supplier_invoices')
      .update({
        status: 'cancelled',
        matched_amount: 0,
        match_status: 'unmatched',
        discrepancy_amount: Number(existing.amount || 0),
        notes: reason ? [existing.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n') : existing.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .in('status', [...CANCELLABLE_BILL_STATUSES])
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Invoice can no longer be cancelled (its status changed meanwhile).' },
        { status: 409 }
      )
    }

    // Release the expenses it was matched to; the parent was just verified as
    // this org's (the junction carries no org_id).
    await supabaseAdmin.from('supplier_invoice_expenses').delete().eq('supplier_invoice_id', id)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error cancelling supplier invoice:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
