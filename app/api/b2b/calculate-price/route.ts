import { createClient } from '@supabase/supabase-js'
import { vehicleKeyLabel, vehicleRateForPax } from '@/lib/rates/vehicle-bands'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getTieredActivityRate, applyActivityTiers } from '@/lib/rates/activity-tiers'
import { makeDayTourVehicleFinder } from '@/lib/rates/day-tour-vehicle'
import { calculateAutoPricing, calculatePricingWithPassengerBreakdown, ServiceTier, CHILD_DISCOUNT_PERCENT, loadSeasonWindows, buildEntranceFeeCache, getGuideRate } from '@/lib/auto-pricing-service'
import { priceEntranceLine, priceMealLine } from '@/lib/b2b/variation-service-rates'
import { guideLanguageWord } from '@/lib/guides/guide-language'
import { computeUplift, seasonForDate } from '@/lib/pricing/season-uplift'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { createRateNormalizer } from '@/lib/rates/rate-currency'
import { currencySymbol } from '@/lib/currency-totals'
import { getOrgDefaultMargin } from '@/lib/org-default-margin'
import { quoteMarginPercent, partnerOverrideOn } from '@/lib/b2b/partner-margin'
import { belowMinPaxMessage } from '@/lib/tours/min-pax'
import { pickPackage, firstSailing } from '@/lib/pricing/cruise-package'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { quoteRefsInOrg, quoteRefNotFound } from '@/lib/b2b/quote-scope'
import { parseOptionalSelection, isOptionalSelected } from '@/lib/b2b/optional-selection'
// Catalogue extras chosen at QUOTE time — same rule as options: cost + margin,
// or the operator's set price as-is. Ported from autoura-saas.
import { roomingAdjustment } from '@/lib/pricing/rooming'
import { priceExtras, type CatalogueExtra, type ExtraSelection, type ExtrasPricing, type MoneyBlock } from '@/lib/pricing/extras-pricing'
import {
  serviceQuantity,
  optionalContribution,
  composeQuoteTotals,
  type OptionalContribution,
} from '@/lib/b2b/optional-pricing'

// ============================================
// B2B TOUR PRICE CALCULATOR - v6
// File: app/api/b2b/calculate-price/route.ts
// 
// UPDATES in v6:
// - Added tour_leader_included parameter
// - Returns single_supplement in response
// - Returns pax_pricing_table for rate sheet generation
//
// NOW WITH AUTO-PRICING FALLBACK:
// If tour_variation_services is empty, uses auto-pricing
// from tour_templates.itinerary (via auto-pricing-service.ts)
//
// B2C RATE TABLES (the caller's company's rows — every rate table has org_id):
// - vehicles, guides, entrance_fees, hotel_contacts, meal_rates, nile_cruises
// 
// B2B-SPECIFIC TABLES:
// - b2b_transport_packages, b2b_partners, b2b_partner_pricing
// (tiered activity pricing moved to activity_rates.tiers — b2b_pricing_rules
//  was empty in production since launch and is no longer read)
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface CalculatedService {
  service_id: string
  service_name: string
  service_category: string
  rate_type: string | null
  rate_source: string
  quantity_mode: string
  quantity: number
  unit_cost: number
  line_total: number
  is_optional: boolean
  /** For optional lines: is the customer buying this one? */
  is_selected?: boolean
  /** For optional lines: what the CUSTOMER pays, which is the operator's own
   *  price when they set one — options are priced off-margin. */
  selling_price?: number
  price_basis?: 'operator_price' | 'cost_plus_margin'
  day_number: number | null
  pricing_note?: string
  /** No usable rate: listed in its place at 0 (the gap is also a hole). */
  unpriced?: boolean
  /** Already paid for inside another line — shown so the day reads whole. */
  included?: boolean
  /** Why the line is unpriced, included, or unmatched. */
  issue?: string
  /** The hotel or ship a night line is for. */
  property_name?: string
}

interface PriceCalculationResult {
  variation_id: string
  variation_name: string
  template_name: string
  num_pax: number
  num_adults?: number        // NEW: Passenger breakdown
  num_children?: number      // NEW: Ages 4-12 (50% discount)
  num_infants?: number       // NEW: Ages 0-3 (FREE except flights)
  travel_date: string
  is_eur_passport: boolean
  tour_leader_included: boolean
  services: CalculatedService[]
  optional_services: CalculatedService[]
  subtotal_cost: number
  optional_total: number
  total_cost: number
  tour_leader_cost: number
  margin_percent: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  single_supplement: number
  currency: string
  // What the trip costs on an ordinary date, and the operator's own premium for
  // this departure. selling_price and price_per_person already INCLUDE the
  // premium — these two are here so a quote can show why they differ.
  base_selling_price?: number
  season_uplift?: {
    season_name: string
    percent: number
    amount: number
    base: number
  } | null
  pax_pricing_table?: any[]
  // NEW: Age-based pricing breakdown
  age_based_pricing?: {
    adult_rate: number
    child_rate: number
    infant_rate: number
    adults_subtotal: number
    children_subtotal: number
    infants_subtotal: number
    child_discount_percent: number
    breakdown: {
      category: string
      count: number
      rate: number
      subtotal: number
      note: string
    }[]
  }
  // Completeness from the hardened core (consolidation Phase D): a rate sheet is
  // deliverable only when complete; holes are surfaced, never fabricated away.
  complete?: boolean
  holes?: { kind: string; message: string }[]
  /** Engine warnings (unmatched attractions, skipped guides, …). */
  warnings?: string[]
}

// The partner's own margins: its default, and its override for this
// variation (an active b2b_partner_pricing row valid on the travel date — its
// valid_from/valid_to were never read, so an expired override still priced).
// The caller has checked the partner is this org's.
async function loadPartnerMargins(orgId: string, partnerId: string, variationId: string | null | undefined, travelDate: string) {
  const { data: partner } = await supabaseAdmin
    .from('b2b_partners')
    .select('default_margin_percent')
    .eq('id', partnerId)
    .eq('org_id', orgId)
    .maybeSingle()
  let override: unknown = null
  if (variationId) {
    const { data } = await supabaseAdmin
      .from('b2b_partner_pricing')
      .select('id, margin_percent_override, valid_from, valid_to')
      .eq('partner_id', partnerId)
      .eq('variation_id', variationId)
      .eq('is_active', true)
    override = partnerOverrideOn(data ?? [], travelDate)?.margin_percent_override ?? null
  }
  return { default: partner?.default_margin_percent ?? null, override }
}

// Catalogue extras chosen for this quote. Only ACTIVE rows of this org come
// back; a withdrawn or foreign id is therefore a hole downstream, never a sale.
// A row entered in another currency (rate_currency) is converted into the run
// currency here, at the fetch boundary, like every other rate table — an EGP
// fast-track must not join a USD total as if it were dollars. `select('*')`
// on purpose: the column arrives by migration and the route must keep working
// on a database that has not run it yet.
async function loadExtras(orgId: string | null | undefined, ids: string[], runCurrency: string): Promise<CatalogueExtra[]> {
  if (!orgId || ids.length === 0) return []
  const { data, error } = await supabaseAdmin
    .from('extras_catalogue')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('id', ids)
  if (error) {
    console.error('Error loading extras_catalogue:', error)
    return []
  }
  const normalizer = createRateNormalizer(runCurrency)
  const rows = await normalizer.normalize('extras_catalogue', (data || []) as Record<string, unknown>[])
  for (const miss of normalizer.misses) {
    console.warn(`[calculate-price] extra ${miss.id} is in ${miss.currency} and could not be converted — treated as unpriced`)
  }
  return (rows || []) as unknown as CatalogueExtra[]
}

// Fold priced extras into a FINISHED result, so both engine branches treat
// them identically. The result's selling price already carries the seasonal
// demand premium, and that premium "is about the DATE, taken on the whole
// trip" (lib/b2b/optional-pricing) — so it is applied to the extras too,
// pinned price included, and season_uplift grows by exactly that amount.
// Lines join services (and so services_snapshot); any hole makes the quote
// incomplete; the rate sheet is re-totalled at every pax count.
function foldExtras(
  result: PriceCalculationResult,
  catalogue: CatalogueExtra[],
  selections: ExtraSelection[]
): PriceCalculationResult {
  if (selections.length === 0) return result
  const m = result.margin_percent
  const upliftPct = result.season_uplift?.percent ?? 0
  const r2 = (n: number) => Math.round(n * 100) / 100

  // What the extras add BEFORE the premium: cost-only lines at the quote's
  // margin, pinned lines at their price.
  const preUplift = (p: ExtrasPricing) => p.margined_cost * (1 + m / 100) + p.pinned_sell
  const fold = (b: MoneyBlock, pax: number, p: ExtrasPricing): MoneyBlock => {
    const delta = preUplift(p)
    const sellingPrice = b.sellingPrice + delta * (1 + upliftPct / 100)
    return {
      totalCost: r2(b.totalCost + p.cost_total),
      marginAmount: r2(b.marginAmount + p.margined_cost * (m / 100) + p.pinned_margin),
      sellingPrice: r2(sellingPrice),
      pricePerPerson: r2(sellingPrice / Math.max(1, pax)),
    }
  }

  const p = priceExtras(catalogue, selections, result.num_pax)
  const top = fold(
    { totalCost: result.total_cost, marginAmount: result.margin_amount, sellingPrice: result.selling_price, pricePerPerson: result.price_per_person },
    result.num_pax, p
  )
  const delta = preUplift(p)

  type PaxBlock = (MoneyBlock & Record<string, unknown>) | undefined
  const pax_pricing_table = result.pax_pricing_table?.map((row) => {
    const rp = priceExtras(catalogue, selections, row.numPax)
    const f = (b: PaxBlock) => (b ? { ...b, ...fold(b, row.numPax, rp) } : b)
    return { ...row, withoutLeader: f(row.withoutLeader), withLeader: f(row.withLeader) }
  })

  const holes = [...(result.holes ?? []), ...p.holes]
  return {
    ...result,
    services: [...result.services, ...p.lines],
    subtotal_cost: r2(result.subtotal_cost + p.cost_total),
    total_cost: top.totalCost,
    margin_amount: top.marginAmount,
    selling_price: top.sellingPrice,
    price_per_person: top.pricePerPerson,
    base_selling_price: result.base_selling_price != null ? r2(result.base_selling_price + delta) : result.base_selling_price,
    season_uplift: result.season_uplift
      ? { ...result.season_uplift, amount: r2(result.season_uplift.amount + delta * (upliftPct / 100)), base: r2(result.season_uplift.base + delta) }
      : result.season_uplift,
    pax_pricing_table,
    holes,
    complete: (result.complete ?? true) && holes.length === 0,
  }
}

// Get transport package for cruise sightseeing (kept for package deals) —
// the org's own (b2b_transport_packages.org_id): this priced with whichever
// company's package came first. No org, no package.
// It read Luxor→Aswan only, any length, `.limit(1)` in no order, and added the
// package's own number to the total whatever currency it was in. Now: the
// sailing's length (sightseeing) and route, the engine's fixed pick
// (lib/pricing/cruise-package), converted into the run currency — a package
// that cannot be converted is neutralised and the line falls through.
async function getTransportPackage(
  orgId: string | null,
  packageType: string,
  want: { durationDays?: number | null; route?: string[] },
  runCurrency: string,
): Promise<any | null> {
  if (!orgId) return null
  const { data, error } = await supabaseAdmin
    .from('b2b_transport_packages')
    .select('*')
    .eq('org_id', orgId)
    .eq('package_type', packageType)
    .eq('is_active', true)

  if (error || !data || data.length === 0) return null
  const rows = await createRateNormalizer(runCurrency).normalize('b2b_transport_packages', data as Record<string, unknown>[])
  return pickPackage(rows as any[], { type: packageType, ...want })
}

// The sailing a variation's own service list is priced for: its template's
// first run of cruise days (length nights + 1, route from the days' cities),
// else the tour's length with no route to check.
async function legacySailing(orgId: string | null, templateId: string | null | undefined, tourDays: number) {
  if (!orgId || !templateId) return firstSailing(null, tourDays)
  const { data } = await supabaseAdmin
    .from('tour_templates')
    .select('itinerary')
    .eq('id', templateId)
    .eq('org_id', orgId)
    .maybeSingle()
  return firstSailing((data as { itinerary?: unknown } | null)?.itinerary, tourDays)
}

// Select vehicle from transport package based on group size. A vehicle with no
// rate is one the operator does not run — skipped, the next size up takes the
// group. Returns null (caller keeps the line's existing cost) rather than ever
// pricing at 0 when the package has no usable rate at all.
// Since 20261018 a package holds a `vehicles` list with the vocabulary's
// sizes — the same pick as a transportation rate (lib/rates/vehicle-bands).
function selectVehicleFromPackage(pkg: any, numPax: number): { rate: number; vehicle: string } | null {
  const band = vehicleRateForPax(pkg, numPax)
  return band ? { rate: band.rate_eur, vehicle: vehicleKeyLabel(band.key) } : null
}

// The guide_rates row a service line picked, this company's, in the run
// currency — the operator chose it, so it prices whatever the defaults say.
async function pickedGuideRate(
  orgId: string | null,
  id: string,
  normalizer: ReturnType<typeof createRateNormalizer>
): Promise<{ id: string; name: string; dailyRate: number } | null> {
  const { data } = await supabaseAdmin
    .from('guide_rates')
    .select('*')
    .eq('org_id', orgId ?? NO_ORG)
    .eq('id', id)
    .eq('is_active', true)
  const row = ((await normalizer.normalize('guide_rates', (data ?? []) as Record<string, any>[])) ?? [])[0]
  const dailyRate = Number(row?.base_rate_eur) || 0
  return row && dailyRate > 0 ? { id: row.id, name: `${guideLanguageWord(row.guide_language)} Speaking Guide`, dailyRate } : null
}

// Matches no organisation: a rate read without one finds nothing (a missing
// rate), never another company's rate.
const NO_ORG = '00000000-0000-0000-0000-000000000000'

// Get hotel rate from accommodation_rates table (authoritative per-person rates) — this company's.
async function getHotelRate(
  orgId: string | null,
  city: string,
  tier: string = 'standard',
  isEurPassport: boolean = true
): Promise<{ rate: number; name: string; id: string } | null> {
  const { data: hotels, error } = await supabaseAdmin
    .from('accommodation_rates')
    .select('id, property_name, pp_double_eur, pp_double_non_eur, city, tier')
    .eq('org_id', orgId ?? NO_ORG)
    .eq('is_active', true)
    .ilike('city', `%${city}%`)
    .eq('tier', tier)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!error && hotels && hotels.length > 0) {
    const rate = isEurPassport ? (hotels[0].pp_double_eur || 0) : (hotels[0].pp_double_non_eur || 0)
    return {
      rate,
      name: hotels[0].property_name || 'Hotel',
      id: hotels[0].id
    }
  }

  // Fallback: try adjacent tiers (never jump to a completely different tier)
  const TIER_FALLBACK: Record<string, string[]> = {
    budget:   ['standard'],
    standard: ['deluxe', 'budget'],
    deluxe:   ['standard', 'luxury'],
    luxury:   ['deluxe']
  }
  const fallbackTiers = TIER_FALLBACK[tier] || []

  for (const fbTier of fallbackTiers) {
    const { data: fbHotels } = await supabaseAdmin
      .from('accommodation_rates')
      .select('id, property_name, pp_double_eur, pp_double_non_eur, city, tier')
      .eq('org_id', orgId ?? NO_ORG)
      .eq('is_active', true)
      .ilike('city', `%${city}%`)
      .eq('tier', fbTier)
      .order('created_at', { ascending: false })
      .limit(1)

    if (fbHotels && fbHotels.length > 0) {
      const rate = isEurPassport ? (fbHotels[0].pp_double_eur || 0) : (fbHotels[0].pp_double_non_eur || 0)
      console.warn(`⚠️ No ${tier} hotel for ${city} — using ${fbTier} tier: ${fbHotels[0].property_name}`)
      return {
        rate,
        name: fbHotels[0].property_name || 'Hotel',
        id: fbHotels[0].id
      }
    }
  }

  console.warn(`⚠️ No hotel found for ${city} in any tier`)
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // What the org's rate tables are in — the engine labels its result with it,
    // and every currency this route reports is that one.
    const rateCurrency = await getOrgRateCurrency(supabaseAdmin, await getCurrentOrgId())
    const rateSym = currencySymbol(rateCurrency)
    const {
      variation_id,
      // Alternative to variation_id: price a template directly. The engine
      // (calculateAutoPricing) needs only templateId + tier + pax — a variation
      // is a services lookup, not a pricing requirement. Imported programmes
      // (A.T.S catalogue) have itineraries but no variations, and must still
      // be priceable.
      template_id = null,
      num_pax = 2,
      // NEW: Passenger breakdown for child discounts
      num_adults,
      num_children = 0,    // Ages 4-12: 50% discount
      num_infants = 0,     // Ages 0-3: FREE except flights
      flight_cost_per_person = 0,  // Optional flight cost
      travel_date = new Date().toISOString().split('T')[0],
      is_eur_passport = true,
      margin_percent: requestedMargin = null,  // resolved below: request → org default → 25
      partner_id = null,
      // Catalogue extras chosen for THIS quote (ids, or {id} objects).
      extras = [],
      // include_optionals / selected_optional_ids are read off `body` by
      // parseOptionalSelection below, not destructured here.
      language = 'English',
      tier = 'standard',
      tour_leader_included = false,
      // Guide options (2026-09-04): grade picks the guide_rates row;
      // 'throughout' prices the operator's "+1" — see PricingParams.guideMode.
      guide_grade = 'egyptologist',
      guide_mode = 'spot'
    } = body
    const guideGrade = guide_grade === 'senior' ? 'senior' as const : 'egyptologist' as const

    // The partner whose margin prices this must be the org's own: partner_id
    // came from the body and was read — with its b2b_partner_pricing override
    // — whichever company it belonged to. The same 404 as a missing one.
    const orgId = await getCurrentOrgId()
    if (partner_id && !(orgId && await quoteRefsInOrg(supabaseAdmin, orgId, { partner_id }))) {
      return quoteRefNotFound()
    }
    const guideMode = guide_mode === 'throughout' ? 'throughout' as const : 'spot' as const
    // The operator's own margin wins; else the partner's (per variation, then
    // its default); else the company's. One rule for the calculator's screen
    // and for the save's re-price (lib/b2b/partner-margin.ts) — the partner
    // used to override a margin the operator had typed, and the calculator
    // never sent the partner at all.
    const partnerMargins = partner_id && orgId ? await loadPartnerMargins(orgId, partner_id, variation_id, travel_date) : null
    const margin_percent = quoteMarginPercent({
      requested: requestedMargin,
      partnerOverride: partnerMargins?.override,
      partnerDefault: partnerMargins?.default,
      orgDefault: await getOrgDefaultMargin(supabaseAdmin, orgId),
    })

    // WHICH optional services the customer is buying, not merely whether. The
    // old boolean priced every option or none — see lib/b2b/optional-selection.
    const optionalSelection = parseOptionalSelection(body)

    // Extras: accept ids or {id} objects; anything else is ignored, not trusted.
    const isSelection = (e: unknown): e is ExtraSelection =>
      typeof e === 'object' && e !== null &&
      typeof (e as { id?: unknown }).id === 'string' && (e as { id: string }).id.length > 0
    const extraSelections: ExtraSelection[] = (Array.isArray(extras) ? extras : [])
      .map((e: unknown) => (typeof e === 'string' ? { id: e } : e))
      .filter(isSelection)
    const extrasCatalogue = await loadExtras(await getCurrentOrgId(), extraSelections.map((e) => e.id), rateCurrency)

    // Determine if using passenger breakdown or simple num_pax
    const usePassengerBreakdown = num_adults !== undefined && num_adults !== null
    const effectiveNumAdults = usePassengerBreakdown ? num_adults : num_pax
    const effectiveNumChildren = usePassengerBreakdown ? (num_children || 0) : 0
    const effectiveNumInfants = usePassengerBreakdown ? (num_infants || 0) : 0
    const effectiveTotalPax = effectiveNumAdults + effectiveNumChildren + effectiveNumInfants

    console.log('📥 B2B Calculate Price Request:', {
      variation_id,
      num_pax: effectiveTotalPax,
      num_adults: effectiveNumAdults,
      num_children: effectiveNumChildren,
      num_infants: effectiveNumInfants,
      usePassengerBreakdown,
      tour_leader_included,
      is_eur_passport,
      margin_percent
    })

    if (!variation_id && !template_id) {
      return NextResponse.json({ error: 'variation_id or template_id is required' }, { status: 400 })
    }

    let variation: any
    if (variation_id) {
      // Fetch variation with template info
      const { data: varRow, error: varError } = await supabaseAdmin
        .from('tour_variations')
        .select(`
          id, variation_name, variation_code, tier, group_type, min_pax, max_pax,
          tour_templates (id, template_name, template_code, duration_days, uses_day_builder, pricing_mode)
        `)
        .eq('id', variation_id)
        // The caller's company's variation (tour_variations.org_id, 20261207);
        // another company's is "not found".
        .eq('org_id', orgId ?? NO_ORG)
        .single()

      if (varError || !varRow) {
        console.error('Variation fetch error:', varError)
        return NextResponse.json({ error: 'Variation not found' }, { status: 404 })
      }
      variation = varRow
      // A variation sold from 4 travellers was priced for 1 without a word —
      // its per-person costs spread over fewer people than it is ever run for.
      const belowMin = belowMinPaxMessage(varRow.min_pax, effectiveTotalPax)
      if (belowMin) return NextResponse.json({ error: belowMin }, { status: 400 })
    } else {
      // Template-direct: synthesize the variation shape the rest of this route
      // expects. No services row exists, so the auto-pricing fallback below is
      // the path that will actually price it.
      const { data: templateRow, error: tplError } = await supabaseAdmin
        .from('tour_templates')
        .select('id, template_name, template_code, duration_days, uses_day_builder, pricing_mode')
        .eq('id', template_id)
        .eq('org_id', orgId ?? NO_ORG)
        .single()

      if (tplError || !templateRow) {
        console.error('Template fetch error:', tplError)
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }
      variation = {
        id: null,
        variation_name: `${templateRow.template_name} (${tier})`,
        variation_code: null,
        tier,
        group_type: 'private',
        min_pax: 1,
        max_pax: 15,
        tour_templates: templateRow,
      }
    }

    // The tier the CALLER asks for, standard when it asks for none. The
    // variation's own tier used to win here, so a programme imported as
    // "Deluxe" was priced at a tier the office holds no rates for and the
    // quote came back with nine holes (operator, 2026-09-03: standard is the
    // default at all times; another tier is a deliberate choice on the page).
    const effectiveTier = (tier || 'standard') as ServiceTier
    const template = variation.tour_templates as any
    const templateId = template?.id

    // Fetch services for this variation (template-direct requests have none).
    let services: any[] | null = null
    if (variation_id) {
      const { data: serviceRows, error: servError } = await supabaseAdmin
        .from('tour_variation_services')
        .select('*')
        .eq('variation_id', variation_id)
        .order('sequence_order')

      if (servError) {
        console.error('Services fetch error:', servError)
        return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 })
      }
      services = serviceRows
    }

    // ============================================
    // AUTO-PRICING FALLBACK
    // If no services AND template uses day builder, use auto-pricing
    // ============================================
    if ((!services || services.length === 0) && templateId) {
      console.log('📊 No variation services found, using auto-pricing fallback')
      console.log(`   tourLeaderIncluded: ${tour_leader_included}`)
      console.log(`   usePassengerBreakdown: ${usePassengerBreakdown}`)

      // The margin, partner's included, was resolved above.
      const effectiveMargin = margin_percent

      // Use passenger breakdown pricing if breakdown is provided
      let autoPriceResult
      if (usePassengerBreakdown && (effectiveNumChildren > 0 || effectiveNumInfants > 0)) {
        console.log('🧒 Using age-based pricing with child/infant discounts')
        autoPriceResult = await calculatePricingWithPassengerBreakdown({
          // Whose calendar, and which departure — the premium needs both, and
          // the engine charges nothing without them.
          orgId: await getCurrentOrgId() ?? undefined,
          rateCurrency,
          travelDate: travel_date,
          templateId,
          tier: effectiveTier,
          numPax: effectiveTotalPax,
          passengers: {
            numAdults: effectiveNumAdults,
            numChildren: effectiveNumChildren,
            numInfants: effectiveNumInfants
          },
          isEurPassport: is_eur_passport,
          language,
          marginPercent: effectiveMargin,
          mealPlan: 'lunch_only',
          includeAccommodation: (template?.duration_days || 1) > 1,
          tourLeaderIncluded: tour_leader_included,
          guideGrade,
          guideMode,
          flightCostPerPerson: flight_cost_per_person,
          guideFlightCostPerPerson: typeof body.guide_flight_cost_per_person === 'number' ? body.guide_flight_cost_per_person : undefined
        })
      } else {
        // Call standard auto-pricing service
        autoPriceResult = await calculateAutoPricing({
          orgId: await getCurrentOrgId() ?? undefined,
          rateCurrency,
          travelDate: travel_date,
          templateId,
          tier: effectiveTier,
          numPax: effectiveTotalPax,
          isEurPassport: is_eur_passport,
          language,
          marginPercent: effectiveMargin,
          mealPlan: 'lunch_only',
          includeAccommodation: (template?.duration_days || 1) > 1,
          tourLeaderIncluded: tour_leader_included,
          guideGrade,
          guideMode
        })
      }

      if (!autoPriceResult.success) {
        return NextResponse.json({ 
          error: 'Auto-pricing failed', 
          warnings: autoPriceResult.warnings 
        }, { status: 500 })
      }

      // Convert auto-pricing result to B2B format
      const convertedServices: CalculatedService[] = autoPriceResult.services.map(s => ({
        service_id: s.id,
        service_name: s.serviceName,
        service_category: s.serviceType,
        rate_type: s.serviceType,
        rate_source: s.rateSource,
        quantity_mode: s.quantityMode,
        quantity: s.quantity,
        unit_cost: s.unitCost,
        line_total: s.lineTotal,
        is_optional: s.isOptional,
        day_number: s.dayNumber,
        pricing_note: s.notes,
        ...(s.unpriced ? { unpriced: true } : {}),
        ...(s.included ? { included: true } : {}),
        ...(s.issue ? { issue: s.issue } : {}),
        ...(s.propertyName ? { property_name: s.propertyName } : {}),
      }))

      // The per-person accommodation lines are per-person-in-double. A solo
      // traveller pays the single supplement and a party with a triple takes
      // the reduction (lib/pricing/rooming.ts); that difference is one line
      // of its own so the quote's lines still add up to its total.
      const rooming = roomingAdjustment(num_pax, autoPriceResult.accommodationNights ?? [])
      if (rooming !== 0) {
        convertedServices.push({
          service_id: 'rooming-adjustment',
          service_name: rooming > 0 ? 'Single supplement (solo traveller)' : 'Triple reduction (three sharing)',
          service_category: 'accommodation',
          rate_type: 'accommodation',
          rate_source: rooming > 0 ? 'single_supplement' : 'triple_reduction',
          quantity_mode: 'fixed',
          quantity: 1,
          unit_cost: rooming,
          line_total: rooming,
          is_optional: false,
          day_number: null,
          pricing_note: rooming > 0
            ? 'Room of one: per-person-in-double plus the contract\'s single supplement'
            : 'Room of three: each pays per-person-in-double minus the contract\'s triple reduction',
        })
      }

      const convertedOptional: CalculatedService[] = autoPriceResult.optionalServices.map(s => ({
        service_id: s.id,
        service_name: s.serviceName,
        service_category: s.serviceType,
        rate_type: s.serviceType,
        rate_source: s.rateSource,
        quantity_mode: s.quantityMode,
        quantity: s.quantity,
        unit_cost: s.unitCost,
        line_total: s.lineTotal,
        is_optional: true,
        day_number: s.dayNumber,
        pricing_note: s.notes
      }))

      // Extract age-based pricing if available
      const ageBasedPricingData = (autoPriceResult as any).ageBasedPricing

      const result: PriceCalculationResult = {
        variation_id: variation.id,
        variation_name: variation.variation_name,
        template_name: template?.template_name || '',
        num_pax: effectiveTotalPax,
        num_adults: usePassengerBreakdown ? effectiveNumAdults : undefined,
        num_children: usePassengerBreakdown ? effectiveNumChildren : undefined,
        num_infants: usePassengerBreakdown ? effectiveNumInfants : undefined,
        travel_date,
        is_eur_passport,
        tour_leader_included,
        services: convertedServices,
        optional_services: convertedOptional,
        subtotal_cost: autoPriceResult.subtotalCost,
        optional_total: autoPriceResult.optionalTotal,
        total_cost: autoPriceResult.totalCost,
        tour_leader_cost: autoPriceResult.tourLeaderCost,
        margin_percent: autoPriceResult.marginPercent,
        margin_amount: autoPriceResult.marginAmount,
        selling_price: autoPriceResult.sellingPrice,
        price_per_person: autoPriceResult.pricePerPerson,
        single_supplement: autoPriceResult.singleSupplement ?? 0,
        currency: autoPriceResult.currency,
        base_selling_price: autoPriceResult.baseSellingPrice,
        season_uplift: autoPriceResult.seasonUplift
          ? {
              season_name: autoPriceResult.seasonUplift.seasonName ?? '',
              percent: autoPriceResult.seasonUplift.percent,
              amount: autoPriceResult.seasonUplift.amount,
              base: autoPriceResult.seasonUplift.base,
            }
          : null,
        pax_pricing_table: autoPriceResult.paxPricingTable,
        // Include age-based pricing breakdown if available
        age_based_pricing: ageBasedPricingData ? {
          adult_rate: ageBasedPricingData.adultRate,
          child_rate: ageBasedPricingData.childRate,
          infant_rate: ageBasedPricingData.infantRate,
          adults_subtotal: ageBasedPricingData.adultsSubtotal,
          children_subtotal: ageBasedPricingData.childrenSubtotal,
          infants_subtotal: ageBasedPricingData.infantsSubtotal,
          child_discount_percent: CHILD_DISCOUNT_PERCENT,
          breakdown: ageBasedPricingData.breakdown
        } : undefined,
        // Propagate completeness from the hardened engine — never silently
        // present an under-backed rate sheet as final.
        complete: autoPriceResult.complete,
        holes: autoPriceResult.holes?.map(h => ({ kind: h.kind, message: h.message })),
        // The engine's warnings — every "no entrance fee found for …", every
        // skipped guide — travelled only with a FAILED pricing. A quote that
        // priced $343 for an 8-day deluxe cruise looked complete because
        // nobody could see the eleven lines it could not price.
        warnings: autoPriceResult.warnings ?? [],
      }

      console.log('🎉 B2B Price calculated via auto-pricing:', {
        variation: variation.variation_name,
        numPax: effectiveTotalPax,
        numAdults: effectiveNumAdults,
        numChildren: effectiveNumChildren,
        numInfants: effectiveNumInfants,
        tourLeader: tour_leader_included,
        cost: result.total_cost,
        tourLeaderCost: result.tour_leader_cost,
        margin: effectiveMargin + '%',
        selling: result.selling_price,
        perPerson: result.price_per_person,
        singleSupplement: result.single_supplement,
        hasAgeBasedPricing: !!result.age_based_pricing
      })

      return NextResponse.json({ success: true, data: foldExtras(result, extrasCatalogue, extraSelections) })
    }

    // ============================================
    // ORIGINAL LOGIC: Process tour_variation_services
    // ============================================

    // The margin, partner's included, was resolved above.
    const effectiveMargin = margin_percent

    const calculatedServices: CalculatedService[] = []
    const optionalServices: CalculatedService[] = []
    let subtotalCost = 0
    // One entry per CHOSEN option, each already split into the part margin
    // applies to and the part it does not — see lib/b2b/optional-pricing.
    const chosenOptionals: OptionalContribution[] = []

    // Process each service
    // Day-tour vehicle rates come from transportation_rates (the operator's
    // catalog with their own capacity bands) — NOT the `vehicles` fleet list,
    // which has no rates and priced these lines at 0. Cache built once per request.
    const findDayTourVehicle = makeDayTourVehicleFinder(orgId, rateCurrency)
    // The Guides & Services tables, read once per request and converted into
    // the run currency — each row from ITS OWN rate_currency (a fee entered as
    // 600 EGP was priced as 600 in a USD quote). Same normaliser, same policy
    // as the engine: a row that cannot be converted prices as missing.
    const serviceNormalizer = createRateNormalizer(rateCurrency)
    let feeRows: Promise<Record<string, any>[]> | null = null
    const entranceFees = () => (feeRows ??= buildEntranceFeeCache(orgId, serviceNormalizer) as Promise<Record<string, any>[]>)
    let mealRowsP: Promise<Record<string, any>[]> | null = null
    const mealRows = () => (mealRowsP ??= (async () => {
      const { data } = await supabaseAdmin
        .from('meal_rates')
        .select('*')
        .eq('org_id', orgId ?? NO_ORG)
        .eq('is_active', true)
      return ((await serviceNormalizer.normalize('meal_rates', (data ?? []) as Record<string, any>[])) ?? []) as Record<string, any>[]
    })())
    // Read once, and only when a line asks for a transport package.
    let sailing: Promise<{ durationDays: number; route: string[] }> | null = null
    const legacyCruise = () => (sailing ??= legacySailing(orgId, templateId, template?.duration_days || 1))

    for (const service of (services || [])) {
      let unitCost = 0
      let lineTotal = 0
      let rateSource = 'manual'
      let pricingNote = ''
      let effectiveQuantityMode = service.quantity_mode || 'per_pax'

      // ============================================
      // STEP 1: Tiered activity pricing from the catalog (volume discounts
      // like felucca). Lives on activity_rates.tiers now — the old
      // b2b_pricing_rules lookup pointed at a table that was empty in
      // production since launch, so tiered pricing never actually fired.
      // ============================================
      if (service.rate_type === 'activity' && service.service_name) {
        const tiered = await getTieredActivityRate(supabaseAdmin, orgId, service.service_name, { normalizer: serviceNormalizer, date: travel_date })

        if (tiered) {
          const priceResult = applyActivityTiers(tiered.tiers, num_pax, is_eur_passport, rateSym)
          unitCost = priceResult.unitCost
          lineTotal = priceResult.lineTotal
          pricingNote = priceResult.pricingNote
          effectiveQuantityMode = priceResult.quantityMode
          rateSource = 'activity_tiers'

          console.log(`✅ Tiered activity rate: ${tiered.activity_name} -> ${pricingNote}`)
        }
      }

      // ============================================
      // STEP 2: Check for B2B transport packages (cruise sightseeing)
      // ============================================
      // The vehicle carries everyone aboard it — adults, children and
      // infants (effectiveTotalPax); num_pax defaulted to 2 when the request
      // sent only the breakdown. A sightseeing package must fit the sailing's
      // length; a transfer is not sold by length.
      if (rateSource === 'manual' && service.service_category === 'transportation') {
        if (service.service_name?.toLowerCase().includes('sightseeing')) {
          const { durationDays, route } = await legacyCruise()
          const pkg = await getTransportPackage(orgId, 'cruise_sightseeing', { durationDays, route }, rateCurrency)
          const vehicle = pkg ? selectVehicleFromPackage(pkg, effectiveTotalPax) : null
          if (vehicle) {
            unitCost = vehicle.rate
            lineTotal = vehicle.rate
            effectiveQuantityMode = 'fixed'
            pricingNote = `${vehicle.vehicle}: ${rateSym}${vehicle.rate} (${effectiveTotalPax} pax)`
            rateSource = 'b2b_package'
            console.log(`✅ B2B Package applied: ${service.service_name} -> ${pricingNote}`)
          }
        }
        else if (service.service_name?.toLowerCase().includes('transfer') || 
                 service.service_name?.toLowerCase().includes('airport')) {
          const { route } = await legacyCruise()
          const pkg = await getTransportPackage(orgId, 'cruise_transfer', { route }, rateCurrency)
          const vehicle = pkg ? selectVehicleFromPackage(pkg, effectiveTotalPax) : null
          if (vehicle) {
            unitCost = vehicle.rate
            lineTotal = vehicle.rate
            effectiveQuantityMode = 'fixed'
            pricingNote = `${vehicle.vehicle}: ${rateSym}${vehicle.rate} (${effectiveTotalPax} pax)`
            rateSource = 'b2b_package'
          }
        }
      }

      // ============================================
      // STEP 3: Use B2C tables for standard lookups
      // ============================================
      if (rateSource === 'manual') {
        const rateType = service.rate_type || service.service_category

        switch (rateType) {
          case 'transportation': {
            const vehicle = await findDayTourVehicle(service.city, num_pax, is_eur_passport)
            if (vehicle) {
              unitCost = vehicle.rate
              lineTotal = vehicle.rate
              effectiveQuantityMode = 'fixed'
              pricingNote = `${vehicle.vehicle}: ${rateSym}${vehicle.rate}/day`
              rateSource = 'transportation_rates'
              console.log(`✅ Vehicle from transportation_rates: ${vehicle.vehicle} -> ${rateSym}${vehicle.rate}`)
            }
            break
          }

          case 'guide': {
            // From guide_rates, the table Rates → Guides maintains, exactly as
            // the day-by-day engine prices a guide (language by key, grade,
            // mode, valid on the travel date); the line's picked rate wins. It
            // read the legacy guides view's daily_rate and fell back to "any
            // guide" of any language.
            const picked = service.rate_id ? await pickedGuideRate(orgId, service.rate_id, serviceNormalizer) : null
            const guide = picked ?? await getGuideRate(orgId, language, effectiveTier, serviceNormalizer, { grade: guideGrade, mode: guideMode, date: travel_date })
            if (guide) {
              unitCost = guide.dailyRate
              lineTotal = guide.dailyRate
              effectiveQuantityMode = 'fixed'
              pricingNote = `${guide.name}: ${rateSym}${guide.dailyRate}/day`
              rateSource = 'guide_rates'
            }
            break
          }

          case 'activity':
          case 'entrance': {
            if (service.service_name || service.rate_id) {
              const priced = priceEntranceLine(await entranceFees(), {
                serviceName: service.service_name, rateId: service.rate_id, date: travel_date,
                numPax: num_pax, isEurPassport: is_eur_passport, rateSym,
              })
              if (priced) {
                ({ unitCost, lineTotal, pricingNote, rateSource } = priced)
                effectiveQuantityMode = priced.quantityMode
              }
            }
            break
          }

          case 'accommodation': {
            // rate_double_eur is per-person (double occupancy), not per-room
            const hotel = await getHotelRate(orgId, service.city || 'Cairo', effectiveTier, is_eur_passport)
            if (hotel) {
              unitCost = hotel.rate
              lineTotal = hotel.rate * num_pax
              effectiveQuantityMode = 'per_pax'
              pricingNote = `${hotel.name}: ${rateSym}${hotel.rate}/pax (double occupancy)`
              rateSource = 'accommodation_rates'
              console.log(`✅ Hotel: ${hotel.name} -> ${rateSym}${hotel.rate}/pax (${effectiveTier})`)
            }
            break
          }

          case 'cruise': {
            // Cruise rates from nile_cruises table
            if (service.rate_id) {
              const { data: cruise } = await supabaseAdmin
                .from('nile_cruises')
                .select('*')
                .eq('org_id', orgId ?? NO_ORG)
                .eq('id', service.rate_id)
                .single()

              if (cruise) {
                if (num_pax === 1 && cruise.rate_single_eur) {
                  unitCost = cruise.rate_single_eur
                  pricingNote = 'Single occupancy'
                } else if (num_pax >= 3 && cruise.rate_triple_eur) {
                  unitCost = cruise.rate_triple_eur
                  pricingNote = 'Triple occupancy'
                } else {
                  unitCost = cruise.rate_double_eur || 0
                  pricingNote = 'Double occupancy'
                }
                lineTotal = unitCost * num_pax
                effectiveQuantityMode = 'per_pax'
                rateSource = 'nile_cruises'
                console.log(`✅ Cruise from B2C: ${cruise.ship_name} -> ${rateSym}${unitCost}/pax`)
              }
            }
            break
          }

          case 'meal': {
            // meal_rates has no lunch_rate_eur / dinner_rate_eur: every meal
            // line priced 0 and was marked found, so the stored cost below was
            // never used. One restaurant's rate now (the line's pick, else the
            // tier's for that meal on the travel date), per group or per
            // person with its minimum; no rate = the stored cost.
            const priced = priceMealLine(await mealRows(), {
              serviceName: service.service_name, rateId: service.rate_id, tier: effectiveTier,
              date: travel_date, numPax: num_pax, rateSym,
            })
            if (priced) {
              ({ unitCost, lineTotal, pricingNote, rateSource } = priced)
              effectiveQuantityMode = priced.quantityMode
            }
            break
          }
        }
      }

      // ============================================
      // STEP 4: Fall back to stored cost_per_unit
      // ============================================
      if (rateSource === 'manual' && service.cost_per_unit) {
        unitCost = service.cost_per_unit
        rateSource = 'stored'
        console.log(`⚠️ Fallback to stored: ${service.service_name} -> ${rateSym}${unitCost}`)
      }

      // ============================================
      // STEP 5: Calculate line total if not already set
      // ============================================
      // ONE quantity for this line. It used to be worked out twice — once here
      // for the total and once below for display — and the two disagreed:
      // per_day, per_night and per_room were missing from the display copy, so
      // a per-night hotel reported a quantity that did not match its own total.
      const effectiveQuantity = serviceQuantity({
        quantityMode: effectiveQuantityMode,
        quantityValue: service.quantity_value,
        numPax: num_pax,
        durationDays: template?.duration_days || 1,
      })

      if (lineTotal === 0 && unitCost > 0) {
        lineTotal = unitCost * effectiveQuantity
      }

      const calculatedService: CalculatedService = {
        service_id: service.id,
        service_name: service.service_name,
        service_category: service.service_category,
        rate_type: service.rate_type,
        rate_source: rateSource,
        quantity_mode: effectiveQuantityMode,
        quantity: effectiveQuantity,
        unit_cost: Math.round(unitCost * 100) / 100,
        line_total: Math.round(lineTotal * 100) / 100,
        is_optional: service.is_optional || false,
        day_number: service.day_number,
        pricing_note: pricingNote || undefined
      }

      if (service.is_optional) {
        // is_selected travels with the line so the caller can show what was
        // chosen — and so the quote can snapshot the chosen ones as real
        // services rather than losing them (docs/plans §5a).
        const selected = isOptionalSelected(service.id, optionalSelection)
        const override = service.optional_price_override
        optionalServices.push({
          ...calculatedService,
          is_selected: selected,
          // What the customer pays for it: the operator's own price when there
          // is one, otherwise cost + margin like any other service.
          selling_price: override
            ? Math.round(Number(override) * effectiveQuantity * 100) / 100
            : Math.round(lineTotal * (1 + effectiveMargin / 100) * 100) / 100,
          price_basis: override ? 'operator_price' : 'cost_plus_margin',
        })
        if (selected) {
          chosenOptionals.push(
            optionalContribution({ lineTotal, override, quantity: effectiveQuantity })
          )
        }
      } else {
        calculatedServices.push(calculatedService)
        subtotalCost += lineTotal
      }
    }

    // Calculate totals. An option the operator has priced is added AFTER
    // margin — that price is a decision, not a number to mark up — while its
    // cost still counts as cost. See lib/b2b/optional-pricing.
    const quoteTotals = composeQuoteTotals({
      subtotalCost,
      optionals: chosenOptionals,
      marginPercent: effectiveMargin,
    })
    const totalCost = quoteTotals.costTotal
    const marginAmount = quoteTotals.marginAmount
    const baseSellingPrice = quoteTotals.baseSellingPrice
    const optionalTotal = quoteTotals.optionalSellingTotal

    // The operator's demand premium, on this path too. A variation that happens
    // to carry its own service rows must not quote Golden Week at the ordinary
    // price while the day-builder path charges 15% more for the same departure.
    const demandSeason = seasonForDate(
      await loadSeasonWindows(await getCurrentOrgId() ?? undefined, travel_date),
      travel_date
    )
    const uplift = computeUplift({ sellingPrice: baseSellingPrice, season: demandSeason })
    const upliftAmount = Math.round(uplift.amount * 100) / 100
    const sellingPrice = baseSellingPrice + upliftAmount
    const pricePerPerson = sellingPrice / num_pax

    const result: PriceCalculationResult = {
      variation_id: variation.id,
      variation_name: variation.variation_name,
      template_name: template?.template_name || '',
      num_pax,
      travel_date,
      is_eur_passport,
      tour_leader_included,  // NEW
      services: calculatedServices,
      optional_services: optionalServices,
      subtotal_cost: Math.round(subtotalCost * 100) / 100,
      optional_total: Math.round(optionalTotal * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
      tour_leader_cost: 0,  // Not calculated in legacy mode
      margin_percent: effectiveMargin,
      margin_amount: Math.round(marginAmount * 100) / 100,
      selling_price: Math.round(sellingPrice * 100) / 100,
      price_per_person: Math.round(pricePerPerson * 100) / 100,
      single_supplement: 0,  // Not calculated in legacy mode
      currency: rateCurrency,
      base_selling_price: Math.round(baseSellingPrice * 100) / 100,
      season_uplift: demandSeason
        ? {
            season_name: demandSeason.name,
            percent: demandSeason.upliftPercent,
            amount: upliftAmount,
            base: Math.round(uplift.base * 100) / 100,
          }
        : null,
    }

    console.log('🎉 B2B Price calculated:', {
      variation: variation.variation_name,
      numPax: num_pax,
      cost: totalCost,
      margin: effectiveMargin + '%',
      selling: sellingPrice
    })

    return NextResponse.json({ success: true, data: foldExtras(result, extrasCatalogue, extraSelections) })
  } catch (error: any) {
    console.error('❌ Error calculating tour price:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// GET endpoint for simple queries
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const variation_id = searchParams.get('variation_id')
  const num_pax = parseInt(searchParams.get('num_pax') || '2')
  // NEW: Support passenger breakdown in GET params
  const num_adults = searchParams.get('num_adults') ? parseInt(searchParams.get('num_adults')!) : undefined
  const num_children = parseInt(searchParams.get('num_children') || '0')
  const num_infants = parseInt(searchParams.get('num_infants') || '0')
  const flight_cost = parseFloat(searchParams.get('flight_cost_per_person') || '0')
  const travel_date = searchParams.get('travel_date') || new Date().toISOString().split('T')[0]
  const is_eur = searchParams.get('is_eur') !== 'false'
  const margin = parseFloat(searchParams.get('margin') || '25')
  const tour_leader = searchParams.get('tour_leader') === 'true'

  if (!variation_id) {
    return NextResponse.json({ error: 'variation_id is required' }, { status: 400 })
  }

  const mockRequest = new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({
      variation_id,
      num_pax,
      num_adults,
      num_children,
      num_infants,
      flight_cost_per_person: flight_cost,
      travel_date,
      is_eur_passport: is_eur,
      margin_percent: margin,
      tour_leader_included: tour_leader
    })
  })

  return POST(mockRequest)
}