import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { recordsInOrg } from '@/lib/org-refs'

const EDITABLE = [
  'supplier_invoice_number', 'supplier_name', 'supplier_id', 'invoice_date', 'due_date',
  'amount', 'currency', 'tax_amount', 'description', 'line_items', 'notes',
  'itinerary_id', 'client_invoice_id',
]

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

    // Fetch supplier invoice
    const { data: invoice, error } = await supabaseAdmin
      .from('supplier_invoices')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const body = await request.json()

    // Only the bill's own details are editable here. Reconciliation and state
    // (status, match, approval, payment, document) belong to the approve / pay
    // / match / dispute / upload routes; org_id would re-home the row.
    const updateData: Record<string, unknown> = {}
    for (const key of EDITABLE) if (key in body) updateData[key] = body[key]

    if (!(await recordsInOrg(supabaseAdmin, orgId, { itinerary_id: updateData.itinerary_id, invoice_id: updateData.client_invoice_id }))) {
      return NextResponse.json({ error: 'Trip or client invoice not found' }, { status: 404 })
    }

    const { data: current } = await supabaseAdmin
      .from('supplier_invoices')
      .select('status, amount, currency, matched_amount')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!current) {
      return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 })
    }

    // The amount and currency are what was matched and approved: changing them
    // on an approved bill had it paid at a figure nobody matched or approved.
    const amountChanges = 'amount' in updateData && Number(updateData.amount) !== Number(current.amount)
    const currencyChanges = 'currency' in updateData &&
      String(updateData.currency || 'EUR').toUpperCase() !== String(current.currency || 'EUR').toUpperCase()
    if ((amountChanges || currencyChanges) && !['received', 'matched'].includes(current.status)) {
      return NextResponse.json(
        { error: `Cannot change the amount of an invoice with status '${current.status}'` },
        { status: 409 }
      )
    }
    const matched = Number(current.matched_amount || 0)
    if (currencyChanges && matched > 0) {
      return NextResponse.json(
        { error: 'Unmatch its expenses before changing the invoice currency' },
        { status: 409 }
      )
    }
    if (amountChanges) {
      // Re-derive the match against the new amount, as the match route does.
      const amount = Number(updateData.amount)
      const discrepancy = amount - matched
      const matchStatus = matched === 0 ? 'unmatched'
        : Math.abs(discrepancy) <= 0.01 ? 'matched'
        : matched < amount ? 'partial' : 'discrepancy'
      updateData.discrepancy_amount = discrepancy
      updateData.match_status = matchStatus
      updateData.status = matchStatus === 'matched' ? 'matched' : 'received'
    }

    let query = supabaseAdmin
      .from('supplier_invoices')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', orgId)
    // A money change applies only if nothing approved it meanwhile.
    if (amountChanges || currencyChanges) query = query.eq('status', current.status)
    const { data, error } = await query.select().single()

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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    // A paid, approved or disputed invoice is a financial record with downstream
    // state (payments, approvals, an open dispute); deleting it erases the trail.
    // Only a draft/pending/cancelled invoice may be deleted, enforced in the
    // WHERE so a concurrent approval/payment cannot slip through the check.
    const { data, error } = await supabaseAdmin
      .from('supplier_invoices')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)
      .in('status', ['draft', 'pending', 'cancelled'])
      .select('id')

    if (error) {
      console.error('Error deleting supplier invoice:', error)
      return NextResponse.json({ error: 'Failed to delete supplier invoice' }, { status: 500 })
    }
    if (!data?.length) {
      return NextResponse.json(
        { error: 'Only a draft, pending or cancelled invoice can be deleted.' },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in supplier-invoices DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
