import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncExpense } from '@/lib/accounting'
import { insertWithUniqueRetry } from '@/lib/document-numbering'
import { nextExpenseNumber } from '@/lib/expense-number'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { getOrgDefaultCurrency } from '@/lib/org-default-currency'
import { recordsInOrg } from '@/lib/org-refs'
import { paymentDateForStatus, expenseFieldError, approvalDecision } from '@/lib/expense-status'
import { withApproverNames } from '@/lib/expense-approver'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Finance is admin and manager; the middleware prefix list says so too,
    // checked here as well so the route does not rest on one table alone.
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const category = searchParams.get('category')
    const supplierType = searchParams.get('supplierType')
    const itineraryId = searchParams.get('itineraryId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query = supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('org_id', orgId)
      .order('expense_date', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    if (category) {
      query = query.eq('category', category)
    }

    if (supplierType) {
      query = query.eq('supplier_type', supplierType)
    }

    if (itineraryId) {
      query = query.eq('itinerary_id', itineraryId)
    }

    if (startDate) {
      query = query.gte('expense_date', startDate)
    }

    if (endDate) {
      query = query.lte('expense_date', endDate)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching expenses:', error)
      return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 })
    }

    // "Approved by" shows a name, not an id.
    return NextResponse.json(await withApproverNames(supabaseAdmin, data || []))
  } catch (error) {
    console.error('Error in expenses GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const body = await request.json()

    // Validate required fields (use explicit null check for amount since 0 is falsy but valid)
    if (Number(body.amount) < 0 || (body.amount !== '' && body.amount != null && !Number.isFinite(Number(body.amount)))) {
      return NextResponse.json(
        { error: 'amount must be a non-negative number' },
        { status: 400 }
      )
    }

    if (!body.category || (body.amount == null || body.amount === '') || !body.expense_date) {
      return NextResponse.json(
        { error: 'Category, amount, and expense date are required' },
        { status: 400 }
      )
    }

    // Status, category and currency are checked against the same lists as the
    // PUT: a status of "foo" was stored, shown as Pending and counted as a
    // live cost by the P&L.
    const fieldError = expenseFieldError(body)
    if (fieldError) {
      return NextResponse.json({ error: fieldError }, { status: 400 })
    }

    // A picked supplier and a linked trip must exist in this company (the
    // pickers send ids; a stale, forged or other company's one would otherwise
    // land as a dangling or foreign reference — suppliers.org_id, 20261205).
    if (!(await recordsInOrg(supabaseAdmin, orgId, { supplier_id: body.supplier_id, itinerary_id: body.itinerary_id }))) {
      return NextResponse.json({ error: 'Supplier or trip not found' }, { status: 404 })
    }

    // Who entered it, and, when it is entered already approved or paid, who
    // approved it: the signed-in user, never a value from the request. A
    // manager cannot enter an expense as approved (they would be approving their
    // own); an owner or admin may.
    const userId = await getCurrentUserId()
    const isAdmin = (await requireRole(['admin'])) === null
    const approval = approvalDecision({ from: null, to: body.status || 'pending', created_by: userId }, userId, isAdmin)
    if (!approval.ok) {
      return NextResponse.json({ error: approval.error }, { status: 403 })
    }

    // The company's own currency when none is sent — not a hardcoded EUR.
    const currency = typeof body.currency === 'string' && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : await getOrgDefaultCurrency(supabaseAdmin, orgId)

    // M15: year-scoped, sequence-first generator with a year-scoped MAX
    // fallback (instead of the racy COUNT(*) + 1). Paired with the UNIQUE
    // constraint added by 20260624_unique_document_numbers.sql, the insert
    // below is wrapped in a retry loop so concurrent writers never silently
    // produce duplicate expense_number values.
    const baseExpense = {
      org_id: orgId,
      itinerary_id: body.itinerary_id || null,
      supplier_id: body.supplier_id || null,
      category: body.category,
      description: body.description || null,
      amount: body.amount,
      currency,
      expense_date: body.expense_date,
      supplier_name: body.supplier_name || null,
      supplier_type: body.supplier_type || null,
      receipt_url: body.receipt_url || null,
      receipt_filename: body.receipt_filename || null,
      status: body.status || 'pending',
      payment_method: body.payment_method || null,
      payment_date: paymentDateForStatus(body.status || 'pending', body.payment_date),
      payment_reference: body.payment_reference || null,
      notes: body.notes || null,
      created_by: userId,
      ...(approval.set && approval.set.approved_by ? approval.set : {}),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await insertWithUniqueRetry({
      generateRow: async () => ({
        ...baseExpense,
        // Per company (next_expense_number, migration 20261227); the global
        // sequence only on a database that has not had it yet.
        expense_number: await nextExpenseNumber(supabaseAdmin, orgId),
      }),
      insert: async (row) => await supabaseAdmin.from('expenses').insert([row]).select().single(),
    })

    if (error) {
      console.error('Error creating expense:', error)
      return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
    }

    // Fire-and-forget accounting sync
    if (data?.id) {
      syncExpense(data.id).catch(err => console.error('Accounting sync failed:', err))
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Error in expenses POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}