// ============================================
// The pricing grid's rate options — one shaping for the screen and the save
// ============================================
// GET /api/pricing-grid/rates hands these to the grid's dropdowns; the save
// (POST /api/pricing-grid/save) reads the SAME options to price each line from
// the stored rate, by its id, rather than from the price the browser sent. A
// stale tab, a draft restored from this browser, or an edited request carried
// whatever prices it had: with one shaping here, the save prices a line
// exactly as the screen offers it today.
//
// Server-only: it reads the rate tables and the agency's vocabulary.

import { guideLanguageWord } from '@/lib/guides/guide-language'
import { rateGuideMode } from '@/lib/guides/guide-mode'
import { seasonsForRow, plainPeriodName, type RateSeasonEntity } from '@/lib/rates/rate-seasons'
import { periodLabel, type OptionPeriod } from '@/lib/rates/date-window'
import { cruiseSailingLabel, sanitizeSailingDays } from '@/lib/rates/cruise-sailing'
import { airportsFrom, flightRouteLabel, cityOfAirportKey } from '@/lib/rates/airports'
import { flightGuideFare } from '@/lib/rates/ticket-guide-fare'
import { supplementsForRow, supplementField } from '@/lib/rates/supplements'
import { createRateNormalizer, type RateNormalizer } from '@/lib/rates/rate-currency'
import { roundToCurrency } from '@/lib/currency-totals'
import { getOrgRateCurrency, type RateCurrency } from '@/lib/org-rate-currency'
import { pricingBasisLabel, toPricingBasis } from '@/lib/pricing/pricing-basis'
import { vehicleBands, vehicleKeyLabel } from '@/lib/rates/vehicle-bands'
import { vocabularyItemsForCurrentOrg } from '@/lib/vocabulary-server'
import { tipGridOption } from '@/lib/tipping-utils'
import type { AllRates, GridFixedCosts, RateOption } from '@/app/pricing-grid/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/**
 * The fixed costs the grid charges (Rates › Fixed Costs): the same list the
 * automatic engine and both AI builders charge — getFixedDailyCosts, water
 * first with its 2.00 fallback, every other active cost by name, Daily Tips
 * never — shaped for the grid. Per person per sightseeing day, in the rate
 * currency, to its smallest unit (so the screen's sum and the save's rounded
 * lines agree). A zero adds no line; `warnings` says why the water default was
 * used or a cost was left out (its currency has no exchange rate).
 */
export function gridFixedCostsFrom(
  daily: { items: Array<{ name: string; perPersonPerDay: number }>; warnings: string[] },
  rateCurrency: string,
): GridFixedCosts {
  return {
    items: daily.items
      .map(i => ({ name: i.name, perPersonPerDay: roundToCurrency(i.perPersonPerDay, rateCurrency) }))
      .filter(i => i.perPersonPerDay > 0),
    warnings: [...daily.warnings],
  }
}

export async function loadGridFixedCosts(
  orgId: string,
  normalizer: RateNormalizer,
  rateCurrency: string,
): Promise<GridFixedCosts> {
  // Imported on use: lib/fixed-costs opens a service-role client when loaded.
  const { getFixedDailyCosts } = await import('@/lib/fixed-costs')
  return gridFixedCostsFrom(await getFixedDailyCosts(orgId, normalizer), rateCurrency)
}

/**
 * Every rate option the grid can pick, by slot, in the org's rate currency.
 * `tier` narrows hotels and cruises to one tier, as the screen lists them;
 * null reads every tier — the save resolves a picked id whatever its tier.
 */
export async function loadGridRateOptions(
  supabase: Db,
  orgId: string,
  tier: string | null,
): Promise<{
  rates: AllRates
  rateCurrency: RateCurrency
  fixedCosts: GridFixedCosts
  /** 1 unit of a currency in the rate currency — the factor these rates were
   *  converted with (RateNormalizer.fxFor), for the save's paid fields. */
  fxFor: (currency: string) => Promise<number | null>
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ofTier = (q: any) => (tier ? q.eq('tier', tier) : q)
  // Fetch all rate tables in parallel
  const [
    { data: transportRates },
    { data: guideRates },
    { data: airportRates },
    { data: hotelServiceRates },
    { data: tippingRates },
    { data: activityRates },
    { data: accommodationRates },
    { data: entranceFees },
    { data: mealRates },
    { data: cruiseRates },
    { data: cruiseTransportPkgs },
    { data: flightRates },
    { data: airportRows },
  ] = await Promise.all([
    supabase.from('transportation_rates').select('*').eq('org_id', orgId).eq('is_active', true),
    supabase.from('guide_rates').select('*').eq('org_id', orgId).eq('is_active', true),
    supabase.from('airport_staff_rates').select('*').eq('org_id', orgId).eq('is_active', true),
    supabase.from('hotel_staff_rates').select('*').eq('org_id', orgId).eq('is_active', true),
    supabase.from('tipping_rates').select('*').eq('org_id', orgId).eq('is_active', true),
    supabase.from('activity_rates').select('*').eq('org_id', orgId).eq('is_active', true),
    ofTier(supabase.from('accommodation_rates').select('*').eq('org_id', orgId).eq('is_active', true)),
    supabase.from('entrance_fees').select('*').eq('org_id', orgId).eq('is_active', true),
    supabase.from('meal_rates').select('*').eq('org_id', orgId).eq('is_active', true),
    ofTier(supabase.from('nile_cruises').select('*').eq('org_id', orgId).eq('is_active', true)),
    // The org's own packages and airports (both carry org_id) — these were
    // every company's.
    supabase.from('b2b_transport_packages').select('*').eq('org_id', orgId).eq('is_active', true),
    supabase.from('flight_rates').select('*').eq('org_id', orgId).eq('is_active', true),
    // A fare's route is airport KEYS; every line the operator reads, and the
    // day-city match, needs them back as places.
    supabase.from('org_vocabularies').select('key, label, meta, is_active').eq('org_id', orgId).eq('kind', 'airport').order('rank'),
  ])
  const airports = airportsFrom((airportRows ?? []) as Array<{ key: string; label: string; meta: Record<string, unknown>; is_active: boolean }>)

  // NORMALISE EVERY ROW TO THE ORG RATE CURRENCY before any option is
  // shaped. The engine paths have done this since per-rate-currency
  // shipped; the grid read RAW rows — so an entrance fee entered as
  // 600 EGP became "600" in the grid's run currency, summed beside USD
  // rates into a total that was confidently wrong by ~50x. Same
  // normalizer, same policy: a row whose currency cannot be converted is
  // neutralised (prices to 0 and shows as such) rather than guessed.
  const rateCurrency = await getOrgRateCurrency(supabase, orgId)
  const normalizer = createRateNormalizer(rateCurrency)
  const [
    nTransport, nGuides, nAirport, nHotelSvc, nTipping, nActivities,
    nAccommodation, nEntrance, nMeals, nCruises, nCruisePkgs, nFlights,
  ] = await Promise.all([
    normalizer.normalize('transportation_rates', transportRates),
    normalizer.normalize('guide_rates', guideRates),
    normalizer.normalize('airport_staff_rates', airportRates),
    normalizer.normalize('hotel_staff_rates', hotelServiceRates),
    normalizer.normalize('tipping_rates', tippingRates),
    normalizer.normalize('activity_rates', activityRates),
    normalizer.normalize('accommodation_rates', accommodationRates),
    normalizer.normalize('entrance_fees', entranceFees),
    normalizer.normalize('meal_rates', mealRates),
    normalizer.normalize('nile_cruises', cruiseRates),
    normalizer.normalize('b2b_transport_packages', cruiseTransportPkgs),
    normalizer.normalize('flight_rates', flightRates),
  ])
  if (normalizer.misses.length) {
    console.warn('[pricing-grid rates] rows neutralised — currency not convertible:',
      normalizer.misses.map(m => `${m.table}:${m.id}(${m.currency})`).join(', '))
  }

  // Map to RateOption format per slot
  // Vehicles: each transport row expands into one option per vehicle it
  // offers — the row's `vehicles` list (an agency-added vehicle included),
  // else its legacy columns (lib/rates/vehicle-bands). Named in the
  // agency's own words where Settings → Vocabulary has them.
  const vehicleWords = new Map((await vocabularyItemsForCurrentOrg('vehicle_type')).map(i => [i.key, i.label]))
  const vehicleLabel = (key: string) => vehicleWords.get(key) ?? vehicleKeyLabel(key)

  // The kind of journey, in the agency's words (Settings → Vocabulary →
  // Transport service types), and a road transfer's trip shape: two routes
  // on the same road differ only by them, and without them an option read
  // like the day's whole programme (ported from autoura-saas #612).
  const typeWords = new Map((await vocabularyItemsForCurrentOrg('transport_service_type')).map(i => [i.key, i.label]))
  const typeLabel = (key: string | null | undefined) =>
    key ? (typeWords.get(key) ?? key.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())) : ''
  const SHAPE_LABEL: Record<string, string> = { one_way: 'one way', same_day_return: 'day trip, back the same day', overnight_return: 'back the next day' }
  /** " · Intercity, day trip, back the same day" — the type left out when the
   *  route's own name already says it ("Cairo Day Tour"). */
  const kindOf = (r: any, namePrefix: string): string => {
    if (r.service_type === 'cruise_transport_package') return ''
    const type = typeLabel(r.service_type)
    const parts = [
      type && !namePrefix.toLowerCase().includes(type.toLowerCase()) ? type : '',
      SHAPE_LABEL[r.trip_shape] ?? '',
    ].filter(Boolean)
    return parts.length ? ` · ${parts.join(', ')}` : ''
  }

  const expandTiers = (r: any, namePrefix: string, extra: Record<string, unknown> = {}) =>
    vehicleBands(r).map(b => ({
      id: `${r.id}__${b.key}`,
      name: `${vehicleLabel(b.key)} (${b.capacity_min}-${b.capacity_max} pax) — ${namePrefix}${kindOf({ ...r, ...extra }, namePrefix)}`,
      rateEur: b.rate_eur,
      rateNonEur: b.rate_non_eur ?? b.rate_eur,
      city: r.origin_city || r.city,
      details: `${vehicleLabel(b.key)} | ${r.service_type}`,
      capacity_min: b.capacity_min,
      capacity_max: b.capacity_max,
      service_type: r.service_type,
      trip_shape: r.trip_shape ?? null,
      origin_city: r.origin_city || r.city,
      destination_city: r.destination_city,
      ...extra,
    }))

  const rates = {
    route: [
      // Day tour vehicles (merged into route — all transport in one slot)
      ...(nTransport || [])
        .filter((r: any) => r.service_type === 'day_tour')
        .flatMap((r: any) => {
          const label = r.route_name || r.service_code || `${r.origin_city || r.city || ''} Day Tour`
          return expandTiers(r, label)
        }),
      // All other transport types (airport transfers, intercity, city transfers, dinner transfers, etc.)
      ...(nTransport || [])
        .filter((r: any) => r.service_type !== 'day_tour')
        .flatMap((r: any) => {
          const label = r.route_name || `${r.origin_city || ''} → ${r.destination_city || ''}`.trim() || r.service_code
          return expandTiers(r, label)
        }),
      // Cruise transport packages (bundled sightseeing vehicle for cruise
      // days): one option per vehicle, sized like every transport rate — it
      // priced every group at the sedan rate.
      ...(nCruisePkgs || []).flatMap((r: any) =>
        expandTiers(r, `${r.package_name} (${r.origin_city}→${r.destination_city}, ${r.duration_days}d)`, {
          city: r.origin_city,
          details: `cruise_package | ${r.description || ''}`,
          service_type: 'cruise_transport_package',
          package_type: r.package_type,
        })),
    ],

    guide: (nGuides || []).map((r: any) => ({
      id: r.id,
      // Spot and throughout rates are different prices — the name says which,
      // and so do the duration and the city: a half-day and a full-day rate
      // (or a Cairo and a Luxor one) read identically at different prices.
      name: `${r.guide_language ? guideLanguageWord(r.guide_language) : 'Guide'} (${[
        r.guide_type || 'Egyptologist',
        GUIDE_DURATION_LABEL[r.tour_duration] ?? r.tour_duration,
        rateGuideMode(r) !== 'spot' ? rateGuideMode(r) : '',
      ].filter(Boolean).join(', ')})${r.city ? ` — ${r.city}` : ''}`,
      rateEur: toNum(r.base_rate_eur || r.rate_eur),
      rateNonEur: toNum(r.base_rate_non_eur || r.rate_non_eur || r.base_rate_eur || r.rate_eur),
      city: r.city,
      details: withValidity(r.guide_language ? guideLanguageWord(r.guide_language) : r.guide_language, r),
      // The dropdown filters by language and by kind of guide.
      language: r.guide_language ? guideLanguageWord(r.guide_language) : undefined,
      category: r.guide_type || 'Egyptologist',
    })),

    airport_services: (nAirport || []).map((r: any) => ({
      id: r.id,
      name: `${r.airport_code} — ${r.direction || 'both'} (${r.airport_code})`,
      rateEur: toNum(r.rate_eur),
      rateNonEur: toNum(r.rate_eur),
      city: r.airport_code,
      details: `${r.direction || 'both'} | ${pricingBasisLabel(toPricingBasis(r.pricing_type), r.max_capacity)}${r.description ? ` | ${r.description}` : ''}`,
      ...basisOf(r),
    })),

    hotel_services: (nHotelSvc || []).map((r: any) => {
      // Build a readable name from service_type + category + destination
      const typeLabel = (r.service_type || 'service').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      const catLabel = r.hotel_category && r.hotel_category !== 'all' ? ` (${r.hotel_category})` : ''
      const destLabel = r.destination ? ` — ${r.destination}` : ''
      return {
        id: r.id,
        name: `${typeLabel}${catLabel}${destLabel}`,
        rateEur: toNum(r.rate_eur),
        rateNonEur: toNum(r.rate_eur),
        category: r.hotel_category,
        city: r.destination,  // Use destination as city for filtering
        details: `${pricingBasisLabel(toPricingBasis(r.pricing_type), r.max_capacity)} | ${r.description || `${typeLabel} | ${r.hotel_category || 'all'}`}`,
        ...basisOf(r),
      }
    }),

    tipping: (nTipping || []).map((r: any) => {
      // The tip's own Rate Unit: a per-person tip is charged per traveller,
      // not split across the group (lib/tipping-utils tipGridOption).
      const { unitLabel, ...basis } = tipGridOption(r.rate_unit)
      return {
        id: r.id,
        // `r.role` is not a column: every tip without a service code was
        // listed as just "Tip". The description says whose it is.
        name: r.description || r.service_code || [r.role_type, r.context].filter(Boolean).join(' – ') || 'Tip',
        // Whose tip — the guide's are dropped when the guide is off (guide-rule.ts).
        tip_role: r.role_type ?? null,
        rateEur: toNum(r.rate_eur || r.amount_eur),
        rateNonEur: toNum(r.rate_eur || r.amount_eur),
        details: [unitLabel, r.description].filter(Boolean).join(' | ') || undefined,
        ...basis,
      }
    }),

    boat_rides: (nActivities || [])
      .filter((r: any) => /boat|felucca|motor/i.test(r.activity_name || r.category || ''))
      .map((r: any) => ({
        id: r.id,
        name: r.activity_name,
        rateEur: toNum(r.rate_eur || r.base_rate_eur),
        rateNonEur: toNum(r.rate_non_eur || r.base_rate_non_eur || r.rate_eur || r.base_rate_eur),
        city: r.city,
        details: r.pricing_type,
        ...basisOf(r),
      })),

    accommodation: (nAccommodation || []).map((r: any) => ({
      id: r.id,
      name: `${r.property_name} ${r.city} (${r.tier} | ${r.board_basis || 'BB'})`,
      rateEur: toNum(r.pp_double_eur),
      rateNonEur: toNum(r.pp_double_non_eur),
      city: r.city,
      details: detailsWithPeriod(`${r.tier} | ${r.board_basis || 'BB'}`, periodsFor(r, 'accommodation', 'pp_double_eur', 'pp_double_non_eur')),
      periods: periodsFor(r, 'accommodation', 'pp_double_eur', 'pp_double_non_eur'),
      singleSuppPeriods: periodsFor(r, 'accommodation', 'single_supp_eur', 'single_supp_non_eur'),
      board_basis: r.board_basis || 'BB',
      single_supp_eur: toNum(r.single_supp_eur),
      single_supp_non_eur: toNum(r.single_supp_non_eur),
      // The throughout guide's bed, from the first rate period — the same
      // period the headline pp_double columns mirror. 0 = not entered.
      guide_rate: toNum(seasonsForRow(r, 'accommodation')[0]?.rates?.guide_rate),
      supplements: gridSupplements(r, 'accommodation'),
    })),

    entrance_fees: (nEntrance || []).map((r: any) => ({
      id: r.id,
      name: r.attraction_name,
      rateEur: toNum(r.eur_rate),
      rateNonEur: toNum(r.non_eur_rate),
      city: r.city,
      category: r.category,
    })),

    flights: (nFlights || []).map((r: any) => ({
      id: r.id,
      // The route is AIRPORT KEYS on the row; a person reads places.
      // "Egypt Air asw→cai" named nothing anybody recognises.
      name: `${r.airline} ${flightRouteLabel(airports, r)} (${r.cabin_class})`,
      rateEur: toNum(r.base_rate_eur) + toNum(r.tax_eur),
      rateNonEur: toNum(r.base_rate_non_eur || r.base_rate_eur) + toNum(r.tax_non_eur || r.tax_eur),
      // The DAY's city is matched against this, so it has to BE a city.
      city: cityOfAirportKey(airports, r.route_from),
      // A fare carries dated PERIODS now (migration 20261025), so the single
      // rate_valid_from/to pair is only the first period's mirror — naming it
      // on a fare with four periods reads as a different fare.
      details: detailsWithPeriod(`${r.airline} | ${r.flight_number || ''} | ${r.cabin_class}`, flightPeriods(r)),
      periods: flightPeriods(r),
      route_from: r.route_from,
      route_to: r.route_to,
      // Guide fare for the "+1" seat; null = he pays the customer fare. Read
      // from the first period as STORED (lib/rates/ticket-guide-fare): the
      // mirrored column holds 0 for a blank, which flew the guide free.
      guide_rate: flightGuideFare(r),
    })),

    experiences: (nActivities || [])
      .filter((r: any) => !/boat|felucca|motor/i.test(r.activity_name || r.category || ''))
      .map((r: any) => ({
        id: r.id,
        name: r.activity_name,
        rateEur: toNum(r.rate_eur || r.base_rate_eur),
        rateNonEur: toNum(r.rate_non_eur || r.base_rate_non_eur || r.rate_eur || r.base_rate_eur),
        city: r.city,
        details: r.pricing_type,
        ...basisOf(r),
      })),

    meals: (nMeals || []).map((r: any) => ({
      id: r.id,
      name: `${r.meal_type} - ${r.restaurant_name || 'Restaurant'} (${r.city})`,
      rateEur: toNum(r.base_rate_eur || r.rate_eur),
      rateNonEur: toNum(r.base_rate_non_eur || r.rate_non_eur || r.base_rate_eur || r.rate_eur),
      city: r.city,
      category: r.meal_type,
      details: withValidity(mealDetails(r), r),
      // "Per Person Rate" unticked = one price for the whole group; it was
      // charged per traveller.
      ...(r.per_person_rate === false ? { pricing_basis: 'flat' as const, unit_capacity: null } : {}),
    })),

    cruise: (nCruises || []).map((r: any) => ({
      id: r.id,
      name: `${r.ship_name} (${r.duration_nights}N, ${r.cabin_type})`,
      rateEur: toNum(r.rate_double_eur || r.rate_low_double_eur),
      rateNonEur: toNum(r.rate_double_non_eur || r.rate_low_double_non_eur || r.rate_double_eur || r.rate_low_double_eur),
      // Direction and LENGTH first: the same ship sells a 3-night Aswan→Luxor
      // and a 4-night Luxor→Aswan at different prices, and the line used to
      // show route_name — free text that said "Aswan to Luxor" on both — with
      // no nights at all, so two different products read identically.
      details: detailsWithPeriod(
        [cruiseSailingLabel(r), r.tier || '', r.cabin_type || 'Standard'].filter(Boolean).join(' | '),
        periodsFor(r, 'cruise', 'double_eur', 'double_non_eur')
      ),
      sailingDays: sanitizeSailingDays(r.sailing_days),
      periods: periodsFor(r, 'cruise', 'double_eur', 'double_non_eur'),
      singleSuppPeriods: periodsFor(r, 'cruise', 'single_eur', 'single_non_eur'),
      single_rate_eur: toNum(r.rate_single_eur || r.rate_low_single_eur),
      single_rate_non_eur: toNum(r.rate_single_non_eur || r.rate_low_single_non_eur),
      duration_nights: r.duration_nights,
      ship_category: r.ship_category,
      // The dropdown filters by the ports and the cabin.
      origin_city: r.embark_city || undefined,
      destination_city: r.disembark_city || undefined,
      category: r.cabin_type || undefined,
      // The throughout guide's cabin per night, first rate period.
      guide_rate: toNum(seasonsForRow(r, 'cruise')[0]?.rates?.guide_rate),
      supplements: gridSupplements(r, 'cruise'),
    })),
  }

  // The fixed costs, from the same helper as automatic pricing and in the same
  // rate currency as every other amount here.
  const fixedCosts = await loadGridFixedCosts(orgId, normalizer, rateCurrency)
  return { rates: rates as unknown as AllRates, rateCurrency, fixedCosts, fxFor: currency => normalizer.fxFor(currency) }
}

/** The guide durations as the rate form names them. */
const GUIDE_DURATION_LABEL: Record<string, string> = {
  half_day: 'half day', full_day: 'full day', extended: 'extended', hourly: 'hourly', meet_greet: 'meet & assist day',
}

/** A meal's restaurant and how its price applies (per person or per group). */
function mealDetails(r: { restaurant_name?: string | null; per_person_rate?: boolean | null }): string {
  const basis = r.per_person_rate === false ? 'per group' : 'per person'
  return [r.restaurant_name, basis].filter(Boolean).join(' | ')
}

/** " | valid 2026-01-01 to 2026-12-31" on a dated rate: one service may hold
 *  two periods, and the options must not read alike. */
function withValidity(details: string | null | undefined, r: { rate_valid_from?: string | null; rate_valid_to?: string | null }): string {
  const from = r.rate_valid_from ? String(r.rate_valid_from).slice(0, 10) : ''
  const to = r.rate_valid_to ? String(r.rate_valid_to).slice(0, 10) : ''
  const period = from && to ? `valid ${from} to ${to}` : from ? `valid from ${from}` : to ? `valid until ${to}` : ''
  return [details, period].filter(Boolean).join(' | ')
}

/** A rate row's pricing basis for the grid (lib/pricing/pricing-basis.ts). */
function basisOf(r: { pricing_type?: unknown; max_capacity?: unknown }) {
  const basis = toPricingBasis(r.pricing_type)
  const capacity = typeof r.max_capacity === 'number' && r.max_capacity > 0 ? r.max_capacity : null
  return basis ? { pricing_basis: basis, unit_capacity: capacity } : {}
}

function toNum(v: any): number {
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

/** The property's supplements with their FIRST-period per-person-per-night
 *  prices — the period the headline rate mirrors, since the grid resolves no
 *  travel date per night. Rows already went through the currency normaliser,
 *  so these are in the run currency like everything else on the option. */
/**
 * A property's dated periods, flattened for the grid.
 *
 * The grid prices from the BASE columns, which mirror the FIRST period — so
 * periods[0] is the period the number on screen belongs to, and the rest are
 * what it is NOT. Sent so the option can say which, and so the completeness
 * gate can notice when the trip's dates fall in another one.
 */
function optionPeriods(
  row: Record<string, unknown>,
  entity: RateSeasonEntity,
  /** The period's own rate, in the same shape the option's base columns take. */
  rate: (rates: Record<string, number>) => { rateEur: number; rateNonEur: number }
): OptionPeriod[] {
  return seasonsForRow(row, entity).map(season => ({
    name: plainPeriodName(season),
    from: season.from,
    to: season.to,
    ...rate(season.rates ?? {}),
  }))
}

/** Per-period rates for the derived items a pick carries — a hotel's single
 *  supplement, a cruise's single cabin, a supplement toggled under either.
 *  Same dates, different field, so they price on the same day's period. */
const periodsFor = (
  row: Record<string, unknown>,
  entity: RateSeasonEntity,
  eur: string,
  nonEur: string
): OptionPeriod[] =>
  optionPeriods(row, entity, r => ({ rateEur: toNum(r[eur]), rateNonEur: toNum(r[nonEur]) }))

/** A flight's period rate is the fare PLUS its tax, the same sum the option's
 *  base columns show. */
const flightPeriods = (row: Record<string, unknown>): OptionPeriod[] =>
  optionPeriods(row, 'flight', r => ({
    rateEur: toNum(r.base_rate_eur) + toNum(r.tax_eur),
    rateNonEur: (toNum(r.base_rate_non_eur) || toNum(r.base_rate_eur)) + (toNum(r.tax_non_eur) || toNum(r.tax_eur)),
  }))

/** The period the shown price belongs to, appended to an option's details.
 *  Silent for a row with no periods, or with only one — there is nothing to
 *  mistake it for. */
function detailsWithPeriod(details: string, periods: OptionPeriod[]): string {
  if (periods.length < 2) return details
  return `${details} | ${periodLabel(periods[0])}`
}

function gridSupplements(row: object, entity: RateSeasonEntity) {
  const rates = seasonsForRow(row, entity)[0]?.rates ?? {}
  return supplementsForRow(row).map(s => ({
    key: s.key,
    name: s.name,
    rateEur: toNum(rates[supplementField(s.key, 'eur')]),
    rateNonEur: toNum(rates[supplementField(s.key, 'non_eur')]),
    // A supplement is priced per night like the room it rides on, so it
    // follows the same periods — not the first one for the whole trip.
    periods: periodsFor(
      row as Record<string, unknown>, entity,
      supplementField(s.key, 'eur'), supplementField(s.key, 'non_eur')
    ),
  }))
}
