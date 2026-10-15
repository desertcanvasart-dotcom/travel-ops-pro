import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'

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
    // A cancelled invoice is closed: there is nothing left to dispute.
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
        { error: 'Invoice can no longer be disputed (it was paid, disputed or cancelled concurrently).' },
        { status: 409 }
      )
    }

    if (error) {
      return NextResponse.json({ error: 'Failed to dispute' }, { status: 500 })
    }

    // Who and when (AUDIT H32, migration 20261130). A separate write: before
    // the migration the columns do not exist, and that must not fail the
    // dispute itself.
    const disputedAt = new Date().toISOString()
    const disputedBy = await getCurrentUserId()
    const { error: whoError } = await supabaseAdmin
      .from('supplier_invoices')
      .update({ disputed_by: disputedBy, disputed_at: disputedAt })
      .eq('id', id)
      .eq('org_id', orgId)
    if (whoError) console.warn('[supplier-invoice dispute] disputed_by/at not stored:', whoError.message)

    return NextResponse.json({
      success: true,
      data: whoError ? data : { ...data, disputed_by: disputedBy, disputed_at: disputedAt },
    })
  } catch (error) {
    console.error('Error disputing supplier invoice:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
