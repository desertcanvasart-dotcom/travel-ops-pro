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
import { getCurrentOrgId, getCurrentUserId, getCurrentUserRole, noOrgResponse } from '@/lib/auth/current-org'
import { currencyDecimals, roundToCurrency } from '@/lib/currency-totals'
import { invoiceNet, invoiceTotals, resolveInvoiceVat } from '@/lib/invoices/totals'
import { getOrgVatRate, invoiceVatExcluded, loadTripVatExtras, parseVatApplied, tripVatExcludedShare } from '@/lib/vat'
import { recordsInOrg } from '@/lib/org-refs'
import { checkInvoiceAmounts } from '@/lib/invoices/validate'
import {
  amountsDiffer,
  canOverrideInvoiceAmount,
  loadTripInvoiceBase,
  parseAmountOverride,
  plannedTourAmount,
  reconcileLineItems,
  type AmountSource,
  type TripInvoiceBase,
} from '@/lib/invoices/server-amounts'
import { displayStatus, OVERDUE_ELIGIBLE_STATUSES } from '@/lib/invoices/status'
import { getOrgDefaultCurrency } from '@/lib/org-default-currency'
import { businessToday } from '@/lib/today'
import { firstReminderDate } from '@/lib/invoices/reminder-schedule'

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

    const today = businessToday()
    if (status === 'overdue') {
      // Never stored: a sent invoice past its due date with a balance
      // (lib/invoices/status). Asking the column for 'overdue' returned nothing.
      query = query
        .in('status', [...OVERDUE_ELIGIBLE_STATUSES])
        .lt('due_date', today)
        .gt('balance_due', 0)
    } else if (status) {
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
      // What the screens show: 'overdue' worked out here, once, for all of them.
      display_status: displayStatus(invoice, today),
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

    // The trip, client and parent invoice must be this org's (lib/org-refs):
    // the list embeds the trip's client phone through the first key, and a
    // foreign parent id would be stored as the link.
    if (!(await recordsInOrg(supabaseAdmin, orgId, { itinerary_id: body.itinerary_id, client_id: body.client_id, invoice_id: body.parent_invoice_id }))) {
      return NextResponse.json({ error: 'Itinerary or client not found' }, { status: 404 })
    }

    // Validate required fields
    if (!body.client_name) {
      return NextResponse.json(
        { error: 'Client name is required' },
        { status: 400 }
      )
    }

    // Invoice numbers are the COMPANY's own series (migration 20261225):
    // next_invoice_number() hands out the next one under a row lock, or, where
    // that function is missing, the company's own highest number + 1 is read as
    // a number (never the install-wide sequence, never another company's
    // invoices). The insert below is wrapped in a retry loop against the 23505
    // unique violation of UNIQUE (org_id, invoice_number). The deposit/final
    // type suffix is appended at row-build time to a fresh base number.
    const invoiceType = body.invoice_type || 'standard'
    const buildInvoiceNumber = async () => {
      const base = await nextDocumentNumber({
        supabase: supabaseAdmin,
        prefix: 'INV',
        sequenceName: 'invoice_number_seq',
        table: 'invoices',
        column: 'invoice_number',
        orgId,
        counterRpc: 'next_invoice_number',
      })
      if (invoiceType === 'deposit') return `${base}-DEP`
      if (invoiceType === 'final') return `${base}-FIN`
      return base
    }

    // The amounts the caller may send are checked before any arithmetic
    // (lib/invoices/validate): no negative or non-numeric total, a deposit
    // between 0 (exclusive) and 100%.
    const amounts = checkInvoiceAmounts(body)
    if (!amounts.ok) {
      return NextResponse.json({ error: amounts.error }, { status: 400 })
    }

    // ---------- what this invoice bills, and where the figure comes from ----------
    // The trip price is the SERVER's (lib/invoices/server-amounts): the saved
    // trip's selling price, as the itinerary page shows it. The total_amount /
    // full_trip_cost the browser sends are not used for an invoice that has a
    // trip (or a deposit to settle); a different amount is a manual override,
    // for an admin or manager, recorded on the invoice with its reason.
    const role = await getCurrentUserRole()
    const overrideParsed = parseAmountOverride(body.manual_override, role)
    if (!overrideParsed.ok) {
      return NextResponse.json({ error: overrideParsed.error }, { status: overrideParsed.status })
    }

    // A final settles a deposit invoice, and the deposit's trip is the trip: an
    // itinerary_id left out cannot take the invoice off the server's base.
    let parentInvoice: Record<string, any> | null = null
    if (body.parent_invoice_id) {
      const { data: parentRow } = await supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('id', body.parent_invoice_id)
        .eq('org_id', orgId)
        .maybeSingle()
      parentInvoice = parentRow
    }
    if (body.itinerary_id && parentInvoice?.itinerary_id && body.itinerary_id !== parentInvoice.itinerary_id) {
      return NextResponse.json({ error: 'The deposit invoice belongs to another trip' }, { status: 400 })
    }
    const itineraryId: string | null = body.itinerary_id || parentInvoice?.itinerary_id || null

    let tripBase: TripInvoiceBase | null = null
    if (itineraryId) {
      tripBase = await loadTripInvoiceBase(supabaseAdmin, orgId, itineraryId)
      if (!tripBase) return NextResponse.json({ error: 'Itinerary or client not found' }, { status: 404 })
    }

    // Every derived amount below is rounded to THIS currency's minor unit.
    // Without it a 20% deposit on ¥1,854,367 bills ¥370,873.4, and a yen with a
    // decimal place is not an amount of money that exists.
    //
    // None sent: the trip's, else the company's own (organizations.default_currency).
    // It was 'EUR' for everyone, so a form submitted before the preference
    // loaded filed a yen company's invoice in euro.
    let currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : ''
    if (!currency) currency = tripBase?.currency || ''
    if (!currency) currency = await getOrgDefaultCurrency(supabaseAdmin, orgId)
    // The trip's price is in the trip's currency: billing it in another would
    // put one currency's figure under another's name.
    if (tripBase?.currency && currency !== tripBase.currency) {
      return NextResponse.json(
        { error: `This trip is priced in ${tripBase.currency}; an invoice for it cannot be in ${currency}.` },
        { status: 400 }
      )
    }
    const moneyDp = currencyDecimals(currency)

    // Calculate amounts based on invoice type
    let totalAmount = amounts.totalAmount
    // A line's `source` says the SERVER added it as insurance or an extra, and
    // VAT leaves those out (lib/vat.ts) — so a caller's line never carries one.
    let lineItems = Array.isArray(body.line_items)
      ? body.line_items.map((l: Record<string, unknown>) => {
          if (!l || typeof l !== 'object' || !('source' in l)) return l
          const { source: _source, ...rest } = l
          void _source
          return rest
        })
      : []
    // A final carries its deposit's percent unless it names one.
    const percentSent = body.deposit_percent !== undefined && body.deposit_percent !== null && body.deposit_percent !== ''
    const depositPercent = parentInvoice && !percentSent && Number(parentInvoice.deposit_percent) > 0
      ? Number(parentInvoice.deposit_percent)
      : amounts.depositPercent

    // The trip price this invoice works from: the trip's saved total, else (a
    // final whose deposit has no trip) the trip cost that deposit stored, else
    // nothing — and the amount is typed, which only an admin or manager may do.
    const parentNet = parentInvoice?.total_amount != null ? invoiceNet(parentInvoice) : null
    const storedParentTrip = Number(parentInvoice?.full_trip_cost)
    const serverBase: number | null = tripBase
      ? tripBase.net
      : invoiceType === 'final' && Number.isFinite(storedParentTrip) && storedParentTrip > 0
        ? storedParentTrip
        : null

    let amountSource: AmountSource
    let computedAmount: number | null = null
    // The amount to bill for the tour part when an admin or manager overrides.
    let tourOverride: number | null = null
    let fullTripCost: number
    if (serverBase !== null) {
      fullTripCost = serverBase
      computedAmount = plannedTourAmount({ invoiceType, tripNet: serverBase, depositPercent, currency, parentNet })
      const override = overrideParsed.override
      if (override && amountsDiffer(override.amount, computedAmount, currency)) {
        amountSource = 'manual_override'
        tourOverride = roundToCurrency(override.amount, currency)
      } else {
        amountSource = tripBase ? 'trip' : 'parent'
        if (serverBase <= 0) {
          return NextResponse.json(
            { error: 'This trip has no price yet. Price it on the itinerary before invoicing it (an admin or manager can enter an amount by hand, with a reason).' },
            { status: 400 }
          )
        }
        // A discount lowers what is billed: it is a different amount.
        if (invoiceType === 'standard' && amounts.discountAmount > 0) {
          return NextResponse.json(
            { error: 'A discount changes the amount billed. An admin or manager can bill the discounted amount as a manual amount, with a reason.' },
            { status: 400 }
          )
        }
      }
    } else {
      // Nothing to work the amount out from: it is typed in, so it is a manager's.
      if (!canOverrideInvoiceAmount(role)) {
        return NextResponse.json(
          { error: 'An invoice that is not linked to a trip has no price to work out. Link it to a trip, or ask an admin or manager to enter the amount.' },
          { status: 403 }
        )
      }
      amountSource = 'manual_entry'
      fullTripCost = amounts.fullTripCost || totalAmount // Store original trip cost
    }

    // One final invoice per deposit and one deposit per trip. The page hides
    // the button once a child exists, but two clicks, a retry or two agents
    // reached the API twice and billed the balance (or the deposit) twice.
    // A cancelled invoice does not count: it can be replaced.
    if (invoiceType === 'final' && body.parent_invoice_id) {
      const { data: existing } = await supabaseAdmin
        .from('invoices')
        .select('id, invoice_number')
        .eq('org_id', orgId)
        .eq('parent_invoice_id', body.parent_invoice_id)
        .eq('invoice_type', 'final')
        .neq('status', 'cancelled')
        .limit(1)
      if (existing && existing.length) {
        return NextResponse.json({ error: `A final invoice (${existing[0].invoice_number}) already exists for this deposit invoice` }, { status: 409 })
      }
    }
    if (invoiceType === 'deposit' && itineraryId) {
      const { data: existing } = await supabaseAdmin
        .from('invoices')
        .select('id, invoice_number')
        .eq('org_id', orgId)
        .eq('itinerary_id', itineraryId)
        .eq('invoice_type', 'deposit')
        .neq('status', 'cancelled')
        .limit(1)
      if (existing && existing.length) {
        return NextResponse.json({ error: `A deposit invoice (${existing[0].invoice_number}) already exists for this trip` }, { status: 409 })
      }
    }

    // VAT (lib/vat.ts): as the caller chose, else as the source carries it —
    // the deposit a final settles, else the trip (which has it from its
    // quote). The rate is the company's today and is recorded on the invoice;
    // the amount is worked out below from the net, never taken from the body.
    let vatApplied = parseVatApplied(body.vat_applied)
    if (vatApplied === undefined) {
      const { data: tripRow } = itineraryId
        ? await supabaseAdmin.from('itineraries').select('*').eq('id', itineraryId).eq('org_id', orgId).maybeSingle()
        : { data: null }
      vatApplied = resolveInvoiceVat(undefined, { parent: parentInvoice, itinerary: tripRow })
    }
    const vatRate = vatApplied ? await getOrgVatRate(supabaseAdmin, orgId) : 0
    // No VAT on extras (owner, 2026-10-13): a trip whose lines include extras
    // has that share of what this invoice bills for it left out of the base.
    const tripShare = vatApplied && itineraryId
      ? tripVatExcludedShare(await loadTripVatExtras(supabaseAdmin, itineraryId))
      : 0

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
    if (itineraryId) {
      const { data: insured } = await supabaseAdmin
        .from('booking_passengers')
        .select('first_name, last_name, family_name_kanji, given_name_kanji, insurance_plan_code, insurance_premium_jpy, bookings!inner(itinerary_id, org_id)')
        .eq('bookings.itinerary_id', itineraryId)
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
        .eq('bookings.itinerary_id', itineraryId)
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
      totalAmount = tourOverride ?? roundToCurrency(((fullTripCost - additionsTotal) * depositPercent) / 100, currency)

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
      // or the two documents disagree about what was already paid. The trip
      // cost is the server's (the saved trip, or the one the deposit stored);
      // it is no longer rebuilt from the deposit by dividing out the percent,
      // which lost what rounding removed.
      let depositAmount = roundToCurrency(((fullTripCost - additionsTotal) * depositPercent) / 100, currency)
      let depositSource: 'percent' | 'parent' = 'percent'
      let depositReconciles = true
      let reconcileNote = ''
      if (parentInvoice && parentNet != null) {
        // The deposit's NET: a deposit carrying VAT recorded it in tax_amount,
        // and what it paid towards the trip price is the part before VAT.
        depositAmount = parentNet
        depositSource = 'parent'
        // Surface a mismatch between the recomputed percent and the
        // actual parent amount (a manual deposit, or a trip repriced since);
        // don't fail the request, but record the delta.
        const expected = roundToCurrency(((fullTripCost - additionsTotal) * depositPercent) / 100, currency)
        if (Math.abs(expected - depositAmount) > 0.01) {
          depositReconciles = false
          reconcileNote = ` (parent deposit ${parentInvoice.currency || ''}${depositAmount.toFixed(moneyDp)} differs from ${depositPercent}% of trip ${expected.toFixed(moneyDp)})`
        }
      }
      totalAmount = roundToCurrency(Math.max(0, fullTripCost - depositAmount), currency)
      // A manual amount replaces the tour balance; what the server adds stays.
      if (tourOverride !== null) totalAmount = roundToCurrency(tourOverride + additionsTotal, currency)
      const headerPrefix = tourOverride !== null ? 'Final Balance (manual amount)' : depositSource === 'parent' ? 'Final Balance (parent-deposit-based)' : 'Final Balance'
      // The balance LINE covers the tour only, because the premium is listed
      // separately below. Rolling it into this line would make the document
      // total correct while saying nothing about what the extra money is for.
      const tourBalance = roundToCurrency(Math.max(0, totalAmount - additionsTotal), currency)
      lineItems = [{
        description: `${headerPrefix} - ${body.line_items?.[0]?.description || 'Tour Package'} (Total: ${currency} ${fullTripCost.toFixed(moneyDp)} minus deposit ${currency} ${depositAmount.toFixed(moneyDp)})${depositReconciles || tourOverride !== null ? '' : reconcileNote}`,
        quantity: 1,
        unit_price: tourBalance,
        amount: tourBalance
      }]
    }

    // A standard (full) invoice for a trip bills the trip's saved total, or the
    // manual amount. Its lines are the caller's wording, kept when they add up
    // to that figure and replaced by one line when they do not.
    if (invoiceType === 'standard' && serverBase !== null) {
      totalAmount = tourOverride ?? computedAmount ?? totalAmount
      lineItems = reconcileLineItems(lineItems, totalAmount + amounts.discountAmount, currency, body.description || 'Tour Package')
    }

    // A standard invoice's own total in the currency's smallest unit: the trip
    // page sends cost × 1.25 to the cent (¥15,431.25), and a client paying the
    // ¥15,431 shown left the invoice "partial" with ¥0.25 due — and reminded.
    if (invoiceType === 'standard') totalAmount = roundToCurrency(totalAmount, currency)

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

    // Subtotal + tax − discount must equal the total (see lib/invoices/totals).
    // totalAmount is the NET here; the tax is VAT on it, added on top — on all
    // of it except the insurance premiums and extras added above and the
    // trip's own extras share (owner, 2026-10-13: "No taxes over extras or
    // insurance"). They are still billed; they are just not taxed.
    const { vat_applied: vatOnInvoice, ...totals } = invoiceTotals({
      invoiceType,
      netAmount: totalAmount,
      vatApplied,
      vatRate,
      vatExcluded: invoiceVatExcluded({
        net: roundToCurrency(totalAmount, currency),
        additions: includeAdditions(invoiceType) ? additionsTotal : 0,
        tripShare,
        currency,
      }),
      discountAmount: amounts.discountAmount,
      currency,
    })

    const baseInvoice = {
      org_id: orgId,
      invoice_type: invoiceType,
      deposit_percent: depositPercent,
      parent_invoice_id: body.parent_invoice_id || null,
      client_id: body.client_id,
      itinerary_id: itineraryId,
      client_name: body.client_name,
      client_email: body.client_email || null,
      line_items: lineItems,
      // What the whole trip costs. Stored rather than reconstructed: dividing a
      // rounded deposit back out cannot recover what rounding removed, which is
      // how the PDF came to quote a trip cost 2 yen below the real one.
      full_trip_cost: invoiceType === 'standard' ? null : fullTripCost,
      // Where the figure came from (migration 20261228): the saved trip, the
      // deposit it settles, a manager's typed amount, or a recorded override.
      amount_source: amountSource,
      computed_amount: computedAmount,
      ...(amountSource === 'manual_override' && overrideParsed.ok && overrideParsed.override
        ? { override_amount: tourOverride, override_reason: overrideParsed.override.reason, override_by: await getCurrentUserId() }
        : {}),
      ...totals,
      // Written only when on: off is the column's default, so an invoice
      // without VAT still saves on a database before migration 20261214.
      ...(vatOnInvoice ? { vat_applied: true } : {}),
      currency,
      amount_paid: 0,
      balance_due: totals.total_amount,
      status: 'draft',
      issue_date: body.issue_date || new Date().toISOString().split('T')[0],
      due_date: body.due_date || null,
      // Reminders start a week before it falls due. NULL here meant the daily
      // cron (which asks for a date <= today) never picked a new invoice up.
      next_reminder_date: /^\d{4}-\d{2}-\d{2}/.test(String(body.due_date ?? '')) ? firstReminderDate(String(body.due_date).slice(0, 10)) : null,
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