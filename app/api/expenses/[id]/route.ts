import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { paymentDateForStatus, expenseFieldError, expenseDeleteBlock, approvalDecision } from '@/lib/expense-status'
import { withApproverNames } from '@/lib/expense-approver'
import { recordsInOrg } from '@/lib/org-refs'
import { settleBillsForPaidExpense } from '@/lib/finance/payables'

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

    // Finance is admin and manager; also enforced by the middleware prefix list.
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error) {
      console.error('Error fetching expense:', error)
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    return NextResponse.json((await withApproverNames(supabaseAdmin, [data]))[0])
  } catch (error) {
    console.error('Error in expense GET:', error)
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

    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const { id } = await params
    const body = await request.json()

    // M14: explicit whitelist + validation. Previously this spread the entire
    // body, so callers could set arbitrary status values, write garbage
    // amounts, overwrite immutable fields, or send unknown keys that 500'd
    // the request on hitting unknown columns.
    const ALLOWED_FIELDS = [
      'itinerary_id', 'supplier_id', 'category', 'description', 'amount',
      'currency', 'expense_date', 'supplier_name', 'supplier_type',
      'receipt_url', 'receipt_filename', 'status', 'payment_method',
      'payment_date', 'payment_reference', 'notes',
    ] as const

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (updateData.amount !== undefined) {
      const amt = Number(updateData.amount)
      if (!Number.isFinite(amt) || amt < 0) {
        return NextResponse.json(
          { error: 'amount must be a non-negative number' },
          { status: 400 }
        )
      }
      updateData.amount = amt
    }
    // The same status, category and currency lists as the POST.
    const fieldError = expenseFieldError(updateData)
    if (fieldError) {
      return NextResponse.json({ error: fieldError }, { status: 400 })
    }
    if (typeof updateData.currency === 'string') updateData.currency = updateData.currency.trim().toUpperCase()
    if (updateData.currency === '' || updateData.currency === null) delete updateData.currency

    // A supplier and a trip must be this company's (suppliers.org_id,
    // 20261205; the trip was stored unchecked).
    if (updateData.supplier_id === '') updateData.supplier_id = null
    if (updateData.itinerary_id === '') updateData.itinerary_id = null
    if (!(await recordsInOrg(supabaseAdmin, orgId, { supplier_id: updateData.supplier_id, itinerary_id: updateData.itinerary_id }))) {
      return NextResponse.json({ error: 'Supplier or trip not found' }, { status: 404 })
    }

    // The payment date follows the status: set when it becomes paid (keeping
    // the date it already has, else today), cleared when it is not paid. The
    // approver follows it too: moving out of Pending to Approved or Paid records
    // the signed-in user as the approver, and the person who created the expense
    // cannot be that user unless they are an owner or admin.
    if (updateData.status !== undefined) {
      const { data: row } = await supabaseAdmin
        .from('expenses')
        .select('status, payment_date, created_by')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle()
      // No row for this id in this company: a 404, not a 500.
      if (!row) {
        return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
      }
      const current = row as { status?: string | null; payment_date?: string | null; created_by?: string | null }
      const userId = await getCurrentUserId()
      const isAdmin = (await requireRole(['admin'])) === null
      const approval = approvalDecision(
        { from: current.status ?? 'pending', to: updateData.status, created_by: current.created_by },
        userId,
        isAdmin
      )
      if (!approval.ok) {
        return NextResponse.json({ error: approval.error }, { status: 403 })
      }
      if (approval.set) Object.assign(updateData, approval.set)
      updateData.payment_date = paymentDateForStatus(updateData.status, body.payment_date, current.payment_date ?? null)
    }

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .maybeSingle()

    if (error) {
      console.error('Error updating expense:', error)
      return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 })
    }
    // No row for this id in this company: a 404, not a 500.
    if (!data) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    // Marked paid here: a bill whose expenses are all paid is paid too, as on
    // Payables, so it is not left approved and payable a second time.
    if (data.status === 'paid') {
      await settleBillsForPaidExpense(supabaseAdmin, orgId, id)
    }

    return NextResponse.json((await withApproverNames(supabaseAdmin, [data]))[0])
  } catch (error) {
    console.error('Error in expense PUT:', error)
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

    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const { id } = await params

    // A paid expense, or one matched to a supplier invoice, is not deleted:
    // the delete used to go through and cascade the invoice match away.
    const { data: existing } = await supabaseAdmin
      .from('expenses')
      .select('id, status')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }
    // The junction carries no org_id; the expense above is this company's.
    const { count: matched } = await supabaseAdmin
      .from('supplier_invoice_expenses')
      .select('id', { count: 'exact', head: true })
      .eq('expense_id', id)
    const blocked = expenseDeleteBlock(existing, matched ?? 0)
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 409 })
    }

    const { error } = await supabaseAdmin
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) {
      console.error('Error deleting expense:', error)
      return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in expense DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}