import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncExpense } from '@/lib/accounting'
import { nextDocumentNumber, insertWithUniqueRetry } from '@/lib/document-numbering'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

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

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error in expenses GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()

    // Validate required fields (use explicit null check for amount since 0 is falsy but valid)
    if (!body.category || (body.amount == null || body.amount === '') || !body.expense_date) {
      return NextResponse.json(
        { error: 'Category, amount, and expense date are required' },
        { status: 400 }
      )
    }

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
      currency: body.currency || 'EUR',
      expense_date: body.expense_date,
      supplier_name: body.supplier_name || null,
      supplier_type: body.supplier_type || null,
      receipt_url: body.receipt_url || null,
      receipt_filename: body.receipt_filename || null,
      status: body.status || 'pending',
      payment_method: body.payment_method || null,
      payment_date: body.payment_date || null,
      payment_reference: body.payment_reference || null,
      notes: body.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await insertWithUniqueRetry({
      generateRow: async () => ({
        ...baseExpense,
        expense_number: await nextDocumentNumber({
          supabase: supabaseAdmin,
          prefix: 'EXP',
          sequenceName: 'expense_number_seq',
          table: 'expenses',
          column: 'expense_number',
        }),
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