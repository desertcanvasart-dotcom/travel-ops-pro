import { BASIS_SLOTS, itemCost } from '@/app/pricing-grid/lib/item-basis'
import { insertItineraryWithCode } from '@/lib/itineraries/itinerary-code'
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { randomBytes } from 'crypto'
import { createServerClient } from '@/lib/supabase-server'
import { gridCompleteness } from '@/app/pricing-grid/lib/grid-completeness'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { getOrgDefaultMargin, resolveMarginPercent } from '@/lib/org-default-margin'
import { DEFAULT_DAY_TYPE } from '@/app/pricing-grid/types'
import { soldItems, customAmountSold } from '@/app/pricing-grid/lib/guide-rule'
import { soldAccommodationItems, ratesOn, rateOn, throughoutGuideRows } from '@/app/pricing-grid/lib/sold-lines'
import { fillTipRoles, type TipRoleReader } from '@/lib/pricing/tip-roles'
import { dayDate } from '@/lib/rates/date-window'
import { isOwnAddress, loadOwnAddresses } from '@/lib/email/own-address'
import { gridOvernightCities } from '@/lib/itineraries/grid-overnight'
import { quoteRefsInOrg, quoteRefNotFound } from '@/lib/b2b/quote-scope'
import { rowInOrg } from '@/lib/api/org-scope'
import { roundToCurrency } from '@/lib/currency-totals'
import { seasonForDate, type SeasonWindow } from '@/lib/pricing/season-uplift'
import { sellingFromCost } from '@/app/pricing-grid/lib/calculator'
import { hydrateDays } from '@/app/pricing-grid/lib/hydrate-items'
import { fixedCostsForDay, dropLegacyFixedCostPicks } from '@/app/pricing-grid/lib/fixed-cost-lines'
import { applyStoredPrices, storedUnitPrice, type StoredPrice, type StoredServiceRow } from '@/app/pricing-grid/lib/saved-price'
import { fetchRunExchangeRates } from '@/lib/rates/fx-source'
import type { ExchangeRates } from '@/lib/currency-service'
import { loadGridRateOptions } from '../rate-options'

/**
 * What a slot SELLS — the lines the save writes, and so the stored total:
 * the guide switch (guide-rule.ts) and, on the accommodation row, the single
 * supplement for a party of one only (sold-lines.ts). The calculator charges
 * exactly these; anything else here would be a cost the quote never charged.
 */
function soldSlotItems(slot: any, pax: number, withGuide: boolean): any[] {
  const items = soldItems<any>(slot, withGuide)
  return slot.slotId === 'accommodation' ? soldAccommodationItems(items, pax) : items
}

/** Add-ons under a hotel / cruise pick (see app/pricing-grid/types). */
const isAddOnItem = (item: { rateId?: string }) =>
  Boolean(item.rateId && (item.rateId.endsWith('_supp') || item.rateId.includes('#supp:')))
const baseRateId = (rateId: string) => rateId.replace(/_supp$/, '').replace(/#supp:.*$/, '')

// Every table a grid line can name a rate of (lib/pricing-grid rates route).
const GRID_RATE_TABLES = [
  'transportation_rates', 'guide_rates', 'airport_staff_rates', 'hotel_staff_rates', 'tipping_rates',
  'activity_rates', 'accommodation_rates', 'entrance_fees', 'meal_rates', 'nile_cruises', 'flight_rates',
  'b2b_transport_packages',
] as const
const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

// ============================================
// POST /api/pricing-grid/save
// Save pricing grid state → itineraries + itinerary_days + itinerary_services
// ============================================

// L8: the prior implementation used Math.random() in the 1000-9999 range,
// giving only 9000 codes per year. Birthday-paradox collision probability
// becomes meaningful at very modest volume. randomBytes(4).toString('hex') gives
// ~4.3B values (8 hex chars), reducing collision probability to negligible
// across any realistic per-year throughput.
function generateItineraryCode(): string {
  const year = new Date().getFullYear()
  const random = randomBytes(4).toString('hex').toUpperCase()
  return `ITN-S-${year}-${random}`  // S = from pricing grid (slot-based)
}

// L9: do date math in UTC. The prior implementation used new Date(dateStr)
// (which parses 'YYYY-MM-DD' as UTC midnight), mutated with setDate (which
// operates in LOCAL time), then formatted with toISOString().split('T')[0]
// (UTC again). In negative-UTC-offset timezones this can shift the
// resulting date back by one day on the boundary, so per-day dates and the
// computed end_date would drift on servers configured to non-UTC. Using
// the UTC-prefixed accessors avoids the local-offset interaction entirely.
function addDays(dateStr: string, numDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const ts = Date.UTC(y, (m || 1) - 1, d || 1)
  const shifted = new Date(ts)
  shifted.setUTCDate(shifted.getUTCDate() + numDays)
  return shifted.toISOString().split('T')[0]
}

// Slot → service_type mapping. Service types are the canonical singular
// (lib/service-types.ts) — the plural here is the SLOT id, which keeps its
// name (AUT-L02: this map used to emit the plural as a service type, so the
// grid and the AI writer populated the same column in two spellings).
const SLOT_TO_SERVICE: Record<string, string> = {
  route: 'transportation',
  guide: 'guide',
  airport_services: 'airport_service',
  hotel_services: 'hotel_service',
  tipping: 'tips',
  boat_rides: 'activity',
  accommodation: 'accommodation',
  entrance_fees: 'entrance',
  flights: 'flight',
  experiences: 'activity',
  meals: 'meal',
  cruise: 'cruise',
  other_group: 'extra',
  other_pp: 'extra',
}

const GROUP_SLOTS = new Set([
  'route', 'guide', 'airport_services', 'hotel_services',
  'tipping', 'boat_rides', 'other_group'
])

/**
 * The org's premium windows covering the departure — the query
 * loadSeasonWindows (lib/auto-pricing-service) makes for the B2B engine,
 * here so the save does not take the browser's word for the premium.
 */
async function seasonWindowsOn(supabase: any, orgId: string, departure: string | null): Promise<SeasonWindow[]> {
  if (!departure) return []
  const on = departure.slice(0, 10)
  const { data, error } = await supabase
    .from('pricing_season_dates')
    .select('season_id, start_date, end_date, pricing_seasons!inner(name, uplift_percent, is_active)')
    .eq('org_id', orgId)
    .lte('start_date', on)
    .gte('end_date', on)
    .eq('pricing_seasons.is_active', true)
  if (error || !Array.isArray(data)) return []
  return (data as any[]).map(row => ({
    seasonId: String(row.season_id),
    name: String(row.pricing_seasons?.name ?? ''),
    upliftPercent: Number(row.pricing_seasons?.uplift_percent) || 0,
    startDate: String(row.start_date),
    endDate: String(row.end_date),
  }))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The stored price, in the rate currency, of each itinerary_services row the
 * request names (SelectedItem.serviceId) — only rows of `itineraryId`, which
 * the caller has checked is this company's. A row of another trip or another
 * company is simply not found. Also each row's supplier, kept with its price.
 */
async function storedLinePrices(
  supabase: any,
  itineraryId: string,
  postedDays: any[],
  ctx: { itineraryCurrency: string | null; rateCurrency: string },
): Promise<{ prices: Map<string, StoredPrice>; supplierIds: Map<string, string> }> {
  const prices = new Map<string, StoredPrice>()
  const supplierIds = new Map<string, string>()
  // Only uuids: one malformed id in the IN list fails the whole lookup.
  const ids = [...new Set((postedDays || []).flatMap((d: any) => (d?.slots || []).flatMap((sl: any) =>
    (sl?.selectedItems || []).map((i: any) => (typeof i?.serviceId === 'string' ? i.serviceId : '')))))]
    .filter((id): id is string => UUID.test(id))
  if (ids.length === 0) return { prices, supplierIds }
  const { data, error } = await supabase
    .from('itinerary_services')
    .select('id, rate_eur, rate_non_eur, supplier_id, supplier_currency, exchange_rate_used, itinerary_days!inner(itinerary_id)')
    .in('id', ids)
    .eq('itinerary_days.itinerary_id', itineraryId)
  if (error) {
    console.warn('[pricing-grid save] stored line prices not read:', error.message)
    return { prices, supplierIds }
  }
  let fxRates: ExchangeRates | null | undefined
  for (const row of (data || []) as Array<StoredServiceRow & { supplier_id?: string | null; itinerary_days?: { itinerary_id?: string } }>) {
    if (row.itinerary_days?.itinerary_id !== itineraryId) continue
    let price = storedUnitPrice(row, { ...ctx })
    if (!price) {
      // Today's rates, read once and only when a line needs converting.
      if (fxRates === undefined) fxRates = await fetchRunExchangeRates().catch(() => null)
      price = storedUnitPrice(row, { ...ctx, fxRates })
    }
    if (!price) continue
    prices.set(row.id, price)
    if (row.supplier_id) supplierIds.set(row.id, row.supplier_id)
  }
  return { prices, supplierIds }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const body = await request.json()
    // The body's `totals` are not read: the save prices every line and the
    // premium itself, from this company's rates (see below).
    const { config, days: postedDays } = body

    if (!config || !postedDays || !Array.isArray(postedDays)) {
      return NextResponse.json({ success: false, error: 'Missing config or days' }, { status: 400 })
    }

    const callerOrgId = await getCurrentOrgId()
    if (!callerOrgId) {
      return NextResponse.json({ success: false, error: 'No organization' }, { status: 403 })
    }

    // Every rate a line names must be THIS company's — checked before anything
    // is written: a grid tab could pin another company's rate (its price, its
    // supplier) into this company's trip. The id is the rate row's uuid, before
    // any vehicle (`__van`) or supplement (`_supp`, `#supp:`) suffix. A rate
    // that no longer exists is no one's and saves as before.
    const pinnedIds = [...new Set((postedDays as Array<{ slots?: Array<{ selectedItems?: Array<{ rateId?: unknown }> }> }>)
      .flatMap(d => (d.slots || []).flatMap(sl => (sl.selectedItems || []).map(i => String(i.rateId ?? '').match(UUID_PREFIX)?.[0])))
      .filter((x): x is string => !!x))]
    if (pinnedIds.length) {
      const foreign = await Promise.all(GRID_RATE_TABLES.map(tbl => supabase
        .from(tbl)
        .select('id')
        .in('id', pinnedIds)
        .neq('org_id', callerOrgId)
        .limit(1)))
      if (foreign.some(r => (r.data ?? []).length > 0)) {
        return NextResponse.json(
          { success: false, error: 'A selected rate belongs to another company. Reload the grid and choose again.' },
          { status: 400 }
        )
      }
    }

    // The partner and the client the trip is linked to must be this
    // company's: a crafted body attached another company's partner, and every
    // screen that joins it then showed that company's partner here. The same
    // check quote-from-itinerary makes on the quote it builds from this trip.
    const partnerId = config.clientType === 'b2b' && typeof config.partnerId === 'string' && config.partnerId ? config.partnerId : null
    if (!(await quoteRefsInOrg(supabase, callerOrgId, { partner_id: partnerId }))) return quoteRefNotFound()
    const clientId = typeof config.clientId === 'string' && config.clientId ? config.clientId : null
    if (clientId && !(await rowInOrg(supabase, 'clients', clientId, callerOrgId))) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 })
    }

    // A tip from a grid tab opened before tips carried their role is given it
    // from its rate row, so the guide switch below decides by role (tip-roles.ts).
    await fillTipRoles(supabase as unknown as TipRoleReader, callerOrgId, postedDays)
    const withGuide = config.withGuide !== false
    const paxN = Math.min(Math.max(Math.floor(Number(config.pax)) || 1, 1), 999)

    // EVERY PRICE FROM THE STORED RATES. The save priced each line from the
    // fields the request carried (rateEur, periods, guide rate, basis …), so a
    // stale tab, a draft restored from the browser or an edited body saved
    // whatever prices it held. Each pick is rebuilt here from this company's
    // rate options — the ones the grid lists (rate-options.ts) — by its id,
    // with the route's vehicle sized for the group. A pick whose rate is gone
    // has no price, and the save says so — unless it is a line of this trip
    // with a stored price (below). Only typed amounts are the operator's own.
    // All of it is in the org's rate currency.
    const isUpdate = !!config.itineraryId
    const now = new Date().toISOString()

    // An update rewrites the trip and deletes and re-creates its days, on the
    // service role. It was addressed by id alone, so a manager in one org could
    // overwrite another org's trip. Refuse anything not this org's, before any
    // write.
    let itineraryCurrency: string | null = null
    if (isUpdate) {
      const { data: owned } = await supabase
        .from('itineraries')
        .select('id, currency')
        .eq('id', config.itineraryId)
        .eq('org_id', callerOrgId)
        .maybeSingle()
      if (!owned) {
        return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
      }
      itineraryCurrency = owned.currency ?? null
    }

    const { rates: gridRates, rateCurrency, fixedCosts } = await loadGridRateOptions(supabase, callerOrgId, null)
    // A line of the trip being re-saved that has no current rate (none
    // stored, or since deleted or switched off) keeps the price it was saved
    // with — read here from ITS row of THIS trip, never from the request
    // (saved-price.ts). It was saved at 0, losing the trip's real price.
    const { prices: storedPrices, supplierIds: storedSupplierIds } = isUpdate
      ? await storedLinePrices(supabase, config.itineraryId, postedDays, { itineraryCurrency, rateCurrency })
      : { prices: new Map<string, StoredPrice>(), supplierIds: new Map<string, string>() }
    // The old Water pick of a trip drafted or saved before the grid charged
    // Rates › Fixed Costs itself is dropped: the automatic lines below replace
    // it (fixed-cost-lines.ts), never in addition.
    const { days, unpriced } = hydrateDays(applyStoredPrices(dropLegacyFixedCostPicks(postedDays as any[]), storedPrices), gridRates, paxN)

    // Completeness signal (harness consolidation Phase B). The grid saves a
    // DRAFT, so this does NOT block the save (you build incrementally) — it is
    // returned so the UI can surface "needs attention". The hard gate is the
    // send/output path (Phase 2 pricing-guards), which blocks non-deliverable
    // prices before they reach a customer.
    const completeness = gridCompleteness(days, { ...config, pax: paxN })

    // One margin for every line and the header: the one asked for, else the
    // company's default (it was the request's figure on the lines and the
    // default only on the header).
    const marginPct = Math.min(Math.max(resolveMarginPercent({ requested: config.marginPercent, orgDefault: await getOrgDefaultMargin(supabase, callerOrgId) }), 0), 100)

    // The office's own address is never saved as the client's (own-address.ts):
    // filled from the From of a message the office sent, it became the
    // client's email. Dropped with a warning; a failed lookup blocks nothing.
    const warnings: string[] = []
    // The built-in water default, or a fixed cost left out because its
    // currency has no exchange rate: never silent (lib/fixed-costs.ts).
    warnings.push(...(fixedCosts?.warnings ?? []))
    if (config.clientEmail) {
      try {
        const own = await loadOwnAddresses(supabase, await getCurrentOrgId())
        if (isOwnAddress(own, config.clientEmail)) {
          warnings.push(`${config.clientEmail} is one of your own addresses, so it was not saved as the client's email. Add the client's own email.`)
          config.clientEmail = ''
        }
      } catch (e) {
        console.warn('[pricing-grid save] own-address check skipped:', e instanceof Error ? e.message : e)
      }
    }

    // --- 2. Build the new days (NOT yet written) ---
    // H31: the old code deleted existing days/services and then inserted the
    // new ones in separate, non-transactional round-trips — a mid-save failure
    // wiped the itinerary. We now build the full day+service payload here and
    // hand it to the save_pricing_grid_days() RPC for a single atomic
    // delete+insert (see step 5). So this section only PREPARES rows.
    //
    // Consolidation Phase B (rich gate): persist day_type + per-day component
    // overrides so the rich gridCompleteness() can read them on the next load
    // and decide what each day requires. The 7 override fields stay NULL
    // (meaning "use the preset's default").
    // Each night is where its bed is — the hotel picked that day (its city in
    // Rates), the ship, or the night before's when nothing moves the party —
    // not the day's sightseeing city: a day trip to Alexandria from a Cairo
    // hotel said "Overnight in Alexandria" (lib/itineraries/overnight-city.ts).
    const startDate = config.startDate || now.split('T')[0]
    const numbered = days.map((day: any, idx: number) => ({ ...day, dayNumber: day.dayNumber || idx + 1 }))
    const overnightByDay = await gridOvernightCities(supabase as unknown as Parameters<typeof gridOvernightCities>[0], callerOrgId, numbered)
    const dayInserts = days.map((day: any, idx: number) => ({
      day_number: day.dayNumber || idx + 1,
      title: day.title || `Day ${idx + 1}`,
      description: day.description || '',
      city: day.city || '',
      overnight_city: overnightByDay.get(day.dayNumber || idx + 1) ?? '',
      date: addDays(startDate, idx),
      // Day-type preset. Send DEFAULT_DAY_TYPE explicitly rather than NULL —
      // the RPC inserts day_type as given; the column is NOT NULL with a CHECK.
      day_type: day.dayType ?? DEFAULT_DAY_TYPE,
      // Per-component overrides (NULL = use the preset's default)
      overnight: day.overnight ?? null,
      has_sightseeing: day.hasSightseeing ?? null,
      airport_arrival: day.airportArrival ?? null,
      airport_departure: day.airportDeparture ?? null,
      hotel_check_in: day.hotelCheckIn ?? null,
      hotel_check_out: day.hotelCheckOut ?? null,
      intercity: day.intercity ?? null,
    }))

    // --- 4. Build service inserts ---
    // Two changes vs. the previous version (both Phase 3 step 1 and a
    // long-standing gap revealed by it):
    //   1. client_price is now set on every service. Previously it was always
    //      NULL — the view at /itineraries/[id] would render EUR 0.00 when
    //      total_cost on the itinerary header was 0 because no per-service
    //      client price existed for it to fall back to.
    //   2. supplier_id is resolved via a batched lookup against the rate
    //      tables (one query per relevant table). The slot's SelectedItem
    //      carries only rateId today — the rate row carries the FK. We
    //      attach it here so the supplier_id leak the AI pipeline previously
    //      had (now fixed in lib/ai/service-creation.ts) doesn't reopen on
    //      the pricing-grid path.
    const grossUp = (n: number) => roundToCurrency(n * (1 + marginPct / 100), rateCurrency)

    // Pass 1 — collect rateIds per rate-table, grouped by service_type so we
    // know which table to query. Slot → service_type mapping (SLOT_TO_SERVICE)
    // is already established above.
    const rateIdsByTable: Record<string, Set<string>> = {
      accommodation_rates: new Set(),
      transportation_rates: new Set(),
      nile_cruises: new Set(),
      guide_rates: new Set(),
      activity_rates: new Set(),
      meal_rates: new Set(),
      entrance_fees: new Set(),
    }
    const slotToRateTable: Record<string, string> = {
      accommodation: 'accommodation_rates',
      route: 'transportation_rates',
      cruise: 'nile_cruises',
      guide: 'guide_rates',
      experiences: 'activity_rates',
      boat_rides: 'activity_rates',
      meals: 'meal_rates',
      // G2.2: entrance slot resolves its authority supplier from entrance_fees.supplier_id
      entrance_fees: 'entrance_fees',
    }
    for (const day of days) {
      for (const slot of (day.slots || [])) {
        const tbl = slotToRateTable[slot.slotId]
        if (!tbl) continue
        for (const item of (slot.selectedItems || [])) {
          // Only real rate-row ids: the add-ons under a hotel pick — the
          // single supplement (`<id>_supp`) and the agency's supplements
          // (`<id>#supp:<key>`) — are not rows, and one non-uuid in the IN
          // list fails the whole lookup, dropping supplier_id for every
          // item in that table on this save.
          if (item.rateId && !isAddOnItem(item)) rateIdsByTable[tbl].add(item.rateId)
        }
      }
    }

    // Pass 2 — batched lookup. One query per table, only when there are IDs.
    // This company's rows only (another company's were refused above).
    const supplierIdByRateId = new Map<string, string>()
    for (const [tbl, ids] of Object.entries(rateIdsByTable)) {
      if (!ids.size) continue
      const { data: rows, error: lookupErr } = await supabase
        .from(tbl)
        .select('id, supplier_id')
        .eq('org_id', callerOrgId)
        .in('id', Array.from(ids))
      if (lookupErr) {
        // Non-fatal — log and continue. The service rows just won't carry
        // supplier_id on this save; existing UI rate selection isn't blocked.
        console.warn(`[pricing-grid save] supplier_id lookup on ${tbl} failed:`, lookupErr.message)
        continue
      }
      for (const r of (rows || [])) {
        if (r.supplier_id) supplierIdByRateId.set(r.id, r.supplier_id)
      }
    }

    // Flat list (for sanitization + total reconciliation) plus a grouping by
    // day_number for the RPC payload. The SAME object reference is pushed into
    // both, so the sanitization pass below mutates them once. The RPC resolves
    // each service's itinerary_day_id from the freshly-inserted day inside the
    // transaction, so we no longer carry a client-side day id here.
    const serviceInserts: any[] = []
    const servicesByDay = new Map<number, any[]>()
    const pushService = (dayNumber: number, svc: any) => {
      serviceInserts.push(svc)
      const list = servicesByDay.get(dayNumber)
      if (list) list.push(svc)
      else servicesByDay.set(dayNumber, [svc])
    }

    days.forEach((day: any, idx: number) => {
      const dayNumber = day.dayNumber || idx + 1
      const slots = day.slots || []
      // The day's own date: each line at the rate period that covers it, as
      // the grid priced it (it wrote each rate's base price, the first period).
      const on = dayDate(config.startDate, dayNumber || idx + 1)
      for (const slot of slots) {
        const serviceType = SLOT_TO_SERVICE[slot.slotId]
        if (!serviceType) continue
        const isGroup = GROUP_SLOTS.has(slot.slotId)
        const passport = config.passport || 'non_eu'

        // Custom amount slots — no rateId, no canonical supplier. Guide off
        // sells no typed guide or tipping amount (guide-rule.ts).
        if (slot.customAmount > 0) {
          if (!customAmountSold(slot.slotId, withGuide)) continue
          const supplierCost = isGroup ? slot.customAmount : slot.customAmount * paxN
          pushService(dayNumber, {
            service_type: serviceType,
            service_name: slot.slotId === 'other_group' ? 'Other (Group)' : 'Other (Per Person)',
            quantity: isGroup ? 1 : paxN,
            rate_eur: slot.customAmount,
            rate_non_eur: slot.customAmount,
            total_cost: supplierCost,
            client_price: grossUp(supplierCost),
            supplier_id: null,
            notes: `__grid:custom_amount|slot:${slot.slotId}`,
          })
          continue
        }

        // Selected items — only what is SOLD (the guide switch; the single
        // supplement for a party of one), at the day's rate.
        for (const item of soldSlotItems(slot, paxN, withGuide)) {
          const dated = ratesOn(item, on)
          const rate = passport === 'eu' ? dated.rateEur : dated.rateNonEur
          // Airport / hotel services and activities: quantity and total by the
          // item's own basis (per group / per person / per unit).
          const byBasis = BASIS_SLOTS.has(slot.slotId) ? itemCost(slot.slotId, item, Number(rate) || 0, paxN) : null
          const supplierCost = byBasis ? byBasis.lineTotal : isGroup ? rate : rate * paxN
          pushService(dayNumber, {
            service_type: serviceType,
            service_name: item.name,
            quantity: byBasis ? byBasis.quantity : isGroup ? 1 : paxN,
            rate_eur: dated.rateEur,
            rate_non_eur: dated.rateNonEur,
            total_cost: supplierCost,
            client_price: grossUp(supplierCost),
            // An add-on carries its property's supplier: the id before the marker.
            // A line kept at its saved price keeps its row's supplier.
            supplier_id: item.savedPrice && item.serviceId
              ? (storedSupplierIds.get(item.serviceId) ?? null)
              : item.rateId ? (supplierIdByRateId.get(baseRateId(item.rateId)) ?? null) : null,
            notes: `__grid:slot:${slot.slotId}|rate_id:${item.rateId}`,
          })
        }
      }

      // Rates › Fixed Costs: every active cost as its own line, per person, on
      // a sightseeing day — read from the table here (never from the request),
      // at the same amounts the screen showed. The save RPC matches a line by
      // day + type + name and updates it in place, so a re-save replaces these
      // lines rather than adding to them.
      for (const cost of fixedCostsForDay(day, { withGuide, fixedCosts: fixedCosts?.items })) {
        const supplierCost = cost.perPersonPerDay * paxN
        pushService(dayNumber, {
          service_type: 'supplies',
          service_name: cost.name,
          quantity: paxN,
          rate_eur: cost.perPersonPerDay,
          rate_non_eur: cost.perPersonPerDay,
          total_cost: supplierCost,
          client_price: grossUp(supplierCost),
          supplier_id: null,
          // Names no real slot: a reload leaves it out of the day's picks (slot-mapping).
          notes: '__grid:slot:fixed_cost',
        })
      }

      // The throughout guide's own costs — his bed, his seats, his meals at
      // three or fewer (sold-lines.ts) — as GROUP lines. They are in the
      // grid's price, so they are in the stored total. Their tag names no real
      // slot, so a reload leaves them out of the day's picks (slot-mapping).
      for (const row of throughoutGuideRows(slots, { ...config, pax: paxN, passport: config.passport || 'non_eu', withGuide }, on)) {
        pushService(dayNumber, {
          service_type: row.serviceType,
          service_name: row.name,
          quantity: 1,
          rate_eur: row.amount,
          rate_non_eur: row.amount,
          total_cost: row.amount,
          client_price: grossUp(row.amount),
          supplier_id: null,
          notes: `__grid:slot:throughout_guide|${row.kind}`,
        })
      }
    })

    // Sanitize all service numeric values
    for (const svc of serviceInserts) {
      svc.rate_eur = Math.round((svc.rate_eur || 0) * 100) / 100
      svc.rate_non_eur = Math.round((svc.rate_non_eur || 0) * 100) / 100
      svc.total_cost = roundToCurrency(svc.total_cost || 0, rateCurrency)
      svc.client_price = roundToCurrency(svc.client_price || 0, rateCurrency)
      svc.quantity = Math.min(svc.quantity || 1, 999)
    }

    // THE STORED TOTAL — the grid's own rule (sellingFromCost): the lines'
    // whole cost, the margin once, rounded once in the rate currency, plus
    // the premium for the departure date from this company's calendar (it
    // was taken from the request). The screen computes the same.
    const supplierTotal = serviceInserts.reduce((sum, svc) => sum + (svc.total_cost || 0), 0)
    const season = seasonForDate(await seasonWindowsOn(supabase, callerOrgId, startDate), startDate)
    const { seasonUplift, sellingPriceTotal } = sellingFromCost({ totalCost: supplierTotal, marginPercent: marginPct, season, currency: rateCurrency })

    // B2B: the partner's commission on the trip is the PARTNER's commission
    // (b2b_partners.commission_percent), as every other writer of this column
    // stores it (b2b quote convert) — not this agency's own margin.
    let partnerCommission = 0
    if (partnerId) {
      const { data: partner } = await supabase
        .from('b2b_partners')
        .select('commission_percent')
        .eq('id', partnerId)
        .eq('org_id', callerOrgId)
        .maybeSingle()
      partnerCommission = Number(partner?.commission_percent) || 0
    }

    if (unpriced.length > 0) {
      const names = [...new Set(unpriced.map(u => u.name || u.rateId))].join(', ')
      warnings.push(`No current rate for ${names} — saved with no price. Pick a rate or type an amount.`)
    }

    // --- 3. Create or update the itinerary — after its lines are built,
    // because its total is theirs. Each line's client_price is the line ×
    // margin rounded on its own; the header is rounded once on the whole, so
    // the lines may add up to a cent or two off it. The header is the quote.
    const endDate = addDays(startDate, Math.max(days.length - 1, 0))

    const itineraryData: Record<string, any> = {
      client_name: config.clientName || 'Unnamed Client',
      client_email: config.clientEmail || null,
      client_phone: config.clientPhone || null,
      trip_name: config.tourName || 'Untitled Trip',
      start_date: startDate,
      end_date: endDate,
      total_days: days.length,
      num_adults: paxN,
      num_children: 0,
      num_infants: 0,
      // The org's RATE currency — what every amount here is in. It was the
      // currency the grid happened to be showing, over amounts never
      // converted to it: a USD trip shown in JPY was stored as ¥4,321 for
      // $4,321, and a B2B quote built from it divided by ~150.
      currency: rateCurrency,
      total_cost: sellingPriceTotal,
      tier: config.tier || 'standard',
      status: 'draft',
      cost_mode: 'manual',
      // The product the grid was told it is pricing. Older grid saves wrote
      // nothing here, which downstream read back as full-package — now the
      // declared value round-trips, so Calculate-from-edit loads the same
      // package the operator picked.
      package_type: config.packageType || 'full-package',
      source: config.clientType === 'b2b' ? 'b2b_custom' : 'b2c_direct',
      partner_id: partnerId,
      partner_commission_percent: partnerCommission,
      ...(clientId ? { client_id: clientId } : {}),
      updated_at: now,
    }

    let itineraryId: string
    let itineraryCode: string

    // Sanitize numeric values to avoid overflow
    itineraryData.total_cost = Math.min(itineraryData.total_cost || 0, 99999999.99)
    itineraryData.partner_commission_percent = Math.min(Math.max(Math.round((itineraryData.partner_commission_percent || 0) * 100) / 100, 0), 100)
    itineraryData.num_adults = Math.min(itineraryData.num_adults || 1, 999)

    console.log('Pricing grid save - itinerary data:', JSON.stringify(itineraryData, null, 2))

    if (isUpdate) {
      // Update existing itinerary
      const { data, error } = await supabase
        .from('itineraries')
        .update(itineraryData)
        .eq('id', config.itineraryId)
        .eq('org_id', callerOrgId)
        .select('id, itinerary_code')
        .single()

      if (error) throw new Error(`Failed to update itinerary: ${error.message}`)
      itineraryId = data.id
      itineraryCode = data.itinerary_code
    } else {
      // Create new itinerary — M3 Phase 2A requires org_id NOT NULL on
      // itineraries. Resolve from the operator's session.
      const orgId = await getCurrentOrgId()
      if (!orgId) {
        return NextResponse.json(
          { success: false, error: 'No organization context — re-login or contact admin.' },
          { status: 403 }
        )
      }
      itineraryData.org_id = orgId
      itineraryData.created_at = now

      // A taken code draws another (lib/itineraries/itinerary-code), as every
      // other way a trip is created does.
      const { data, error } = await insertItineraryWithCode<{ id: string; itinerary_code: string }>(
        supabase, itineraryData, generateItineraryCode, { select: 'id, itinerary_code' }
      )

      if (error || !data) throw new Error(`Failed to create itinerary: ${error?.message ?? 'no row returned'}`)
      itineraryId = data.id
      itineraryCode = data.itinerary_code

      // Create English version
      await supabase.from('itinerary_versions').insert({
        itinerary_id: itineraryId,
        language: 'en',
        trip_name: itineraryData.trip_name,
        notes: null,
        pickup_location: null,
        guide_notes: null,
        vehicle_notes: null,
      })
    }

    // --- 5. Atomic write: delete old days/services + insert new, in ONE
    // transaction (H31). Attach each day's services and hand the whole payload
    // to the RPC. If any insert fails inside the function it rolls back and the
    // previously-saved days/services are preserved — never wiped.
    const daysPayload = dayInserts.map((d) => ({
      ...d,
      services: servicesByDay.get(d.day_number) || [],
    }))

    const { data: saveResult, error: saveError } = await supabase.rpc('save_pricing_grid_days', {
      p_itinerary_id: itineraryId,
      p_days: daysPayload,
    })

    if (saveError) throw new Error(`Failed to save days/services: ${saveError.message}`)

    const savedCounts = Array.isArray(saveResult) ? saveResult[0] : saveResult

    // The premium on its own (20261124), so documents built from the lines can
    // add it back. A separate write: before the migration the column does not
    // exist, and that must not fail the save.
    {
      const { error: upliftErr } = await supabase
        .from('itineraries')
        .update({ season_uplift_amount: seasonUplift })
        .eq('id', itineraryId)
        .eq('org_id', callerOrgId)
      if (upliftErr) console.warn('[pricing-grid save] season_uplift_amount not stored:', upliftErr.message)
    }

    const daysCreated = Number(savedCounts?.days_inserted ?? days.length)
    const servicesCreated = Number(savedCounts?.services_inserted ?? serviceInserts.length)
    console.log(`Pricing grid saved: ${itineraryCode} — ${daysCreated} days, ${servicesCreated} services`)

    return NextResponse.json({
      success: true,
      itineraryId,
      itineraryCode,
      daysCreated,
      servicesCreated,
      completeness,
      warnings,
      // What the stored amounts are in, and the picks saved with no price.
      currency: rateCurrency,
      totalCost: itineraryData.total_cost,
      unpriced,
    })
  } catch (error: any) {
    console.error('Save pricing grid error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
