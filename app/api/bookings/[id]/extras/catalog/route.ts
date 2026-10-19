// ============================================
// GET /api/bookings/[id]/extras/catalog — what can be added to this trip
// ============================================
// The lists, one per way an add-on exists:
//
//   EXTRAS FOR THIS PROGRAMME  Sell → Extras offered only with the programme
//                              this trip was built from, at that programme's
//                              price when it has one (20270107 — they were
//                              Tours → Options, per tier, before).
//   ATTRACTION EXTRAS          entrance fees flagged is_sellable_extra — a
//                              site the customer can pay to add. Deliberately
//                              NOT is_addon: that means "not auto-priced", a
//                              different decision that does not imply this one.
//   CATALOGUE EXTRAS           extras_catalogue offered with every booking —
//                              fast-track, luggage, late check-out.
//
// An extra linked to an Activities rate takes its cost from it for this
// trip's group (lib/extras/offered).
//
// Both are PRE-FILLS. Every price is a suggestion the office can change before
// the option is offered, and anything that cannot be priced honestly comes
// back unpriced with the reason attached — never as zero.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { getOrgDefaultMargin, FALLBACK_MARGIN_PERCENT } from '@/lib/org-default-margin'
import { loadFxIndex } from '@/lib/fx-report'
import { convertOnDate } from '@/lib/fx-conversion'
import {
  priceCatalogItem,
  entranceFeeBasis,
  supplementUpgrades,
  type CatalogItem,
  type Converter,
  type PropertyStay,
} from '@/lib/extras-catalog'
import { getHotelRates, getCruiseRates } from '@/lib/auto-pricing-service'
import { loadOfferedExtras, offeredWith, withActivityCost, type ActivityRateRow, type OfferedExtra } from '@/lib/extras/offered'
import { createRateNormalizer } from '@/lib/rates/rate-currency'

export const dynamic = 'force-dynamic'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id } = await params

  const { data: booking } = await admin
    .from('bookings')
    .select('id, currency, itinerary_id, num_adults, num_children')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const bookingCurrency = booking.currency || 'EUR'
  const [rateCurrency, orgMargin, fxIndex] = await Promise.all([
    getOrgRateCurrency(admin, orgId),
    getOrgDefaultMargin(admin, orgId),
    loadFxIndex(admin),
  ])
  const marginPercent = orgMargin ?? FALLBACK_MARGIN_PERCENT

  // Today's rate: a pre-fill is a quote being prepared now, not a historical
  // line being restated. Null when there is no rate, which the pricing turns
  // into an unpriced item rather than a guess.
  const convert: Converter = (amount, from, to) =>
    convertOnDate(fxIndex, amount, from, to, new Date().toISOString()).amount

  // Per-row currency (operator, 1 Sep): a rate row may name the currency it
  // was entered in, and it wins over the org's. An entrance fee stored as
  // EGP 150 was being priced as if it were 150 of the ORG's currency (USD) —
  // the picker literally read "converted from USD · we pay $150" for a row
  // that says EGP. Rows with no rate_currency still fall back to the org's,
  // which is what every rate table did before the column existed.
  const price = (
    cost: unknown,
    sellingOverride: unknown,
    row?: { rate_currency?: string | null }
  ) =>
    priceCatalogItem({
      cost,
      sellingOverride,
      marginPercent,
      rateCurrency: row?.rate_currency || rateCurrency,
      bookingCurrency,
      convert,
    })

  // ---------- extras: this programme's, then every booking's ----------
  const packageItems: CatalogItem[] = []
  const catalogueItems: CatalogItem[] = []
  const templateId = await templateForBooking(booking.itinerary_id, orgId)
  const pax = Math.max(1, (Number(booking.num_adults) || 0) + (Number(booking.num_children) || 0))
  const { extras, activities } = await loadOfferedExtras(admin, orgId, templateId)
  // An activity-linked extra's cost is the activity's, which may be in
  // another currency than the extra: both are brought into the org's rate
  // currency first, then priced as one row.
  const normalizer = createRateNormalizer(rateCurrency)
  const activityRows = (await normalizer.normalize('activity_rates', [...activities.values()] as unknown as Record<string, unknown>[])) as unknown as ActivityRateRow[]
  const activityById = new Map(activityRows.map(a => [a.id, a]))
  for (const raw of extras) {
    let c: OfferedExtra = raw
    let currencyRow: { rate_currency?: string | null } = raw
    if (raw.activity_rate_id) {
      const [inOrgCurrency] = (await normalizer.normalize('extras_catalogue', [raw] as unknown as Record<string, unknown>[])) as unknown as OfferedExtra[]
      // A booking does not record passport type: the non-EUR rate, as for
      // attraction extras (entranceFeeBasis), and the note says so.
      c = withActivityCost(inOrgCurrency ?? raw, activityById.get(raw.activity_rate_id), pax, false)
      currencyRow = { rate_currency: rateCurrency }
    }
    // A selling price the operator set IS the price (off-margin); blank means
    // cost plus the org's margin. The row names its own currency (20260902).
    const priced = price(c.supplier_cost, c.selling_price, currencyRow)
    const activity = raw.activity_rate_id ? activityById.get(raw.activity_rate_id) : undefined
    const basis = raw.activity_rate_id
      ? `cost from Activities${activity?.activity_name ? ` (${activity.activity_name})` : ''}, non-EUR rate, ${pax} traveller${pax === 1 ? '' : 's'}`
      : null
    const item: CatalogItem = {
      source_kind: 'catalogue_extra',
      source_id: String(c.id),
      title: String(c.name),
      subtitle: [c.category, c.description, c.unit === 'per_booking' ? 'per booking' : 'per person']
        .filter(Boolean)
        .join(' · ') || null,
      supplier_id: c.supplier_id ?? null,
      ...priced,
      price_note: [basis, c.programme_price ? "this programme's price" : null, priced.price_note].filter(Boolean).join(', '),
      currency: bookingCurrency,
    }
    if (offeredWith(c) === 'programmes') packageItems.push(item)
    else catalogueItems.push(item)
  }

  // ---------- attraction extras (sellable sites) ----------
  const addonItems: CatalogItem[] = []
  const { data: addons, error: addonError } = await admin
    .from('entrance_fees')
    .select('id, attraction_name, city, eur_rate, non_eur_rate, rate_currency, is_sellable_extra, is_active, addon_note, supplier_id')
    // This company's attractions (entrance_fees.org_id, 20261206).
    .eq('org_id', orgId)
    .eq('is_sellable_extra', true)
  if (addonError) console.error('extras catalog: sellable attraction extras', addonError)

  for (const a of addons ?? []) {
    if (a.is_active === false) continue
    const { cost, basis } = entranceFeeBasis(a)
    const priced = price(cost, null, a)
    addonItems.push({
      source_kind: 'entrance_fee',
      source_id: String(a.id),
      title: String(a.attraction_name),
      subtitle: [a.city, a.addon_note].filter(Boolean).join(' · ') || null,
      supplier_id: a.supplier_id ?? null,
      ...priced,
      // The basis matters: a booking does not record passport type, so the
      // office has to be told which rate this price came from.
      price_note: basis ? `${basis}, ${priced.price_note}` : priced.price_note,
      currency: bookingCurrency,
    })
  }

  // ---------- the trip's own hotels and ship: their supplements as upgrades ----------
  // The properties are resolved the way the engine priced the trip — by the
  // night's city and the itinerary's tier — and each supplement is priced for
  // the stay, night by night at its own period. Offered as UPGRADES: the
  // customer already has the room; this is the view, the deck, the meal plan
  // on top of it.
  const supplementItems: CatalogItem[] = []
  for (const u of supplementUpgrades(await staysForItinerary(booking.itinerary_id, orgId))) {
    const priced = price(u.costPerPerson, null, { rate_currency: u.rateCurrency })
    supplementItems.push({
      source_kind: 'accommodation_supplement',
      source_id: u.rowId,
      item_id: `accommodation_supplement:${u.rowId}:${u.key}`,
      kind: 'upgrade',
      title: `${u.name} — ${u.propertyName}`,
      subtitle: `${u.entity === 'cruise' ? 'cruise' : 'hotel'} supplement [${u.key}] · ${u.nights} night${u.nights === 1 ? '' : 's'} · per person for the stay`,
      supplier_id: u.supplierId,
      ...priced,
      price_note: u.costPerPerson == null ? u.basis : `${u.basis}, ${priced.price_note}`,
      currency: bookingCurrency,
    })
  }

  return NextResponse.json({
    currency: bookingCurrency,
    rate_currency: rateCurrency,
    margin_percent: marginPercent,
    groups: [
      { source: 'package', label: 'Extras for this programme', items: packageItems },
      { source: 'supplement', label: "Upgrades at this trip's hotels and ship", items: supplementItems },
      { source: 'addon', label: 'Attraction extras', items: addonItems },
      { source: 'catalogue', label: 'Extras', items: catalogueItems },
    ].filter(g => g.items.length > 0),
  })
}

/** The trip's stays — one per property, with the dates of its nights — found
 *  the way the engine finds them: each hotel night's city and the itinerary's
 *  tier; the cruise by tier over the days flagged as cruise days. A city with
 *  no rate at the tier is simply absent here (the trip's own pricing already
 *  reported that hole). */
async function staysForItinerary(itineraryId: string | null | undefined, orgId: string): Promise<PropertyStay[]> {
  if (!itineraryId) return []
  const { data: itinerary } = await admin
    .from('itineraries')
    .select('id, tier')
    .eq('id', itineraryId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!itinerary) return []
  const tier = String(itinerary.tier || 'standard')

  const { data: days } = await admin
    .from('itinerary_days')
    .select('day_number, date, city, overnight_city, hotel_included, is_cruise_day, day_type, overnight')
    .eq('itinerary_id', itineraryId)
    .order('day_number', { ascending: true })

  const hotelNights = new Map<string, string[]>()
  const cruiseNights: string[] = []
  for (const d of days ?? []) {
    const date = typeof d.date === 'string' ? d.date.slice(0, 10) : null
    if (!date) continue
    if (d.is_cruise_day) { cruiseNights.push(date); continue }
    // A bed is booked unless the day says otherwise: the last day and a day
    // marked no-overnight have none.
    if (d.hotel_included === false || d.overnight === false || d.day_type === 'departure') continue
    const city = String(d.overnight_city || d.city || '').trim()
    if (!city) continue
    const list = hotelNights.get(city) ?? []
    list.push(date)
    hotelNights.set(city, list)
  }

  const stays: PropertyStay[] = []
  for (const [city, dates] of hotelNights) {
    const hotel = await getHotelRates(orgId, city, tier, false, dates[0])
    if (hotel?.row) stays.push({ entity: 'accommodation', row: hotel.row, name: hotel.hotelName, dates })
  }
  if (cruiseNights.length > 0) {
    const cruise = await getCruiseRates(orgId, tier, undefined, false, cruiseNights[0])
    if (cruise?.row) stays.push({ entity: 'cruise', row: cruise.row, name: cruise.shipName, dates: cruiseNights })
  }
  return stays
}

/** The tour template this trip was built from, if it was built from one. */
async function templateForBooking(
  itineraryId: string | null | undefined,
  orgId: string
): Promise<string | null> {
  if (!itineraryId) return null
  const { data } = await admin
    .from('itineraries')
    .select('template_id')
    .eq('id', itineraryId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data?.template_id ?? null
}
