import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncInvoice } from '@/lib/accounting'
import { nextDocumentNumber, insertWithUniqueRetry } from '@/lib/document-numbering'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { currencyDecimals, roundToCurrency } from '@/lib/currency-totals'

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

    // Two static select strings (not one interpolated template) so supabase-js's
    // type-level parser can parse the query; interpolation breaks it.
    let query = (includePayments
      ? supabaseAdmin
          .from('invoices')
          .select('*, itineraries ( client_phone ), invoice_payments (*)')
      : supabaseAdmin
          .from('invoices')
          .select('*, itineraries ( client_phone )'))
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
    let fullTripCost = body.full_trip_cost || totalAmount // Store original trip cost
    // Every derived amount below is rounded to THIS currency's minor unit.
    // Without it a 20% deposit on ¥1,854,367 bills ¥370,873.4, and a yen with a
    // decimal place is not an amount of money that exists.
    const currency = body.currency || 'EUR'
    const moneyDp = currencyDecimals(currency)

    // ---------- confirmed travel insurance ----------
    // Added HERE rather than by each caller, so every invoice for a trip picks
    // the premiums up the same way. Only CONFIRMED ones: a traveller's choice
    // in the portal is a request until the office says otherwise.
    //
    // The premium is a yen figure published by the insurer. It is not
    // converted — a rate applied to somebody else's tariff invents a precision
    // they never quoted — so an invoice in another currency is refused rather
    // than fudged. A.T.S bill in JPY; anything else here is a mistake worth
    // stopping.
    let insuranceLines: Array<{ description: string; quantity: number; unit_price: number; amount: number }> = []
    if (body.itinerary_id) {
      const { data: insured } = await supabaseAdmin
        .from('booking_passengers')
        .select('first_name, last_name, family_name_kanji, given_name_kanji, insurance_plan_code, insurance_premium_jpy, bookings!inner(itinerary_id, org_id)')
        .eq('bookings.itinerary_id', body.itinerary_id)
        .eq('bookings.org_id', orgId)
        .not('insurance_confirmed_at', 'is', null)
        .gt('insurance_premium_jpy', 0)

      insuranceLines = (insured ?? []).map(p => {
        const name =
          [p.family_name_kanji, p.given_name_kanji].filter(Boolean).join(' ') ||
          [p.last_name, p.first_name].filter(Boolean).join(' ')
        const amount = Number(p.insurance_premium_jpy)
        return {
          description: `海外旅行傷害保障 トラベルセーフティプラン ${p.insurance_plan_code}${name ? `（${name}）` : ''}`,
          quantity: 1,
          unit_price: amount,
          amount,
        }
      })

      if (insuranceLines.length && currency !== 'JPY') {
        return NextResponse.json(
          {
            error:
              'This trip has confirmed travel insurance, which is priced in JPY. ' +
              `Invoice this booking in JPY (it is currently ${currency}) rather than converting the premium.`,
          },
          { status: 409 }
        )
      }
    }

    const insuranceTotal = insuranceLines.reduce((sum, l) => sum + l.amount, 0)
    if (insuranceTotal) {
      // The premium is part of what the trip costs, so full_trip_cost tells the
      // truth about the total. What it is NOT is part of the deposit base: a
      // deposit is a percentage on account against the tour, while the premium
      // is a fixed pass-through the insurer charges in full. Taking 20% of a
      // ¥12,200 premium bills ¥2,440 for cover that costs ¥12,200.
      //
      // So it is settled with the BALANCE, and appears on exactly one document:
      // the final invoice, or a standard one. Adding it to both a deposit and a
      // final would bill it twice.
      fullTripCost += insuranceTotal
    }

    if (invoiceType === 'deposit') {
      totalAmount = roundToCurrency(((fullTripCost - insuranceTotal) * depositPercent) / 100, currency)

      // The itemisation is KEPT. This used to replace every line with a single
      // "Booking Deposit (20%)", which discarded the fuel surcharge, the airport
      // taxes, the tips and the visa fee — the whole price stack the customer is
      // agreeing to. For this operator the deposit invoice doubles as the
      // booking confirmation, so throwing that away left them confirming a trip
      // without saying what was in it.
      //
      // What is due NOW lives in total_amount; what the trip costs lives in
      // full_trip_cost. The lines say what is being bought, which is a
      // different question from what is being paid today.
      if (!lineItems.length) {
        lineItems = [{
          description: body.description || 'Tour Package',
          quantity: 1,
          unit_price: fullTripCost,
          amount: fullTripCost,
        }]
      }
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
      // Same base as the deposit invoice used — the tour without the premium —
      // or the two documents disagree about what was already paid.
      let depositAmount = roundToCurrency(((fullTripCost - insuranceTotal) * depositPercent) / 100, currency)
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
          const expected = roundToCurrency(((fullTripCost - insuranceTotal) * depositPercent) / 100, currency)
          if (Math.abs(expected - depositAmount) > 0.01) {
            depositReconciles = false
            reconcileNote = ` (parent deposit ${parent.currency || ''}${depositAmount.toFixed(moneyDp)} differs from ${depositPercent}% of trip ${expected.toFixed(moneyDp)})`
          }
        }
      }
      totalAmount = roundToCurrency(Math.max(0, fullTripCost - depositAmount), currency)
      const headerPrefix = depositSource === 'parent' ? 'Final Balance (parent-deposit-based)' : 'Final Balance'
      // The balance LINE covers the tour only, because the premium is listed
      // separately below. Rolling it into this line would make the document
      // total correct while saying nothing about what the extra money is for.
      const tourBalance = roundToCurrency(Math.max(0, totalAmount - insuranceTotal), currency)
      lineItems = [{
        description: `${headerPrefix} - ${body.line_items?.[0]?.description || 'Tour Package'} (Total: ${currency} ${fullTripCost.toFixed(moneyDp)} minus deposit ${currency} ${depositAmount.toFixed(moneyDp)})${depositReconciles ? '' : reconcileNote}`,
        quantity: 1,
        unit_price: tourBalance,
        amount: tourBalance
      }]
    }

    // A standard invoice is whatever the caller said, PLUS anything added here.
    // Without this the document lists a premium line it does not bill.
    if (invoiceType === 'standard' && insuranceTotal) {
      totalAmount = roundToCurrency(totalAmount + insuranceTotal, currency)
    }

    // Appended LAST: the final branch rebuilds lineItems from scratch, so
    // anything added before it is silently dropped. Not on the deposit — the
    // premium is settled with the balance, and listing it on both documents
    // would say it is owed twice.
    if (insuranceTotal && invoiceType !== 'deposit') {
      lineItems = [...lineItems, ...insuranceLines]
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
      // What the whole trip costs. Stored rather than reconstructed: dividing a
      // rounded deposit back out cannot recover what rounding removed, which is
      // how the PDF came to quote a trip cost 2 yen below the real one.
      full_trip_cost: invoiceType === 'standard' ? null : fullTripCost,
      subtotal: totalAmount,
      tax_rate: body.tax_rate || 0,
      tax_amount: body.tax_amount || 0,
      discount_amount: body.discount_amount || 0,
      total_amount: totalAmount,
      currency,
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