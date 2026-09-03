// ============================================
// POST /api/intake/order-form  { text, dryRun? }
// ============================================
// The tour-up.jp order email → the programme it names, priced for that
// party on that date, as ONE draft quote the operator reviews — plus the
// client, found by email or created. The conversational parser is for
// conversations; this is a form, read label by label
// (lib/intake/tour-up-order.ts).
//
// dryRun answers what WOULD happen and writes nothing. Otherwise: the
// client (if new), a standard variation for the programme (if it has none —
// a quote row must point at one), and the quote. The itinerary, booking and
// documents follow from the quote's own Convert button, unchanged.
import { NextRequest, NextResponse } from 'next/server'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { getOrgDefaultMargin, resolveMarginPercent } from '@/lib/org-default-margin'
import { calculateAutoPricing, calculatePricingWithPassengerBreakdown } from '@/lib/auto-pricing-service'
import { roomingAdjustment } from '@/lib/pricing/rooming'
import { parseTourUpOrder, matchTemplateCode, type TourUpOrder } from '@/lib/intake/tour-up-order'
import { clientMessage } from '@/lib/api-errors'

const supabase = createActorAdminClient()

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
    `【${o.inquiryType || '申込み'}】 ${o.tourCode} ${o.tourTitle}`.trim(),
    `出発日: ${o.departureDate1}${o.departureDate2 ? `（第2希望 ${o.departureDate2}）` : ''}${o.departureAirport ? ` 出発地 ${o.departureAirport}` : ''}`,
    `参加人数: 大人 ${o.adults} 子供 ${o.children}`,
    person(o.lead, '代表者'),
    ...o.companions.map((c, i) => person(c, `同行者${i + 1}`)),
    `連絡: ${o.email}${o.phone ? ` / ${o.phone}` : ''}${o.contactMethod ? ` (${o.contactMethod === 'phone' ? '電話希望' : 'メール希望'})` : ''}`,
    o.postalCode || o.prefecture || o.address ? `住所: 〒${o.postalCode ?? ''} ${o.prefecture ?? ''}${o.address ?? ''}`.trim() : null,
    o.requests ? `ご要望: ${o.requests}` : null,
  ].filter(Boolean)
  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const { text, dryRun = false } = await request.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 })
    }
    const order = parseTourUpOrder(text)
    if (!order) {
      return NextResponse.json({ success: false, error: 'This does not read as the order form (tour code and departure date not found).' }, { status: 422 })
    }
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // The programme the code names.
    const { data: templates } = await supabase
      .from('tour_templates')
      .select('id, template_code, template_name, duration_days, tour_type')
      .eq('is_active', true)
    const template = matchTemplateCode(order.tourCode, (templates ?? []) as { id: string; template_code: string; template_name: string; duration_days: number; tour_type: string | null }[])

    // The client, by the email the customer typed.
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('org_id', orgId)
      .ilike('email', order.email)
      .limit(1)
      .maybeSingle()
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
      priced = order.children > 0
        ? await calculatePricingWithPassengerBreakdown({ ...base, passengers: { numAdults: order.adults, numChildren: order.children, numInfants: 0 } })
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

    const preview = { success: true, dryRun, order, template, client: clientPreview, pricing }
    if (dryRun) return NextResponse.json(preview)
    if (!template) {
      return NextResponse.json({ ...preview, success: false, error: `No programme matches tour code ${order.tourCode}. Add it under Tour Templates (or give the template this code) and read the order again.` }, { status: 422 })
    }
    if (!priced?.success) {
      return NextResponse.json({ ...preview, success: false, error: 'The programme could not be priced; see the pricing notes.' }, { status: 422 })
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
        return NextResponse.json({ ...preview, success: false, error: clientMessage(error, 'Could not create the client') }, { status: 500 })
      }
      clientId = created.id
      clientCreated = true
    }

    // 2. A variation for the programme — a quote row must name one.
    let variationId: string | null = null
    {
      const { data: existing } = await supabase
        .from('tour_variations').select('id').eq('template_id', template.id).eq('tier', 'standard').limit(1).maybeSingle()
      variationId = existing?.id ?? null
      if (!variationId) {
        const { data: made, error } = await supabase.from('tour_variations').insert({
          template_id: template.id,
          variation_code: `${template.template_code}-STANDARD`.toUpperCase().slice(0, 60),
          variation_name: `${template.template_name} - Standard`,
          tier: 'standard', group_type: 'private', min_pax: 1, max_pax: 15, is_active: true,
        }).select('id').single()
        if (error || !made) {
          return NextResponse.json({ ...preview, success: false, error: clientMessage(error, 'Could not create the programme variation') }, { status: 500 })
        }
        variationId = made.id
      }
    }

    // 3. The quote, lines shaped exactly as the calculator saves them.
    type QuoteLine = { service_id: string; service_name: string; service_category: string; rate_type: string; rate_source: string | undefined; quantity_mode: string; quantity: number; unit_cost: number; line_total: number; is_optional: boolean; day_number: number | null; pricing_note: string | undefined }
    const lines: QuoteLine[] = priced.services.map(s => ({
      service_id: s.id, service_name: s.serviceName, service_category: s.serviceType, rate_type: s.serviceType,
      rate_source: s.rateSource, quantity_mode: s.quantityMode, quantity: s.quantity, unit_cost: s.unitCost,
      line_total: s.lineTotal, is_optional: s.isOptional, day_number: s.dayNumber, pricing_note: s.notes,
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
      services_snapshot: lines,
      total_cost: priced.totalCost,
      margin_percent: priced.marginPercent,
      margin_amount: priced.marginAmount,
      selling_price: priced.sellingPrice,
      price_per_person: priced.pricePerPerson,
      currency: priced.currency,
      tour_leader_included: false,
      single_supplement: priced.singleSupplement ?? 0,
      is_eur_passport: false,
      status: 'draft',
      valid_until: validUntil.toISOString().split('T')[0],
      notes: orderNotes(order),
      created_by: await getCurrentUserId(),
    }).select('id, quote_number').single()
    if (qErr || !quote) {
      return NextResponse.json({ ...preview, success: false, error: clientMessage(qErr, 'Could not create the quote') }, { status: 500 })
    }

    return NextResponse.json({ ...preview, client: { id: clientId, name: clientName }, clientCreated, quote })
  } catch (err) {
    console.error('[intake/order-form]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
