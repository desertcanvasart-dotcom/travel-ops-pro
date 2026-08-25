import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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
    const matchStatus = searchParams.get('matchStatus')
    const supplierName = searchParams.get('supplierName')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query = supabaseAdmin
      .from('supplier_invoices')
      .select('*')
      .eq('org_id', orgId)
      .order('invoice_date', { ascending: false })

    if (status) query = query.eq('status', status)
    if (matchStatus) query = query.eq('match_status', matchStatus)
    if (supplierName) query = query.ilike('supplier_name', `%${supplierName}%`)
    if (startDate) query = query.gte('invoice_date', startDate)
    if (endDate) query = query.lte('invoice_date', endDate)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching supplier invoices:', error)
      return NextResponse.json({ error: 'Failed to fetch supplier invoices' }, { status: 500 })
    }

    // Compute summary stats
    const all = data || []
    const summary = {
      total: all.length,
      total_amount: all.reduce((sum, si) => sum + Number(si.amount || 0), 0),
      received: all.filter(si => si.status === 'received').length,
      unmatched: all.filter(si => si.match_status === 'unmatched').length,
      matched_pending: all.filter(si => si.status === 'matched').length,
      approved: all.filter(si => si.status === 'approved').length,
      paid: all.filter(si => si.status === 'paid').length,
      disputed: all.filter(si => si.status === 'disputed').length,
    }

    return NextResponse.json({ data: all, summary })
  } catch (error) {
    console.error('Error in supplier-invoices GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()

    // A negative amount flips the sign of what is owed and corrupts the payables
    // total (accounts-payable sums amounts). Reject it — a credit note is a
    // different document, not a negative invoice.
    if (Number(body.amount) < 0 || !Number.isFinite(Number(body.amount))) {
      return NextResponse.json(
        { error: 'amount must be a non-negative number' },
        { status: 400 }
      )
    }

    if (!body.supplier_invoice_number || !body.supplier_name || !body.invoice_date || body.amount == null) {
      return NextResponse.json(
        { error: 'supplier_invoice_number, supplier_name, invoice_date, and amount are required' },
        { status: 400 }
      )
    }

    // M31: internal_reference generation now uses nextDocumentNumber
    // (year-scoped, accepts 0, falls back to MAX rather than the previous
    // guaranteed-collision '-001'). The insert is wrapped in a retry loop
    // against the UNIQUE constraint introduced in
    // 20260624_unique_document_numbers.sql, so concurrent creates can't
    // silently emit duplicate references.
    const baseSupplierInvoice = {
      org_id: orgId,
      supplier_invoice_number: body.supplier_invoice_number,
      supplier_name: body.supplier_name,
      supplier_id: body.supplier_id || null,
      invoice_date: body.invoice_date,
      due_date: body.due_date || null,
      amount: body.amount,
      currency: body.currency || 'EUR',
      tax_amount: body.tax_amount || 0,
      description: body.description || null,
      line_items: body.line_items || null,
      notes: body.notes || null,
      itinerary_id: body.itinerary_id || null,
      client_invoice_id: body.client_invoice_id || null,
      created_by: body.created_by || null,
    }

    const { data, error } = await insertWithUniqueRetry({
      generateRow: async () => ({
        ...baseSupplierInvoice,
        internal_reference: await nextDocumentNumber({
          supabase: supabaseAdmin,
          prefix: 'SI',
          sequenceName: 'supplier_invoice_number_seq',
          table: 'supplier_invoices',
          column: 'internal_reference',
        }),
      }),
      insert: async (row) => await supabaseAdmin.from('supplier_invoices').insert(row).select().single(),
    })

    if (error) {
      console.error('Error creating supplier invoice:', error)
      return NextResponse.json({ error: 'Failed to create supplier invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('Error in supplier-invoices POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
