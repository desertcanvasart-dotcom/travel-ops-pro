import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncInvoice } from '@/lib/accounting'
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
    const clientId = searchParams.get('clientId')
    const itineraryId = searchParams.get('itineraryId')
    const invoiceType = searchParams.get('type')
    // ?include=payments embeds each invoice's invoice_payments rows so
    // consumers (payments/receipts pages) don't need a per-invoice fetch.
    const includePayments = searchParams.get('include') === 'payments'

    // Clamp the caller-supplied limit to a sane range so a huge `?limit=` can't
    // be used to extract the whole table / exhaust memory. Default 100, max 1000.
    const requestedLimit = parseInt(searchParams.get('limit') || '100')
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 1000) : 100
    const requestedPage = parseInt(searchParams.get('page') || '1')
    const page = Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1
    const from = (page - 1) * limit

    let query = supabaseAdmin
      .from('invoices')
      .select(`
        *,
        itineraries (
          client_phone
        )${includePayments ? ',\n        invoice_payments (*)' : ''}
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (clientId) {
      query = query.eq('client_id', clientId)
    }

    if (itineraryId) {
      query = query.eq('itinerary_id', itineraryId)
    }

    if (invoiceType) {
      query = query.eq('invoice_type', invoiceType)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching invoices:', error)
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
    }

    // Flatten the response to include client_phone at the top level
    const formattedData = (data || []).map(invoice => ({
      ...invoice,
      client_phone: invoice.itineraries?.client_phone || null,
      itineraries: undefined // Remove nested object
    }))

    return NextResponse.json(formattedData)
  } catch (error) {
    console.error('Error in invoices GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()

    // Validate required fields
    if (!body.client_name) {
      return NextResponse.json(
        { error: 'Client name is required' },
        { status: 400 }
      )
    }

    // M19: invoice_number generation now goes through nextDocumentNumber
    // (sequence-first, year-scoped MAX fallback, accepts 0 as a legitimate
    // value), and the insert below is wrapped in a retry loop against the
    // 23505 unique violation produced by the UNIQUE constraint in
    // 20260624_unique_document_numbers.sql. The deposit/final type suffix
    // is appended at row-build time so the same base number stays in sync.
    const invoiceType = body.invoice_type || 'standard'
    const buildInvoiceNumber = async () => {
      const base = await nextDocumentNumber({
        supabase: supabaseAdmin,
        prefix: 'INV',
        sequenceName: 'invoice_number_seq',
        table: 'invoices',
        column: 'invoice_number',
      })
      if (invoiceType === 'deposit') return `${base}-DEP`
      if (invoiceType === 'final') return `${base}-FIN`
      return base
    }

    // Calculate amounts based on invoice type
    let totalAmount = body.total_amount || 0
    let lineItems = body.line_items || []
    const depositPercent = body.deposit_percent || 10
    const fullTripCost = body.full_trip_cost || totalAmount // Store original trip cost

    if (invoiceType === 'deposit') {
      // Deposit invoice: calculate deposit amount
      totalAmount = (fullTripCost * depositPercent) / 100
      lineItems = [{
        description: `Booking Deposit (${depositPercent}%) - ${body.line_items?.[0]?.description || 'Tour Package'}`,
        quantity: 1,
        unit_price: totalAmount,
        amount: totalAmount
      }]
    } else if (invoiceType === 'final') {
      // Final invoice: remaining balance after deposit.
      //
      // M17: when a parent_invoice_id is supplied, the actual deposit
      // amount (and whatever was paid against it) is the authoritative
      // figure. Recomputing the deposit as a percentage of fullTripCost
      // silently ignores manual overrides, rounding, or a different
      // deposit_percent on the parent, so the final could under- or
      // over-charge by the rounding/override delta. Prefer the linked
      // deposit invoice's actual total_amount.
      let depositAmount = (fullTripCost * depositPercent) / 100
      let depositSource: 'percent' | 'parent' = 'percent'
      let depositReconciles = true
      let reconcileNote = ''
      if (body.parent_invoice_id) {
        const { data: parent } = await supabaseAdmin
          .from('invoices')
          .select('total_amount, currency')
          .eq('id', body.parent_invoice_id)
          .eq('org_id', orgId)
          .single()
        if (parent?.total_amount != null) {
          depositAmount = Number(parent.total_amount)
          depositSource = 'parent'
          // Surface a mismatch between the recomputed percent and the
          // actual parent amount; don't fail the request — the caller may
          // intentionally have a manual deposit — but record the delta.
          const expected = (fullTripCost * depositPercent) / 100
          if (Math.abs(expected - depositAmount) > 0.01) {
            depositReconciles = false
            reconcileNote = ` (parent deposit ${parent.currency || ''}${depositAmount.toFixed(2)} differs from ${depositPercent}% of trip ${expected.toFixed(2)})`
          }
        }
      }
      totalAmount = Math.max(0, fullTripCost - depositAmount)
      const headerPrefix = depositSource === 'parent' ? 'Final Balance (parent-deposit-based)' : 'Final Balance'
      lineItems = [{
        description: `${headerPrefix} - ${body.line_items?.[0]?.description || 'Tour Package'} (Total: ${body.currency || 'EUR'} ${fullTripCost.toFixed(2)} minus deposit ${body.currency || 'EUR'} ${depositAmount.toFixed(2)})${depositReconciles ? '' : reconcileNote}`,
        quantity: 1,
        unit_price: totalAmount,
        amount: totalAmount
      }]
    }

    const baseInvoice = {
      org_id: orgId,
      invoice_type: invoiceType,
      deposit_percent: depositPercent,
      parent_invoice_id: body.parent_invoice_id || null,
      client_id: body.client_id,
      itinerary_id: body.itinerary_id || null,
      client_name: body.client_name,
      client_email: body.client_email || null,
      line_items: lineItems,
      subtotal: totalAmount,
      tax_rate: body.tax_rate || 0,
      tax_amount: body.tax_amount || 0,
      discount_amount: body.discount_amount || 0,
      total_amount: totalAmount,
      currency: body.currency || 'EUR',
      amount_paid: 0,
      balance_due: totalAmount,
      status: 'draft',
      issue_date: body.issue_date || new Date().toISOString().split('T')[0],
      due_date: body.due_date || null,
      notes: body.notes || null,
      payment_terms: body.payment_terms || getDefaultPaymentTerms(invoiceType),
      payment_instructions: body.payment_instructions || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await insertWithUniqueRetry({
      generateRow: async () => ({ ...baseInvoice, invoice_number: await buildInvoiceNumber() }),
      insert: async (row) => await supabaseAdmin.from('invoices').insert([row]).select().single(),
    })

    if (error) {
      console.error('Error creating invoice:', error)
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
    }

    // Fire-and-forget accounting sync
    if (data?.id) {
      syncInvoice(data.id).catch(err => console.error('Accounting sync failed:', err))
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Error in invoices POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function getDefaultPaymentTerms(invoiceType: string): string {
  switch (invoiceType) {
    case 'deposit':
      return 'Deposit required to confirm booking. Non-refundable once services are confirmed.'
    case 'final':
      return 'Balance payable in cash upon arrival or before first day of service.'
    default:
      return 'Payment due within 14 days'
  }
}