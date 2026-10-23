import { createClient } from '@supabase/supabase-js'
import { quoteInOrg, quoteNotFound } from '@/lib/b2b/quote-scope'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { allowsIncomplete } from '@/lib/pricing/quote-completeness'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { paymentRuleFrom } from '@/lib/payment-schedule'
import { computeDeposit } from '@/lib/booking-creation'
import { roundToCurrency } from '@/lib/currency-totals'
import { tripVatFromQuote } from '@/lib/vat'
import { fetchRunExchangeRates } from '@/lib/rates/fx-source'
import { parseFrozenFx, frozenToExchangeRates } from '@/lib/itinerary-fx'
import { quoteAmountsInTripCurrency } from '@/lib/b2b/convert-money'
import { isWebsitePriced } from '@/lib/pricing/website-price'
import { convertTemplateQuote, QUOTE_FOR_CONVERT_SELECT } from '@/lib/b2b/convert-template-quote'

// ============================================
// B2B QUOTE CONVERT TO ITINERARY API
// File: app/api/b2b/quotes/[id]/convert/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    // The itinerary's author is the signed-in user. It was taken from the
    // body (the page sent nothing, so it was NULL, and a crafted request
    // could name anyone).
    const user_id = await getCurrentUserId()

    // M3 Phase 2A — itineraries.org_id is NOT NULL. Resolve from session.
    const orgId = await getCurrentOrgId()
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: 'No organization context — re-login or contact admin.' },
        { status: 403 }
      )
    }

    // TENANT BOUNDARY — converting someone else's quote would create an
    // itinerary in OUR org from THEIR priced work.
    if (!(await quoteInOrg(supabaseAdmin, id, orgId))) return quoteNotFound()

    // The operator's payment rule (Settings → payment terms; 20/3/60 when
    // unset). The deposit written on the itinerary used to be a hardcoded
    // 30%, and the booking made from it inherited that figure — so the
    // schedule the office actually works to never reached either record.
    const { data: orgTerms } = await supabaseAdmin
      .from('organizations')
      .select('deposit_percent, deposit_due_days, balance_due_days_before_departure')
      .eq('id', orgId)
      .maybeSingle()
    const paymentRule = paymentRuleFrom(orgTerms)

    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('tour_quotes')
      .select(QUOTE_FOR_CONVERT_SELECT)
      .eq('id', id)
      .single()

    if (quoteError || !quote) {
      // The quote passed quoteInOrg() a moment ago, so a failure HERE is the
      // query, not the id — log it as such, or the next embed mistake reads
      // as a missing quote again.
      console.error('B2B convert: quote fetch failed:', quoteError)
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    if (quote.converted_to_itinerary_id) {
      return NextResponse.json(
        { error: 'Quote already converted', itinerary_id: quote.converted_to_itinerary_id },
        { status: 400 }
      )
    }

    // Only an accepted offer becomes a trip. The page showed the button only
    // for accepted quotes, but the route converted a draft or a rejected one
    // for anyone who called it.
    if (quote.status !== 'accepted') {
      return NextResponse.json(
        { error: `Only an accepted quote can be converted (this one is ${quote.status || 'draft'}). Mark it accepted first.` },
        { status: 409 }
      )
    }


    // Output gate (harness Layer 2): don't convert a quote with a non-deliverable
    // price into a "quoted" itinerary that then flows to PDFs/invoices.
    // An itinerary built from a quote with unpriced services inherits the gap
    // silently — it carries a total that leaves them out. Refused unless the
    // operator has knowingly chosen to go ahead.
    const priceCheck = checkAmountDeliverable(quote.selling_price, {
      currency: quote.currency,
      servicesSnapshot: quote.services_snapshot ?? [],
      // A website order's price is final; a cost with no rate is the office's
      // to fill in, never a hole in what the customer pays.
      allowIncomplete: allowsIncomplete(body?.allow_incomplete) || isWebsitePriced(quote),
    })
    if (!priceCheck.ok) {
      return NextResponse.json(
        {
          error: priceCheck.incomplete
            ? `This quote has ${priceCheck.gaps?.length ?? 0} service(s) with no rate.`
            : 'Quote price is not deliverable',
          violations: priceCheck.violations,
          incomplete: priceCheck.incomplete ?? false,
          gaps: priceCheck.gaps ?? [],
        },
        { status: 422 }
      )
    }

    // ============================================
    // PATH A: WhatsApp-parsed quote (itinerary already exists)
    // ============================================
    if (quote.itinerary_id) {
      // Update the existing draft itinerary with B2B pricing
      const partnerInfo = quote.b2b_partners as { id: string; company_name: string; partner_code: string; commission_percent: number } | null

      // The trip must be ours too: quoteInOrg proves only the quote is, and
      // its itinerary_id was stored as the caller gave it.
      const { data: trip } = await supabaseAdmin
        .from('itineraries')
        .select('id, currency, fx_frozen')
        .eq('id', quote.itinerary_id)
        .eq('org_id', orgId)
        .maybeSingle()
      if (!trip) return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })

      // The quote is priced in the org's rate currency; the trip and its
      // service lines are in the trip's own (lib/b2b/convert-money).
      const quoteCurrency = quote.currency || trip.currency || 'EUR'
      const frozen = parseFrozenFx(trip.fx_frozen)
      const rates = !trip.currency || trip.currency === quoteCurrency
        ? null
        // Today's rates as pricing runs read them — the org's exchange_rates
        // table over the ECB feed, which has no EGP (and fell back to
        // hard-coded rates for it without a word).
        : frozen ? frozenToExchangeRates(frozen) : await fetchRunExchangeRates()
      const amounts = quoteAmountsInTripCurrency(quote, trip.currency, rates)
      if (!amounts) {
        return NextResponse.json(
          { error: `No exchange rate from ${quoteCurrency} to ${trip.currency} — the quote cannot be put on this trip.` },
          { status: 409 }
        )
      }
      const sellingInTrip = amounts.selling_price
      const depositInTrip = roundToCurrency(computeDeposit(Number(sellingInTrip) || 0, paymentRule.deposit_percent).depositAmount, amounts.currency)

      const { data: updatedTrip, error: updateError } = await supabaseAdmin
        .from('itineraries')
        .update({
          status: 'quoted',
          total_cost: sellingInTrip,
          total_revenue: sellingInTrip,
          supplier_cost: amounts.total_cost,
          profit: amounts.margin_amount,
          margin_percent: quote.margin_percent,
          deposit_amount: depositInTrip,
          balance_due: roundToCurrency((sellingInTrip || 0) - depositInTrip, amounts.currency),
          payment_status: 'not_paid',
          partner_id: quote.partner_id || null,
          partner_commission_percent: partnerInfo?.commission_percent || 0,
          // The trip shows its client total with the quote's VAT choice and
          // recorded rate (lib/vat.ts); the invoice raised from it inherits it.
          ...tripVatFromQuote(quote),
          source: 'b2b_custom',
          notes: `Converted from B2B quote ${quote.quote_number}`,
        })
        .eq('id', quote.itinerary_id)
        .eq('org_id', orgId)
        .select('itinerary_code')
        .maybeSingle()

      if (updateError) {
        console.error('Failed to update itinerary:', updateError)
        return NextResponse.json({ error: 'Failed to update itinerary' }, { status: 500 })
      }
      if (!updatedTrip) return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
      const existingItinerary = updatedTrip

      // Mark quote as converted
      await supabaseAdmin
        .from('tour_quotes')
        .update({
          status: 'converted',
          converted_to_itinerary_id: quote.itinerary_id,
          converted_at: new Date().toISOString()
        })
        .eq('id', id)

      return NextResponse.json({
        success: true,
        data: {
          itinerary_id: quote.itinerary_id,
          itinerary_code: existingItinerary?.itinerary_code || '',
          quote_number: quote.quote_number,
          message: 'Quote converted — existing itinerary updated with B2B pricing'
        }
      })
    }

    // ============================================
    // PATH B: Template-based quote (create new itinerary)
    // ============================================
    // PATH B builds the itinerary, so it needs the trip's own first day: the quote's travel date, else the one the
    // operator gave. Never today — that dated the itinerary, its vouchers and
    // its payment schedule from the moment of conversion.
    const startIso = (typeof quote.travel_date === 'string' && quote.travel_date)
      || (typeof body.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date) ? body.start_date : null)
    if (!startIso) {
      return NextResponse.json(
        { error: 'This quote has no travel date. Give the trip\'s first day (start_date) to convert it.' },
        { status: 400 }
      )
    }
    const made = await convertTemplateQuote(supabaseAdmin, { quote, orgId, userId: user_id, startIso, depositPercent: paymentRule.deposit_percent })
    if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status })
    return NextResponse.json({
      success: true,
      data: {
        itinerary_id: made.itineraryId,
        itinerary_code: made.itineraryCode,
        quote_number: quote.quote_number,
        message: 'Quote successfully converted to itinerary'
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}