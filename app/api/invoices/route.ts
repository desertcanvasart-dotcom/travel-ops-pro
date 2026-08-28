import { NextRequest, NextResponse } from 'next/server'
import {
  includeAdditions,
  partitionAdditions,
  toLineItems,
  type Addition,
} from '@/lib/invoice-additions'
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

    // ---------- what the SERVER adds to this invoice ----------
    // Two kinds of money reach a trip's invoice without the caller sending
    // them: a traveller's confirmed insurance premium, and the extras and
    // upgrades sold after the trip was priced. They come from different tables
    // and answer to different currency rules, but what they do to the document
    // is identical — so the shared part is lib/invoice-additions.ts and a third
    // kind will not add a third copy.
    //
    // Both are added HERE rather than by each caller, so every invoice for a
    // trip picks them up the same way, and only when CONFIRMED: a traveller's
    // choice in the portal, or a customer's interest in an upgrade, is a
    // request until the office says otherwise.
    const additions: Addition[] = []
    let billedExtraIds: string[] = []
    let excludedExtras: Addition[] = []
    if (body.itinerary_id) {
      const { data: insured } = await supabaseAdmin
        .from('booking_passengers')
        .select('first_name, last_name, family_name_kanji, given_name_kanji, insurance_plan_code, insurance_premium_jpy, bookings!inner(itinerary_id, org_id)')
        .eq('bookings.itinerary_id', body.itinerary_id)
        .eq('bookings.org_id', orgId)
        .not('insurance_confirmed_at', 'is', null)
        .gt('insurance_premium_jpy', 0)

      for (const p of insured ?? []) {
        const name =
          [p.family_name_kanji, p.given_name_kanji].filter(Boolean).join(' ') ||
          [p.last_name, p.first_name].filter(Boolean).join(' ')
        additions.push({
          id: null,
          source: 'insurance',
          description: `海外旅行傷害保障 トラベルセーフティプラン ${p.insurance_plan_code}${name ? `（${name}）` : ''}`,
          quantity: 1,
          unit_price: Number(p.insurance_premium_jpy),
          // A yen figure published by the insurer, by definition.
          currency: 'JPY',
        })
      }

      // Extras and upgrades: confirmed, and not already on someone else's
      // invoice. The `invoiced_at` stamp written after the insert is what stops
      // the same extra being billed twice.
      const { data: extras, error: extrasError } = await supabaseAdmin
        .from('booking_extras')
        .select('id, title, kind, quantity, unit_price, currency, bookings!inner(itinerary_id, org_id)')
        .eq('status', 'confirmed')
        .is('invoiced_at', null)
        .eq('org_id', orgId)
        .eq('bookings.itinerary_id', body.itinerary_id)
      // A database without migration 20260828_booking_extras answers with an
      // error. An invoice for the trip itself is still correct, so it is raised
      // without them rather than refused.
      if (extrasError) console.error('invoices: could not read extras', extrasError)

      for (const e of extras ?? []) {
        additions.push({
          id: String(e.id),
          source: 'extra',
          description: e.kind === 'upgrade' ? `${e.title} (upgrade)` : String(e.title),
          quantity: Number(e.quantity) || 1,
          unit_price: Number(e.unit_price),
          currency: String(e.currency || currency),
        })
      }
    }

    const parts = partitionAdditions(additions, currency)

    // The premium is not converted — a rate applied to somebody else's tariff
    // invents a precision they never quoted — so an invoice in the wrong
    // currency is REFUSED rather than fudged. A.T.S bill in JPY; anything else
    // here is a mistake worth stopping.
    if (parts.otherCurrency.some(a => a.source === 'insurance')) {
      return NextResponse.json(
        {
          error:
            'This trip has confirmed travel insurance, which is priced in JPY. ' +
            `Invoice this booking in JPY (it is currently ${currency}) rather than converting the premium.`,
        },
        { status: 409 }
      )
    }

    // An extra in another currency is a different decision: refusing the whole
    // invoice would block billing the trip at all. It is left off this document
    // and left UNSTAMPED, so it turns up on the next invoice raised in its own
    // currency — and the caller is told, so it does not look free.
    excludedExtras = parts.otherCurrency.filter(a => a.source === 'extra')

    const additionsTotal = parts.total
    const additionLines = toLineItems(parts.billable, currency)
    billedExtraIds = parts.billable.filter(a => a.source === 'extra' && a.id).map(a => a.id as string)
    if (additionsTotal) {
      // An addition is part of what the trip costs, so full_trip_cost tells the
      // truth about the total. What it is NOT is part of the deposit base: a
      // deposit is a percentage on account against the tour, while a premium is
      // a fixed pass-through the insurer charges in full and an extra was
      // agreed after the deposit was invoiced. Taking 20% of a ¥12,200 premium
      // bills ¥2,440 for cover that costs ¥12,200.
      //
      // So additions settle with the BALANCE, and appear on exactly one
      // document: the final invoice, or a standard one. Putting them on both a
      // deposit and a final would bill them twice.
      fullTripCost += additionsTotal
    }

    if (invoiceType === 'deposit') {
      totalAmount = roundToCurrency(((fullTripCost - additionsTotal) * depositPercent) / 100, currency)

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
      let depositAmount = roundToCurrency(((fullTripCost - additionsTotal) * depositPercent) / 100, currency)
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
          const expected = roundToCurrency(((fullTripCost - additionsTotal) * depositPercent) / 100, currency)
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
      const tourBalance = roundToCurrency(Math.max(0, totalAmount - additionsTotal), currency)
      lineItems = [{
        description: `${headerPrefix} - ${body.line_items?.[0]?.description || 'Tour Package'} (Total: ${currency} ${fullTripCost.toFixed(moneyDp)} minus deposit ${currency} ${depositAmount.toFixed(moneyDp)})${depositReconciles ? '' : reconcileNote}`,
        quantity: 1,
        unit_price: tourBalance,
        amount: tourBalance
      }]
    }

    // A standard invoice is whatever the caller said, PLUS anything added here.
    // Without this the document lists a premium line it does not bill.
    if (invoiceType === 'standard' && additionsTotal && includeAdditions(invoiceType)) {
      totalAmount = roundToCurrency(totalAmount + additionsTotal, currency)
    }

    // Appended LAST: the final branch rebuilds lineItems from scratch, so
    // anything added before it is silently dropped. Not on the deposit — the
    // premium is settled with the balance, and listing it on both documents
    // would say it is owed twice.
    if (additionsTotal && includeAdditions(invoiceType)) {
      lineItems = [...lineItems, ...additionLines]
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

    // Mark the extras that made it onto this document. THIS is what stops one
    // being billed twice — the next invoice for the trip filters on
    // invoiced_at IS NULL. Not on a deposit: they are not billed there.
    if (data?.id && billedExtraIds.length && includeAdditions(invoiceType)) {
      const { error: stampError } = await supabaseAdmin
        .from('booking_extras')
        .update({ invoiced_at: new Date().toISOString(), invoice_id: data.id })
        .in('id', billedExtraIds)
        .eq('org_id', orgId)
      // Loud, because the failure mode is silent double-billing later.
      if (stampError) console.error('invoices: could not stamp extras as invoiced', stampError)
    }

    // Fire-and-forget accounting sync
    if (data?.id) {
      syncInvoice(data.id).catch(err => console.error('Accounting sync failed:', err))
    }

    return NextResponse.json(
      excludedExtras.length
        ? {
            ...data,
            // Deliberately not on this invoice, and deliberately not converted.
            excluded_extras: excludedExtras.map(e => ({
              title: e.description,
              currency: e.currency,
              amount: e.unit_price * (e.quantity || 1),
            })),
          }
        : data,
      { status: 201 }
    )
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