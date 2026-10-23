// ============================================
// A template quote → its itinerary
// ============================================
// The half of converting a B2B quote that builds the trip from the programme:
// the client (found or made), the itinerary, its days and service lines, and
// the quote marked converted. Shared by the quote page's Convert button
// (app/api/b2b/quotes/[id]/convert) and the website-order intake, which
// converts a website-priced quote by itself (lib/intake/process-order.ts).
//
// The caller has already proved the quote is the org's, accepted (or made
// accepted by the intake), deliverable, and has no itinerary of its own; this
// only builds. Every failure after the itinerary insert rolls back what was
// made, so the quote can be converted again.
import type { SupabaseClient } from '@supabase/supabase-js'
import { reassertClientId } from '@/lib/itineraries/reassert-client'
import { computeDeposit } from '@/lib/booking-creation'
import { tripVatFromQuote } from '@/lib/vat'
import { allocateClientPrices } from '@/lib/b2b/convert-money'
import { templateDaysToItineraryDays, packageTypeForTemplate, serviceLineForItinerary, type ItineraryServiceRow } from '@/lib/itineraries/template-days'
import { escapeLike } from '@/lib/db/escape-like'
import { isWebsitePriced, WEBSITE_ORDER_SOURCE } from '@/lib/pricing/website-price'
import { newItineraryCode } from '@/lib/itineraries/itinerary-code'

/** The quote as conversion reads it — the variation, its programme and the partner. */
export const QUOTE_FOR_CONVERT_SELECT = `
        *,
        tour_variations (
          id, variation_name, variation_code, tier, group_type, inclusions, exclusions,
          tour_templates (
            id, template_name, template_code, duration_days, duration_nights, cities_covered,
            tour_type, itinerary
          )
        ),
        b2b_partners (id, company_name, partner_code, commission_percent)
      `

export type ConvertResult =
  | { ok: true; itineraryId: string; itineraryCode: string }
  | { ok: false; status: number; error: string }

export async function convertTemplateQuote(
  db: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: { quote: any; orgId: string; userId: string | null; startIso: string; depositPercent: number },
): Promise<ConvertResult> {
  const { quote, orgId, userId, startIso } = opts
  const depositOf = (selling: number | null | undefined) => computeDeposit(Number(selling) || 0, opts.depositPercent).depositAmount
  const template = quote.tour_variations?.tour_templates

  // Create or find client
  let clientId = null
  if (quote.client_email) {
    // Scoped: matching on email alone would attach this quote to another
    // organisation's customer, and clients is org-scoped as of
    // migrations/20260825_clients_org_id.sql.
    // Case-insensitive, and the oldest when there are several: an exact match
    // missed "John@x.com" against "john@x.com" and made a second client, and
    // .maybeSingle() over two rows is an error that read as "not found" and
    // made a third.
    const { data: existingClient } = await db
      .from('clients')
      .select('id')
      .ilike('email', escapeLike(String(quote.client_email).trim()))
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (existingClient) {
      clientId = existingClient.id
    } else {
      const nameParts = (quote.client_name || '').split(' ')
      const { data: newClient, error: clientError } = await db
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

  // The itinerary code: random, as POST /api/itineraries makes it, retried on
  // a clash below. It was "count of ALL itineraries + 1" — across every
  // organisation (printed on this org's documents), and after any delete it
  // re-issued a code already taken, so the UNIQUE insert failed and the
  // quote could not be converted.
  let itineraryCode = newItineraryCode()

  const startDate = new Date(`${String(startIso).slice(0, 10)}T00:00:00Z`)
  const endDate = new Date(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + (template?.duration_days || 1) - 1)

  // Get partner info for the itinerary
  const partnerInfo = quote.b2b_partners as { id: string; company_name: string; partner_code: string; commission_percent: number } | null

  let itinerary: any = null
  let itinError: any = null
  for (let tries = 0; tries < 5; tries++) {
    const attempt = await db
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
        // The premium inside selling_price, as its own figure — the lines
        // below carry the rest (see the share-out further down).
        season_uplift_amount: Number(quote.season_uplift_amount) || 0,
        supplier_cost: quote.total_cost,
        profit: quote.margin_amount,
        margin_percent: quote.margin_percent,
        currency: quote.currency || 'EUR',
        deposit_amount: depositOf(quote.selling_price),
        balance_due: Math.round(((quote.selling_price || 0) - depositOf(quote.selling_price)) * 100) / 100,
        payment_status: 'not_paid',
        user_id: userId, // itineraries has user_id, not created_by
        notes: `Converted from B2B quote ${quote.quote_number}`,
        // B2B Partner fields
        partner_id: quote.partner_id || null,
        partner_commission_percent: partnerInfo?.commission_percent || 0,
        // The quote's VAT choice and recorded rate (lib/vat.ts). Written
        // only when on, so a database without the columns still converts.
        ...(quote.vat_applied === true ? tripVatFromQuote(quote) : {}),
        // A website order's trip stays priced by the website (lib/pricing/website-price).
        source: isWebsitePriced(quote) ? WEBSITE_ORDER_SOURCE : 'b2b_template'
      })
      .select()
      .single()
    itinerary = attempt.data
    itinError = attempt.error
    if (itinError?.code !== '23505') break
    itineraryCode = newItineraryCode()
  }

  if (itinError || !itinerary) {
    // The database's reason must reach the log: this exact insert failed
    // for weeks on an enum value and nothing said so.
    console.error('B2B convert: itinerary insert failed:', itinError)
    return { ok: false, status: 500, error: 'Failed to create itinerary' }
  }
  // Prod drops client_id on INSERT — keep the converted trip on its client.
  await reassertClientId(db, itinerary, clientId)

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

  // Every line first, so the client prices can be shared out over all of
  // them. A trip's client total is its lines plus its season premium, kept
  // on its own (itineraries.season_uplift_amount, lib/itinerary-client-price),
  // so the lines share out the selling price less the premium — the quote's
  // margin (0% stays 0%) and tour leader included — and the premium goes
  // across as the trip's premium (allocateClientPrices, lib/b2b/convert-money).
  const quoteCurrency = quote.currency || 'EUR'
  const premium = Number(quote.season_uplift_amount) || 0
  const linesByDay: ItineraryServiceRow[][] = plannedDays.map((planned) => servicesSnapshot
    .filter((service: any) => {
      if (service.day_number && service.day_number !== planned.day_number) return false
      if (!service.day_number && planned.day_number > 1) return false
      return true
    })
    .map((service: any) => serviceLineForItinerary(service, {
      dayId: '',
      pax: (quote.num_adults || 0) + (quote.num_children || 0),
      marginPercent: quote.margin_percent ?? 0,
      currency: quoteCurrency,
    })))
  const allLines = linesByDay.flat()
  const clientPrices = allocateClientPrices(allLines.map((l) => l.total_cost), (Number(quote.selling_price) || 0) - premium, quoteCurrency)
  allLines.forEach((line, i) => { line.client_price = clientPrices[i] })

  for (const [index, planned] of plannedDays.entries()) {
    const dayNum = planned.day_number

    const { data: itinDay, error: dayError } = await db
      .from('itinerary_days')
      .insert({ itinerary_id: itinerary.id, ...planned })
      .select()
      .single()

    if (dayError || !itinDay) {
      conversionError = dayError?.message || `Failed to create day ${dayNum}`
      break
    }
    insertedDayIds.push(itinDay.id)

    const dayLines = linesByDay[index]
    if (dayLines.length > 0) {
      const { error: svcError } = await db
        .from('itinerary_services')
        // The columns itinerary_services actually has (types/database.types.ts):
        // this insert used to write supplier_cost / margin_percent /
        // selling_price / currency / status — none of which exist — and the
        // write-contract guard never saw it because the payload is built by
        // a map, not an object literal. Third failure in the same route.
        // One row per quote line, per-person lines multiplied by the party
        // (lib/itineraries/template-days.ts — the fifth failure in this route
        // was a $793 itinerary for a $1,317 quote).
        .insert(dayLines.map((line) => ({ ...line, itinerary_day_id: itinDay.id })))
      if (svcError) {
        conversionError = svcError.message
        break
      }
    }
  }

  if (conversionError) {
    // Roll back the partial conversion: services → days → the itinerary itself.
    if (insertedDayIds.length > 0) {
      await db.from('itinerary_services').delete().in('itinerary_day_id', insertedDayIds)
      await db.from('itinerary_days').delete().in('id', insertedDayIds)
    }
    await db.from('itineraries').delete().eq('id', itinerary.id)
    console.error(`Quote ${quote.id} conversion failed; rolled back itinerary ${itinerary.id}:`, conversionError)
    return { ok: false, status: 500, error: 'Failed to convert quote — no changes were saved, please retry' }
  }

  // All inserts succeeded — only NOW mark the quote converted.
  const { error: markError } = await db
    .from('tour_quotes')
    .update({
      status: 'converted',
      converted_to_itinerary_id: itinerary.id,
      converted_at: new Date().toISOString()
    })
    .eq('id', quote.id)

  if (markError) {
    console.error(`Itinerary ${itinerary.id} created but failed to mark quote ${quote.id} converted:`, markError)
    return { ok: false, status: 500, error: 'Itinerary created but updating the quote status failed' }
  }

  return { ok: true, itineraryId: itinerary.id, itineraryCode }
}
