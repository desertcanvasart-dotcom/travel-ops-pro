import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { nextDocumentNumber, insertWithUniqueRetry } from '@/lib/document-numbering'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { recordsInOrg } from '@/lib/org-refs'
import { getOrgDefaultCurrency } from '@/lib/org-default-currency'
import { fetchAllRows } from '@/lib/finance/receivables'
import { duplicateBillMessage, findDuplicateBill, isBillNumberViolation, normalizeBillFields, summarizeBills } from '@/lib/finance/supplier-bills'

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

    // The cards count EVERY bill of the company, not the filtered rows: with
    // the Status filter on "Paid" they used to read Total = the paid count and
    // Unmatched = 0. Read in pages so they are not capped at 1,000 either.
    const everything = await fetchAllRows<any>((from, to) =>
      supabaseAdmin
        .from('supplier_invoices')
        .select('status, match_status, amount, currency')
        .eq('org_id', orgId)
        .order('id', { ascending: true })
        .range(from, to)
    )
    if (everything.error) console.error('Error summarising supplier invoices:', everything.error)
    const summary = summarizeBills(everything.rows)

    return NextResponse.json({ data: data || [], summary })
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

    if (!body.supplier_invoice_number || !body.supplier_name || !body.invoice_date || body.amount == null) {
      return NextResponse.json(
        { error: 'supplier_invoice_number, supplier_name, invoice_date, and amount are required' },
        { status: 400 }
      )
    }

    // A negative amount flips the sign of what is owed and corrupts the payables
    // total (accounts-payable sums amounts). Reject it — a credit note is a
    // different document, not a negative invoice. PUT shares this check.
    const invalid = normalizeBillFields(body, false)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
    body.supplier_invoice_number = String(body.supplier_invoice_number).trim()
    body.supplier_name = String(body.supplier_name).trim()

    // The trip, the client invoice and the supplier a bill is tied to must be
    // this org's.
    if (!(await recordsInOrg(supabaseAdmin, orgId, { itinerary_id: body.itinerary_id, invoice_id: body.client_invoice_id, supplier_id: body.supplier_id }))) {
      return NextResponse.json({ error: 'Trip, client invoice or supplier not found' }, { status: 404 })
    }

    // The same supplier's invoice number twice is the same bill entered twice
    // (retyped, or the same PDF uploaded twice), and each copy could be matched,
    // approved and paid. A partial unique index backs this up for two saves at once.
    const duplicate = await findDuplicateBill(supabaseAdmin, orgId, body)
    if (duplicate) {
      return NextResponse.json({ error: duplicateBillMessage(body, duplicate), duplicate_id: duplicate.id }, { status: 409 })
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
      // No currency sent: the company's own, not a fixed euro.
      currency: body.currency || await getOrgDefaultCurrency(supabaseAdmin, orgId),
      tax_amount: body.tax_amount || 0,
      description: body.description || null,
      line_items: body.line_items || null,
      notes: body.notes || null,
      itinerary_id: body.itinerary_id || null,
      client_invoice_id: body.client_invoice_id || null,
      // The signed-in user, never a client-supplied id.
      created_by: await getCurrentUserId(),
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

    if (isBillNumberViolation(error)) {
      return NextResponse.json({ error: duplicateBillMessage(body, { internal_reference: null }) }, { status: 409 })
    }
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
