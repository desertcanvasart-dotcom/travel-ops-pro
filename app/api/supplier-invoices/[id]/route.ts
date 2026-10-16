import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { recordsInOrg } from '@/lib/org-refs'
import { DELETABLE_BILL_STATUSES, duplicateBillMessage, findDuplicateBill, isBillNumberViolation, normalizeBillFields } from '@/lib/finance/supplier-bills'

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

    // The name of whoever disputed it, for the page (AUDIT H32).
    let disputed_by_name: string | null = null
    if (invoice.disputed_by) {
      const { data: who } = await supabaseAdmin
        .from('user_profiles')
        .select('full_name, email')
        .eq('id', invoice.disputed_by)
        .maybeSingle()
      disputed_by_name = who?.full_name || who?.email || null
    }

    return NextResponse.json({
      ...invoice,
      disputed_by_name,
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
    // The same checks as creating a bill: a negative or non-numeric amount, an
    // emptied date.
    const invalid = normalizeBillFields(updateData, true)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
    for (const key of ['supplier_invoice_number', 'supplier_name']) {
      if (key in updateData) {
        updateData[key] = String(updateData[key] ?? '').trim()
        if (!updateData[key]) return NextResponse.json({ error: `${key} cannot be empty` }, { status: 400 })
      }
    }
    // An emptied picker sends '' — a uuid column needs null.
    for (const key of ['supplier_id', 'itinerary_id', 'client_invoice_id']) {
      if (updateData[key] === '') updateData[key] = null
    }

    if (!(await recordsInOrg(supabaseAdmin, orgId, { itinerary_id: updateData.itinerary_id, invoice_id: updateData.client_invoice_id, supplier_id: updateData.supplier_id }))) {
      return NextResponse.json({ error: 'Trip, client invoice or supplier not found' }, { status: 404 })
    }

    const { data: current } = await supabaseAdmin
      .from('supplier_invoices')
      .select('status, amount, currency, matched_amount, supplier_invoice_number, supplier_name, supplier_id, tax_amount')
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
    // Nor who is paid, or the tax in the figure (AUDIT H34): an approved bill
    // re-pointed at another supplier was paid to someone nobody approved.
    const payeeOrTaxChanges =
      ('supplier_id' in updateData && (updateData.supplier_id ?? null) !== (current.supplier_id ?? null)) ||
      ('supplier_name' in updateData && String(updateData.supplier_name ?? '') !== String(current.supplier_name ?? '')) ||
      ('tax_amount' in updateData && Number(updateData.tax_amount || 0) !== Number(current.tax_amount || 0))
    if (payeeOrTaxChanges && !['received', 'matched'].includes(current.status)) {
      return NextResponse.json(
        { error: `Cannot change the supplier or tax of an invoice with status '${current.status}'` },
        { status: 409 }
      )
    }
    // Renaming the number or supplier must not land on another bill's.
    if ('supplier_invoice_number' in updateData || 'supplier_name' in updateData || 'supplier_id' in updateData) {
      const next = {
        supplier_invoice_number: updateData.supplier_invoice_number ?? current.supplier_invoice_number,
        supplier_name: updateData.supplier_name ?? current.supplier_name,
        supplier_id: 'supplier_id' in updateData ? updateData.supplier_id : current.supplier_id,
      }
      const duplicate = current.status === 'cancelled' ? null : await findDuplicateBill(supabaseAdmin, orgId, next, id)
      if (duplicate) {
        return NextResponse.json({ error: duplicateBillMessage(next, duplicate), duplicate_id: duplicate.id }, { status: 409 })
      }
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
    if (amountChanges || currencyChanges || payeeOrTaxChanges) query = query.eq('status', current.status)
    const { data, error } = await query.select().single()

    if (error?.code === 'PGRST116' && (amountChanges || currencyChanges || payeeOrTaxChanges)) {
      // The status moved (approved, paid) between the read and this write.
      return NextResponse.json({ error: 'The invoice changed meanwhile — reload and try again' }, { status: 409 })
    }
    if (isBillNumberViolation(error)) {
      return NextResponse.json({ error: 'That invoice number is already recorded for this supplier' }, { status: 409 })
    }
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
    // state (payments, approvals, an open dispute); deleting it erases the trail
    // (cancel it instead: POST /cancel). Only a bill nobody has approved or paid,
    // or one already cancelled, may be deleted — 'draft' and 'pending' are not
    // statuses a bill can have (supplier_invoices_status_check), so listing only
    // them made every bill undeletable. Enforced in the WHERE so a concurrent
    // approval/payment cannot slip through the check. Its match rows go with it.
    const { data, error } = await supabaseAdmin
      .from('supplier_invoices')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)
      .in('status', [...DELETABLE_BILL_STATUSES, 'cancelled'])
      .select('id')

    if (error) {
      console.error('Error deleting supplier invoice:', error)
      return NextResponse.json({ error: 'Failed to delete supplier invoice' }, { status: 500 })
    }
    if (!data?.length) {
      return NextResponse.json(
        { error: 'Only a received, matched or cancelled invoice can be deleted. Cancel an approved or disputed one first; a paid one stays on record.' },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in supplier-invoices DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
