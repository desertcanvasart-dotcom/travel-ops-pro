// ============================================
// A parsed order → the client, the variation, ONE draft quote
// ============================================
// The write half of the order intake, shared by every door an order can
// come through: the operator's paste page (/intake/order → the authed
// /api/intake/order-form route), the customer's own hosted form
// (/order → the public /api/public/order-form route), and the website's
// order emails, taken from the synced inbox by the scheduled Gmail sync
// (lib/intake/web-order-intake.ts). One implementation so every door creates
// exactly the same rows; only what each door tells its caller differs (the
// operator sees the priced preview, the customer never sees cost or margin —
// that sanitisation lives in the public route).
//
// dryRun answers what WOULD happen and writes nothing. Otherwise: the
// client (if new), a standard variation for the programme (if it has none —
// a quote row must point at one), the quote, and — when the office runs the
// programme as a departure on that date — a pending seat hold on it. The
// itinerary, booking and documents follow from the quote's own Convert
// button, unchanged.
//
// When the order carries the website's fare, the quote is held in yen at that
// fare — final, the office does not quote it — and the engine's run becomes
// its cost estimate (lib/pricing/website-price). And when the customer
// applied (申込み), that quote is converted to the itinerary at once: the
// office starts from the trip, the quote stays behind it as the record.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isBookableLine } from '@/lib/pricing/breakdown-order'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { getOrgDefaultMargin, resolveMarginPercent } from '@/lib/org-default-margin'
import { calculateAutoPricing, calculatePricingWithPassengerBreakdown } from '@/lib/auto-pricing-service'
import { roomingAdjustment } from '@/lib/pricing/rooming'
import { matchProgramme, isApplicationOrder, type TourUpOrder } from '@/lib/intake/tour-up-order'
import { clientMessage } from '@/lib/api-errors'
import { createInitialQuoteRevision } from '@/lib/quotes/initial-revision'
import { isBookableStatus, seatsFree } from '@/lib/departures/seats'
import { getExchangeRate } from '@/lib/currency-service'
import { fetchRunExchangeRates } from '@/lib/rates/fx-source'
import { snapshotPaidFields } from '@/lib/paid-currency'
import { WEBSITE_PRICE_CURRENCY, WEBSITE_ORDER_SOURCE, isWebsitePriced, websiteOrderPriceJpy, linesInWebsiteCurrency, websitePricedTotals } from '@/lib/pricing/website-price'
import { convertTemplateQuote, QUOTE_FOR_CONVERT_SELECT } from '@/lib/b2b/convert-template-quote'
import { paymentRuleFrom } from '@/lib/payment-schedule'

// The seat rule lives in lib/departures/seats.ts; re-exported for the callers
// and tests that have always imported it from here.
export { seatsFree }

/** The order, written down for the quote's notes — everything the 日程表,
 *  contract and passenger list will need and the quote row has no column for. */
export function orderNotes(o: TourUpOrder): string {
  const person = (p: TourUpOrder['lead'], label: string) => {
    const bits = [
      `${p.lastNameRomaji} ${p.firstNameRomaji}`.trim(),
      p.lastNameKanji || p.firstNameKanji ? `${p.lastNameKanji ?? ''} ${p.firstNameKanji ?? ''}`.trim() : null,
      p.lastNameKana || p.firstNameKana ? `${p.lastNameKana ?? ''} ${p.firstNameKana ?? ''}`.trim() : null,
      p.gender === 'female' ? '女' : p.gender === 'male' ? '男' : null,
      p.birthDate ? `生年月日 ${p.birthDate}` : null,
    ].filter(Boolean)
    return `${label}: ${bits.join(' / ')}`
  }
  const lines = [
    `【${o.inquiryType || '申込み'}】 ${o.productKind === 'optional' ? '[オプショナルツアー] ' : ''}${o.tourCode} ${o.tourTitle}`.trim(),
    o.websiteUrl ? `ウェブページ: ${o.websiteUrl}` : null,
    `${o.productKind === 'optional' ? '利用日' : '出発日'}: ${o.departureDate1}${o.departureDate2 ? `（第2希望 ${o.departureDate2}）` : ''}${o.departureAirport ? ` 出発地 ${o.departureAirport}` : ''}`,
    `参加人数: 大人 ${o.adults} 子供 ${o.children}${o.infants ? ` 幼児 ${o.infants}` : ''}`,
    // What the website told the customer — theirs, to check against ours.
    o.websiteSubtotalJpy ? `ウェブ表示の小計: ¥${o.websiteSubtotalJpy.toLocaleString('en-US')}` : null,
    o.priceNotes ? `料金備考: ${o.priceNotes}` : null,
    person(o.lead, '代表者'),
    ...o.companions.map((c, i) => person(c, `同行者${i + 1}`)),
    `連絡: ${o.email}${o.phone ? ` / ${o.phone}` : ''}${o.contactMethod ? ` (${o.contactMethod === 'phone' ? '電話希望' : 'メール希望'})` : ''}`,
    o.postalCode || o.prefecture || o.address ? `住所: 〒${o.postalCode ?? ''} ${o.prefecture ?? ''}${o.address ?? ''}`.trim() : null,
    o.requests ? `ご要望: ${o.requests}` : null,
  ].filter(Boolean)
  return lines.join('\n')
}

export interface ProcessOrderResult {
  /** HTTP status the door should answer with (200, 422, 500). */
  status: number
  /** The full body the OPERATOR door returns as-is. Carries success, dryRun,
   *  order, template (+ matchedBy), client, pricing, departure, and after a
   *  write clientCreated + quote + departureBooking.
   *  The public door must NOT return this to the customer — it picks out what
   *  is safe (see /api/public/order-form). */
  body: Record<string, unknown> & {
    success: boolean
    error?: string
    quote?: { id: string; quote_number: string }
    clientCreated?: boolean
    departureBooking?: { id: string; departure_id: string } | null
    /** Set when the party did not fit the seats left, so no hold was placed. */
    departureFull?: { free: number; requested: number } | null
  }
}

export async function processTourUpOrder(
  supabase: SupabaseClient,
  opts: { orgId: string; userId: string | null; order: TourUpOrder; dryRun: boolean }
): Promise<ProcessOrderResult> {
  const { orgId, userId, order, dryRun } = opts

  // The programme: the website page it was ordered from, else the code —
  // among the intake's company's programmes only (tour_templates.org_id,
  // 20261207; both companies may hold the same code).
  const { data: templates } = await supabase
    .from('tour_templates')
    .select('id, template_code, template_name, duration_days, tour_type, website_url')
    .eq('org_id', orgId)
    .eq('is_active', true)
  type Tpl = { id: string; template_code: string; template_name: string; duration_days: number; tour_type: string | null; website_url?: string | null }
  const { template: matched, matchedBy } = matchProgramme(order, (templates ?? []) as Tpl[])
  const template = matched ? { id: matched.id, template_code: matched.template_code, template_name: matched.template_name, duration_days: matched.duration_days, tour_type: matched.tour_type } : null

  // The client, by the email the customer typed (none typed: none found —
  // an empty pattern would match every client stored without an email).
  const { data: existingClient } = order.email
    ? await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('org_id', orgId)
      // Escaped: `_` (and `%`) are legal in an address but LIKE wildcards —
      // unescaped, "j_hn@x.com" attached the order to john@x.com's record.
      .ilike('email', order.email.replace(/[\\%_]/g, ch => `\\${ch}`))
      .limit(1)
      .maybeSingle()
    : { data: null }

  // The programme's departure on that date, if the office runs it as one
  // (the departures grid): the order holds seats on it.
  const found = template ? await findDeparture(supabase, orgId, template.id, order.departureDate1) : null
  // Seats still free on it — the hold below is only placed when the party fits.
  const departure = found ? { ...found, seats_free: await departureSeatsFree(supabase, orgId, found) } : null
  const clientPreview = existingClient
    ? { id: existingClient.id, name: `${existingClient.last_name ?? ''} ${existingClient.first_name ?? ''}`.trim() }
    : null

  // Priced the way the calculator prices it: standard tier, Japanese guide,
  // non-EU passport, the organisation's margin and rate currency.
  let pricing: Record<string, unknown> | null = null
  let priced: Awaited<ReturnType<typeof calculateAutoPricing>> | null = null
  const numPax = Math.max(1, order.adults + order.children)
  if (template) {
    const rateCurrency = await getOrgRateCurrency(supabase, orgId)
    const marginPercent = resolveMarginPercent({ requested: null, orgDefault: await getOrgDefaultMargin(supabase, orgId) })
    const base = {
      orgId, rateCurrency, travelDate: order.departureDate1, templateId: template.id,
      tier: 'standard' as const, numPax, isEurPassport: false, language: 'Japanese',
      marginPercent, mealPlan: 'lunch_only' as const,
      includeAccommodation: (template.duration_days || 1) > 1, tourLeaderIncluded: false,
    }
    priced = order.children > 0 || (order.infants ?? 0) > 0
      ? await calculatePricingWithPassengerBreakdown({ ...base, passengers: { numAdults: order.adults, numChildren: order.children, numInfants: order.infants ?? 0 } })
      : await calculateAutoPricing(base)
    if (priced.success) {
      pricing = {
        total_cost: priced.totalCost, selling_price: priced.sellingPrice, price_per_person: priced.pricePerPerson,
        margin_percent: priced.marginPercent, margin_amount: priced.marginAmount, currency: priced.currency,
        complete: priced.complete, holes: (priced.holes ?? []).map(h => ({ kind: h.kind, message: h.message })),
        warnings: priced.warnings ?? [],
      }
    } else {
      pricing = { total_cost: 0, selling_price: 0, price_per_person: 0, margin_percent: marginPercent, margin_amount: 0, currency: rateCurrency, complete: false, holes: [], warnings: priced.warnings ?? ['Pricing failed'] }
    }
  }

  const preview = { success: true, dryRun, order, template, matchedBy, client: clientPreview, pricing, departure }
  if (dryRun) return { status: 200, body: preview }
  if (!template) {
    return { status: 422, body: { ...preview, success: false, error: `No programme matches tour code ${order.tourCode}. Add it under Tour Templates (or give the template this code) and read the order again.` } }
  }
  if (!priced?.success) {
    return { status: 422, body: { ...preview, success: false, error: 'The programme could not be priced; see the pricing notes.' } }
  }

  // 1. The client.
  let clientId = existingClient?.id ?? null
  let clientCreated = false
  if (!clientId) {
    const { data: created, error } = await supabase.from('clients').insert({
      org_id: orgId,
      first_name: order.lead.firstNameKanji || order.lead.firstNameRomaji || order.lead.lastNameRomaji,
      last_name: order.lead.lastNameKanji || order.lead.lastNameRomaji,
      email: order.email || null,
      phone: order.phone || null,
      nationality: 'Japanese',
      passport_type: 'other',
      preferred_language: 'Japanese',
      preferred_contact_method: order.contactMethod ?? 'email',
      date_of_birth: order.lead.birthDate ?? null,
      country: 'Japan',
      postal_code: order.postalCode ?? null,
      address_line1: [order.prefecture, order.address].filter(Boolean).join('') || null,
      status: 'prospect',
      client_type: 'individual',
      client_source: 'web_form',
      lead_source: 'tour-up.jp',
      internal_notes: [
        order.lead.lastNameKana || order.lead.firstNameKana ? `カナ: ${order.lead.lastNameKana ?? ''} ${order.lead.firstNameKana ?? ''}`.trim() : null,
        `ローマ字: ${order.lead.lastNameRomaji} ${order.lead.firstNameRomaji}`.trim(),
      ].filter(Boolean).join('\n') || null,
    }).select('id').single()
    if (error || !created) {
      return { status: 500, body: { ...preview, success: false, error: clientMessage(error, 'Could not create the client') } }
    }
    clientId = created.id
    clientCreated = true
  }

  // 2. A variation for the programme — a quote row must name one.
  let variationId: string | null = null
  {
    const { data: existing } = await supabase
      .from('tour_variations').select('id').eq('org_id', orgId).eq('template_id', template.id).eq('tier', 'standard').limit(1).maybeSingle()
    variationId = existing?.id ?? null
    if (!variationId) {
      const { data: made, error } = await supabase.from('tour_variations').insert({
        org_id: orgId,
        template_id: template.id,
        variation_code: `${template.template_code}-STANDARD`.toUpperCase().slice(0, 60),
        variation_name: `${template.template_name} - Standard`,
        tier: 'standard', group_type: 'private', min_pax: 1, max_pax: 15, is_active: true,
        // text[] NOT NULL with no default: left out, every order for a
        // programme with no standard variation yet failed here.
        inclusions: [], exclusions: [],
      }).select('id').single()
      if (error || !made) {
        return { status: 500, body: { ...preview, success: false, error: clientMessage(error, 'Could not create the programme variation') } }
      }
      variationId = made.id
    }
  }

  // 3. The quote, lines shaped exactly as the calculator saves them.
  type QuoteLine = { service_id: string; service_name: string; service_category: string; rate_type: string; rate_source: string | undefined; quantity_mode: string; quantity: number; unit_cost: number; line_total: number; is_optional: boolean; day_number: number | null; pricing_note: string | undefined; unpriced?: boolean; issue?: string; paid_currency?: string; paid_fx?: number }
  // Only real services travel into the quote: included meals and unmatched
  // sightseeing notes are breakdown-only (lib/pricing/breakdown-order).
  const lines: QuoteLine[] = priced.services.filter(isBookableLine).map(s => ({
    service_id: s.id, service_name: s.serviceName, service_category: s.serviceType, rate_type: s.serviceType,
    rate_source: s.rateSource, quantity_mode: s.quantityMode, quantity: s.quantity, unit_cost: s.unitCost,
    line_total: s.lineTotal, is_optional: s.isOptional, day_number: s.dayNumber, pricing_note: s.notes,
    // The saved record of what could not be priced (lib/pricing/quote-completeness).
    ...(s.unpriced ? { unpriced: true, issue: s.issue } : {}),
    // What the supplier is paid in, for the trip made from this quote (lib/paid-currency).
    ...snapshotPaidFields(s.enteredCurrency, s.enteredFx),
  }))
  const rooming = roomingAdjustment(numPax, priced.accommodationNights ?? [])
  if (rooming !== 0) {
    lines.push({
      service_id: 'rooming-adjustment',
      service_name: rooming > 0 ? 'Single supplement (solo traveller)' : 'Triple reduction (three sharing)',
      service_category: 'accommodation', rate_type: 'accommodation',
      rate_source: rooming > 0 ? 'single_supplement' : 'triple_reduction',
      quantity_mode: 'fixed', quantity: 1, unit_cost: rooming, line_total: rooming, is_optional: false, day_number: null,
      pricing_note: rooming > 0 ? 'Room of one' : 'Room of three',
    })
  }
  // The website's fare, when it can be read and the cost converted to yen.
  // Neither: the quote is priced the old way, in the rate currency.
  const websitePrice = websiteOrderPriceJpy(order)
  let money: { lines: QuoteLine[]; selling_price: number; total_cost: number; margin_amount: number; margin_percent: number; price_per_person: number; single_supplement: number; currency: string } = {
    lines, selling_price: priced.sellingPrice, total_cost: priced.totalCost, margin_amount: priced.marginAmount,
    margin_percent: priced.marginPercent, price_per_person: priced.pricePerPerson, single_supplement: priced.singleSupplement ?? 0, currency: priced.currency,
  }
  if (websitePrice) {
    const rate = priced.currency === WEBSITE_PRICE_CURRENCY ? 1 : await rateToYen(priced.currency)
    if (rate) {
      money = {
        lines: linesInWebsiteCurrency(lines, priced.currency, rate),
        ...websitePricedTotals({ priceJpy: websitePrice, costInRateCurrency: priced.totalCost, singleSupplementInRateCurrency: priced.singleSupplement ?? 0, rate, pax: numPax }),
      }
    } else {
      console.warn(`[intake] no ${priced.currency}→${WEBSITE_PRICE_CURRENCY} rate; ${order.tourCode} quoted in ${priced.currency}`)
    }
  }
  const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + 30)
  const clientName = `${order.lead.lastNameKanji ?? order.lead.lastNameRomaji} ${order.lead.firstNameKanji ?? order.lead.firstNameRomaji}`.trim()
  const { data: quote, error: qErr } = await supabase.from('tour_quotes').insert({
    org_id: orgId,
    variation_id: variationId,
    trip_name: template.template_name,
    source: 'web_form',
    client_name: clientName,
    client_email: order.email || null,
    client_phone: order.phone || null,
    client_nationality: 'Japanese',
    travel_date: order.departureDate1,
    num_adults: order.adults,
    num_children: order.children,
    services_snapshot: money.lines,
    total_cost: money.total_cost,
    margin_percent: money.margin_percent,
    margin_amount: money.margin_amount,
    selling_price: money.selling_price,
    price_per_person: money.price_per_person,
    currency: money.currency,
    tour_leader_included: false,
    single_supplement: money.single_supplement,
    is_eur_passport: false,
    status: 'draft',
    valid_until: validUntil.toISOString().split('T')[0],
    notes: orderNotes(order),
    created_by: userId,
  }).select('id, quote_number').single()
  if (qErr || !quote) {
    return { status: 500, body: { ...preview, success: false, error: clientMessage(qErr, 'Could not create the quote') } }
  }
  // Version 1 of its history, as for a quote saved from the calculator — by
  // the operator who confirmed it, or nobody for the website's own doors.
  await createInitialQuoteRevision(supabase, quote.id, userId)

  // 4. Seats held on the date's departure, pending until the office confirms.
  // Never fails the order: the quote is the record, the hold a convenience.
  // A party larger than the seats left gets no hold (the departure was held
  // past max_pax before), and the result says so for the office to sort out.
  // The count and the insert are ONE database call under the departure's row
  // lock (hold_departure_seats, migrations 20261213 and 20261215): counted
  // here and inserted after, two orders for the last seats at the same
  // moment were both held. Only an Open, Limited or Guaranteed date takes a
  // hold; the office confirms or releases it on the departure's page.
  let departureBooking: { id: string; departure_id: string } | null = null
  let departureFull: { free: number; requested: number } | null = null
  if (departure) {
    const { data: hold, error: holdErr } = await supabase.rpc('hold_departure_seats', {
      p_org_id: orgId,
      p_departure_id: departure.id,
      p_pax: numPax,
      p_client_id: clientId,
      p_client_name: clientName,
      p_notes: `ウェブ注文 ${quote.quote_number}${order.infants ? `（幼児 ${order.infants}名 別）` : ''}`,
    })
    const result = hold as { held?: boolean; free?: number; id?: string | null } | null
    if (holdErr || !result) console.error('[intake] departure hold failed:', holdErr ?? 'no answer')
    else if (result.held && result.id) {
      departureBooking = { id: result.id, departure_id: departure.id }
      // The hold follows its quote: rejecting or deleting the quote releases
      // it (migration 20261215). Best-effort — the hold stands either way.
      const { error: linkErr } = await supabase
        .from('departure_bookings')
        .update({ quote_id: quote.id })
        .eq('id', result.id)
        .eq('org_id', orgId)
      if (linkErr) console.error('[intake] could not link the hold to its quote:', linkErr.message)
    }
    else departureFull = { free: Number(result.free) || 0, requested: numPax }
  }

  // 5. An application at the website's price is a trip now — no quote step
  // for the office. Never fails the order: the quote stands, and its Convert
  // button still works if this did not.
  const itinerary = isWebsitePriced({ source: WEBSITE_ORDER_SOURCE, currency: money.currency }) && isApplicationOrder(order)
    ? await convertToItinerary(supabase, { quoteId: quote.id, orgId, userId, startIso: order.departureDate1 })
    : null

  return { status: 200, body: { ...preview, client: { id: clientId, name: clientName }, clientCreated, quote: quote as { id: string; quote_number: string }, departureBooking, departureFull, itinerary } }
}

/** Seats left on the departure (lib/departures/seats: booked_pax, which the
 *  office enters on the departure page for bookings made outside the app,
 *  plus confirmed and pending holds). A date that is not Open, Limited or
 *  Guaranteed has none: hold_departure_seats refuses it. */
async function departureSeatsFree(
  supabase: SupabaseClient, orgId: string, departure: { id: string; status: string; max_pax: number; booked_pax: number },
): Promise<number> {
  if (!isBookableStatus(departure.status)) return 0
  const { data } = await supabase
    .from('departure_bookings')
    .select('pax, status')
    .eq('org_id', orgId)
    .eq('departure_id', departure.id)
    .in('status', ['pending', 'confirmed'])
  return seatsFree(departure, (data ?? []) as Array<{ pax: number | null; status: string | null }>)
}

/** The programme's departure starting on the date — not cancelled; the
 *  first if the office loaded more than one. */
async function findDeparture(
  supabase: SupabaseClient, orgId: string, templateId: string, date: string,
): Promise<{ id: string; start_date: string; status: string; max_pax: number; booked_pax: number } | null> {
  const { data } = await supabase
    .from('tour_departures')
    .select('id, start_date, status, max_pax, booked_pax')
    .eq('org_id', orgId)
    .eq('template_id', templateId)
    .eq('start_date', date)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })
    .limit(1)
  return ((data ?? [])[0] as { id: string; start_date: string; status: string; max_pax: number; booked_pax: number } | undefined) ?? null
}

/** Today's rate from the rate currency to yen, as pricing runs read it; null
 *  when there is none (never guessed). */
async function rateToYen(from: string): Promise<number | null> {
  try {
    const rate = getExchangeRate(from, WEBSITE_PRICE_CURRENCY, await fetchRunExchangeRates())
    return rate && rate > 0 ? rate : null
  } catch {
    return null
  }
}

/** The website-priced quote, converted as the quote page's Convert button
 *  does it (lib/b2b/convert-template-quote), with the org's payment rule. */
async function convertToItinerary(
  supabase: SupabaseClient, opts: { quoteId: string; orgId: string; userId: string | null; startIso: string },
): Promise<{ id: string; code: string } | null> {
  try {
    const { data: quote, error } = await supabase.from('tour_quotes').select(QUOTE_FOR_CONVERT_SELECT).eq('id', opts.quoteId).eq('org_id', opts.orgId).single()
    if (error || !quote) {
      console.error('[intake] quote for conversion not read:', error)
      return null
    }
    const { data: terms } = await supabase.from('organizations')
      .select('deposit_percent, deposit_due_days, balance_due_days_before_departure').eq('id', opts.orgId).maybeSingle()
    const made = await convertTemplateQuote(supabase, {
      quote, orgId: opts.orgId, userId: opts.userId, startIso: opts.startIso,
      depositPercent: paymentRuleFrom(terms).deposit_percent,
    })
    if (!made.ok) {
      console.error('[intake] conversion failed:', made.error)
      return null
    }
    return { id: made.itineraryId, code: made.itineraryCode }
  } catch (e) {
    console.error('[intake] conversion threw:', e)
    return null
  }
}
