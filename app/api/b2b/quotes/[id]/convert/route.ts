import { createClient } from '@supabase/supabase-js'
import { quoteInOrg, quoteNotFound } from '@/lib/b2b/quote-scope'
import { reassertClientId } from '@/lib/itineraries/reassert-client'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { paymentRuleFrom } from '@/lib/payment-schedule'
import { computeDeposit } from '@/lib/booking-creation'
import { templateDaysToItineraryDays, packageTypeForTemplate, serviceLineForItinerary } from '@/lib/itineraries/template-days'

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
    const body = await request.json()
    const { user_id } = body

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
    const depositOf = (selling: number | null | undefined) => computeDeposit(Number(selling) || 0, paymentRule.deposit_percent).depositAmount

    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('tour_quotes')
      .select(`
        *,
        tour_variations (
          id, variation_name, variation_code, tier, group_type, inclusions, exclusions,
          tour_templates (
            id, template_name, template_code, duration_days, duration_nights, cities_covered,
            tour_type, itinerary
          )
        ),
        b2b_partners (id, company_name, partner_code, commission_percent)
      `)
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

    // Output gate (harness Layer 2): don't convert a quote with a non-deliverable
    // price into a "quoted" itinerary that then flows to PDFs/invoices.
    const priceCheck = checkAmountDeliverable(quote.selling_price, { currency: quote.currency })
    if (!priceCheck.ok) {
      return NextResponse.json(
        { error: 'Quote price is not deliverable', violations: priceCheck.violations },
        { status: 422 }
      )
    }

    // ============================================
    // PATH A: WhatsApp-parsed quote (itinerary already exists)
    // ============================================
    if (quote.itinerary_id) {
      // Update the existing draft itinerary with B2B pricing
      const partnerInfo = quote.b2b_partners as { id: string; company_name: string; partner_code: string; commission_percent: number } | null

      const { error: updateError } = await supabaseAdmin
        .from('itineraries')
        .update({
          status: 'quoted',
          total_cost: quote.selling_price,
          total_revenue: quote.selling_price,
          supplier_cost: quote.total_cost,
          profit: quote.margin_amount,
          margin_percent: quote.margin_percent,
          deposit_amount: depositOf(quote.selling_price),
          balance_due: Math.round(((quote.selling_price || 0) - depositOf(quote.selling_price)) * 100) / 100,
          payment_status: 'not_paid',
          partner_id: quote.partner_id || null,
          partner_commission_percent: partnerInfo?.commission_percent || 0,
          source: 'b2b_custom',
          notes: `Converted from B2B quote ${quote.quote_number}`,
        })
        .eq('id', quote.itinerary_id)

      if (updateError) {
        console.error('Failed to update itinerary:', updateError)
        return NextResponse.json({ error: 'Failed to update itinerary' }, { status: 500 })
      }

      // Fetch itinerary code for response
      const { data: existingItinerary } = await supabaseAdmin
        .from('itineraries')
        .select('itinerary_code')
        .eq('id', quote.itinerary_id)
        .single()

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
    const template = quote.tour_variations?.tour_templates
    const variation = quote.tour_variations

    // Create or find client
    let clientId = null
    if (quote.client_email) {
      // Scoped: matching on email alone would attach this quote to another
      // organisation's customer, and clients is org-scoped as of
      // migrations/20260825_clients_org_id.sql.
      const { data: existingClient } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('email', quote.client_email)
        .eq('org_id', orgId)
        .maybeSingle()

      if (existingClient) {
        clientId = existingClient.id
      } else {
        const nameParts = (quote.client_name || '').split(' ')
        const { data: newClient, error: clientError } = await supabaseAdmin
          .from('clients')
          .insert({
            org_id: orgId,
            first_name: nameParts[0] || 'Unknown',
            last_name: nameParts.slice(1).join(' ') || '',
            email: quote.client_email,
            phone: quote.client_phone,
            nationality: quote.client_nationality,
            // clients has no source/notes columns — lead_source and
            // internal_notes are the real ones.
            lead_source: 'b2b_quote',
            internal_notes: `Created from B2B quote ${quote.quote_number}`
          })
          .select()
          .single()

        if (clientError) {
          console.error('B2B convert: client insert failed:', clientError)
        }
        if (newClient) clientId = newClient.id
      }
    }

    // Generate itinerary code
    const year = new Date().getFullYear().toString().slice(-2)
    const { count } = await supabaseAdmin.from('itineraries').select('*', { count: 'exact', head: true })
    const itineraryNumber = ((count || 0) + 1).toString().padStart(3, '0')
    const itineraryCode = `ITN-${year}-${itineraryNumber}`

    const startDate = quote.travel_date ? new Date(quote.travel_date) : new Date()
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + (template?.duration_days || 1) - 1)

    // Get partner info for the itinerary
    const partnerInfo = quote.b2b_partners as { id: string; company_name: string; partner_code: string; commission_percent: number } | null

    const { data: itinerary, error: itinError } = await supabaseAdmin
      .from('itineraries')
      .insert({
        itinerary_code: itineraryCode,
        org_id: orgId,
        client_id: clientId,
        client_name: quote.client_name || 'B2B Client',
        trip_name: template?.template_name || quote.trip_name || 'Tour Package',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        total_days: template?.duration_days || 1,
        num_adults: quote.num_adults,
        num_children: quote.num_children || 0,
        status: 'quoted',
        // package_type is an ENUM; 'custom' was not a member and the insert
        // failed for every template quote (lib/itineraries/template-days.ts).
        package_type: packageTypeForTemplate(template),
        // The programme this trip follows — so the 日程表 button is already
        // linked and does not ask again.
        template_id: template?.id ?? null,
        // Standard at all times (operator, 2026-09-03): the quote was priced
        // at the standard tier by default, so the trip is labelled the same
        // way. The variation's imported tier ("Deluxe") is not a rate level
        // the office holds contracts for; the edit page can still change it.
        tier: 'standard',
        total_cost: quote.selling_price,
        supplier_cost: quote.total_cost,
        profit: quote.margin_amount,
        margin_percent: quote.margin_percent,
        currency: quote.currency || 'EUR',
        deposit_amount: depositOf(quote.selling_price),
        balance_due: Math.round(((quote.selling_price || 0) - depositOf(quote.selling_price)) * 100) / 100,
        payment_status: 'not_paid',
        user_id, // itineraries has user_id, not created_by
        notes: `Converted from B2B quote ${quote.quote_number}`,
        // B2B Partner fields
        partner_id: quote.partner_id || null,
        partner_commission_percent: partnerInfo?.commission_percent || 0,
        source: 'b2b_template'
      })
      .select()
      .single()

    if (itinError || !itinerary) {
      // The database's reason must reach the log: this exact insert failed
      // for weeks on an enum value and nothing said so.
      console.error('B2B convert: itinerary insert failed:', itinError)
      return NextResponse.json({ error: 'Failed to create itinerary' }, { status: 500 })
    }
    // Prod drops client_id on INSERT — keep the converted trip on its client.
    await reassertClientId(supabaseAdmin, itinerary, clientId)

    // Create itinerary days + services. Track failures: a partial conversion
    // must NOT mark the quote 'converted' (that permanently locks the quote to
    // an incomplete itinerary). This delete/insert chain isn't a DB transaction,
    // so on any error we roll back by deleting the just-created itinerary (and
    // its days/services) and leave the quote unconverted, so it can be retried.
    // The programme lives on tour_templates.itinerary (JSONB), NOT in
    // tour_days — that table is a legacy one keyed by tour_id with no
    // relationship to templates, and embedding it made the quote fetch above
    // fail outright (lib/itineraries/template-days.ts).
    const plannedDays = templateDaysToItineraryDays(
      template?.itinerary,
      startDate.toISOString().split('T')[0],
      template?.duration_days || 1
    )
    const servicesSnapshot = quote.services_snapshot || []
    const insertedDayIds: string[] = []
    let conversionError: string | null = null

    for (const planned of plannedDays) {
      const dayNum = planned.day_number

      const { data: itinDay, error: dayError } = await supabaseAdmin
        .from('itinerary_days')
        .insert({ itinerary_id: itinerary.id, ...planned })
        .select()
        .single()

      if (dayError || !itinDay) {
        conversionError = dayError?.message || `Failed to create day ${dayNum}`
        break
      }
      insertedDayIds.push(itinDay.id)

      const dayServices = servicesSnapshot.filter((service: any) => {
        if (service.day_number && service.day_number !== dayNum) return false
        if (!service.day_number && dayNum > 1) return false
        return true
      })

      if (dayServices.length > 0) {
        const { error: svcError } = await supabaseAdmin
          .from('itinerary_services')
          // The columns itinerary_services actually has (types/database.types.ts):
          // this insert used to write supplier_cost / margin_percent /
          // selling_price / currency / status — none of which exist — and the
          // write-contract guard never saw it because the payload is built by
          // a map, not an object literal. Third failure in the same route.
          // One row per quote line, per-person lines multiplied by the party
          // (lib/itineraries/template-days.ts — the fifth failure in this route
          // was a $793 itinerary for a $1,317 quote).
          .insert(dayServices.map((service: any) => serviceLineForItinerary(service, {
            dayId: itinDay.id,
            pax: (quote.num_adults || 0) + (quote.num_children || 0),
            marginPercent: quote.margin_percent || 25,
            currency: quote.currency || 'EUR',
          })))
        if (svcError) {
          conversionError = svcError.message
          break
        }
      }
    }

    if (conversionError) {
      // Roll back the partial conversion: services → days → the itinerary itself.
      if (insertedDayIds.length > 0) {
        await supabaseAdmin.from('itinerary_services').delete().in('itinerary_day_id', insertedDayIds)
        await supabaseAdmin.from('itinerary_days').delete().in('id', insertedDayIds)
      }
      await supabaseAdmin.from('itineraries').delete().eq('id', itinerary.id)
      console.error(`Quote ${id} conversion failed; rolled back itinerary ${itinerary.id}:`, conversionError)
      return NextResponse.json(
        { error: 'Failed to convert quote — no changes were saved, please retry' },
        { status: 500 }
      )
    }

    // All inserts succeeded — only NOW mark the quote converted.
    const { error: markError } = await supabaseAdmin
      .from('tour_quotes')
      .update({
        status: 'converted',
        converted_to_itinerary_id: itinerary.id,
        converted_at: new Date().toISOString()
      })
      .eq('id', id)

    if (markError) {
      console.error(`Itinerary ${itinerary.id} created but failed to mark quote ${id} converted:`, markError)
      return NextResponse.json(
        { error: 'Itinerary created but updating the quote status failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        itinerary_id: itinerary.id,
        itinerary_code: itineraryCode,
        quote_number: quote.quote_number,
        message: 'Quote successfully converted to itinerary'
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}