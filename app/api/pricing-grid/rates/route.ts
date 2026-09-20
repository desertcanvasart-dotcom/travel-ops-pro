// GET /api/pricing-grid/rates?tier=standard
// Fetches all available rate options from existing Supabase tables,
// structured by grid slot for dropdown population.

import { guideLanguageWord } from '@/lib/guides/guide-language'
import { rateGuideMode } from '@/lib/guides/guide-mode'
import { NextRequest, NextResponse } from 'next/server'
import { seasonsForRow, plainPeriodName, type RateSeasonEntity } from '@/lib/rates/rate-seasons'
import { periodLabel, type OptionPeriod } from '@/lib/rates/date-window'
import { cruiseSailingLabel, sanitizeSailingDays } from '@/lib/rates/cruise-sailing'
import { airportsFrom, flightRouteLabel, cityOfAirportKey } from '@/lib/rates/airports'
import { supplementsForRow, supplementField } from '@/lib/rates/supplements'
import { createRateNormalizer } from '@/lib/rates/rate-currency'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { vehicleBands, vehicleKeyLabel } from '@/lib/rates/vehicle-bands'
import { vocabularyItemsForCurrentOrg } from '@/lib/vocabulary-server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    const tier = searchParams.get('tier') || 'standard'

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
      supabase.from('transportation_rates').select('*').eq('is_active', true),
      supabase.from('guide_rates').select('*').eq('is_active', true),
      supabase.from('airport_staff_rates').select('*').eq('is_active', true),
      supabase.from('hotel_staff_rates').select('*').eq('is_active', true),
      supabase.from('tipping_rates').select('*').eq('is_active', true),
      supabase.from('activity_rates').select('*').eq('is_active', true),
      supabase.from('accommodation_rates').select('*').eq('is_active', true).eq('tier', tier),
      supabase.from('entrance_fees').select('*').eq('is_active', true),
      supabase.from('meal_rates').select('*').eq('is_active', true),
      supabase.from('nile_cruises').select('*').eq('is_active', true).eq('tier', tier),
      supabase.from('b2b_transport_packages').select('*').eq('is_active', true),
      supabase.from('flight_rates').select('*').eq('is_active', true),
      // A fare's route is airport KEYS; every line the operator reads, and the
      // day-city match, needs them back as places.
      supabase.from('org_vocabularies').select('key, label, meta, is_active').eq('kind', 'airport').order('rank'),
    ])
    const airports = airportsFrom((airportRows ?? []) as Array<{ key: string; label: string; meta: Record<string, unknown>; is_active: boolean }>)

    // NORMALISE EVERY ROW TO THE ORG RATE CURRENCY before any option is
    // shaped. The engine paths have done this since per-rate-currency
    // shipped; the grid read RAW rows — so an entrance fee entered as
    // 600 EGP became "600" in the grid's run currency, summed beside USD
    // rates into a total that was confidently wrong by ~50x. Same
    // normalizer, same policy: a row whose currency cannot be converted is
    // neutralised (prices to 0 and shows as such) rather than guessed.
    const rateCurrency = await getOrgRateCurrency(supabase, await getCurrentOrgId())
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

    const expandTiers = (r: any, namePrefix: string, extra: Record<string, unknown> = {}) =>
      vehicleBands(r).map(b => ({
        id: `${r.id}__${b.key}`,
        name: `${vehicleLabel(b.key)} (${b.capacity_min}-${b.capacity_max} pax) — ${namePrefix}`,
        rateEur: b.rate_eur,
        rateNonEur: b.rate_non_eur ?? b.rate_eur,
        city: r.origin_city || r.city,
        details: `${vehicleLabel(b.key)} | ${r.service_type}`,
        capacity_min: b.capacity_min,
        capacity_max: b.capacity_max,
        service_type: r.service_type,
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
        // Spot and throughout rates are different prices — the name says which.
        name: `${r.guide_language ? guideLanguageWord(r.guide_language) : 'Guide'} (${r.guide_type || 'Egyptologist'}${rateGuideMode(r) !== 'spot' ? `, ${rateGuideMode(r)}` : ''})`,
        rateEur: toNum(r.base_rate_eur || r.rate_eur),
        rateNonEur: toNum(r.base_rate_non_eur || r.rate_non_eur || r.base_rate_eur || r.rate_eur),
        city: r.city,
        details: r.guide_language ? guideLanguageWord(r.guide_language) : r.guide_language,
      })),

      airport_services: (nAirport || []).map((r: any) => ({
        id: r.id,
        name: `${r.airport_code} — ${r.direction || 'both'} (${r.airport_code})`,
        rateEur: toNum(r.rate_eur),
        rateNonEur: toNum(r.rate_eur),
        city: r.airport_code,
        details: `${r.direction || 'both'} | ${r.description || ''}`.trim(),
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
          details: r.description || `${typeLabel} | ${r.hotel_category || 'all'}`,
        }
      }),

      tipping: (nTipping || []).map((r: any) => ({
        id: r.id,
        name: r.role || r.service_code || 'Tip',
        rateEur: toNum(r.rate_eur || r.amount_eur),
        rateNonEur: toNum(r.rate_eur || r.amount_eur),
        details: r.description,
      })),

      boat_rides: (nActivities || [])
        .filter((r: any) => /boat|felucca|motor/i.test(r.activity_name || r.category || ''))
        .map((r: any) => ({
          id: r.id,
          name: r.activity_name,
          rateEur: toNum(r.rate_eur || r.base_rate_eur),
          rateNonEur: toNum(r.rate_non_eur || r.base_rate_non_eur || r.rate_eur || r.base_rate_eur),
          city: r.city,
          details: r.pricing_type,
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
        // Guide fare for the "+1" seat; null = he pays the customer fare.
        guide_rate: r.guide_rate == null ? null : toNum(r.guide_rate),
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
        })),

      meals: (nMeals || []).map((r: any) => ({
        id: r.id,
        name: `${r.meal_type} - ${r.restaurant_name || 'Restaurant'} (${r.city})`,
        rateEur: toNum(r.base_rate_eur || r.rate_eur),
        rateNonEur: toNum(r.base_rate_non_eur || r.rate_non_eur || r.base_rate_eur || r.rate_eur),
        city: r.city,
        category: r.meal_type,
        details: r.restaurant_name,
      })),

      water: [
        { id: 'water-standard', name: 'Water Bottles', rateEur: 0.50, rateNonEur: 0.50, details: 'Per person per day' }
      ],

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
        // The throughout guide's cabin per night, first rate period.
        guide_rate: toNum(seasonsForRow(r, 'cruise')[0]?.rates?.guide_rate),
        supplements: gridSupplements(r, 'cruise'),
      })),
    }

    return NextResponse.json({ success: true, data: rates })
  } catch (error: any) {
    console.error('Failed to fetch grid rates:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
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
