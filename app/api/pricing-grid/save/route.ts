import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { randomBytes } from 'crypto'
import { createServerClient } from '@/lib/supabase-server'
import { gridCompleteness } from '@/app/pricing-grid/lib/grid-completeness'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { getOrgDefaultMargin, resolveMarginPercent } from '@/lib/org-default-margin'
import { DEFAULT_DAY_TYPE } from '@/app/pricing-grid/types'

// ============================================
// POST /api/pricing-grid/save
// Save pricing grid state → itineraries + itinerary_days + itinerary_services
// ============================================

// L8: the prior implementation used Math.random() in the 1000-9999 range,
// giving only 9000 codes per year. Birthday-paradox collision probability
// becomes meaningful at very modest volume — and itinerary_code currently
// has no DB UNIQUE constraint, so a collision silently produces two
// itineraries sharing the same code. randomBytes(4).toString('hex') gives
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

// Slot → service_type mapping
const SLOT_TO_SERVICE: Record<string, string> = {
  route: 'transportation',
  guide: 'guide',
  airport_services: 'airport_services',
  hotel_services: 'hotel_services',
  tipping: 'tips',
  boat_rides: 'activity',
  accommodation: 'accommodation',
  entrance_fees: 'entrance',
  flights: 'flight',
  experiences: 'activity',
  meals: 'meal',
  water: 'supplies',
  cruise: 'cruise',
  other_group: 'extra',
  other_pp: 'extra',
}

const GROUP_SLOTS = new Set([
  'route', 'guide', 'airport_services', 'hotel_services',
  'tipping', 'boat_rides', 'other_group'
])

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const body = await request.json()
    const { config, days, totals } = body

    if (!config || !days || !Array.isArray(days)) {
      return NextResponse.json({ success: false, error: 'Missing config or days' }, { status: 400 })
    }

    // Completeness signal (harness consolidation Phase B). The grid saves a
    // DRAFT, so this does NOT block the save (you build incrementally) — it is
    // returned so the UI can surface "needs attention". The hard gate is the
    // send/output path (Phase 2 pricing-guards), which blocks non-deliverable
    // prices before they reach a customer.
    const completeness = gridCompleteness(days, config)

    const isUpdate = !!config.itineraryId
    const now = new Date().toISOString()

    // Server-authoritative pricing total. Sum the exact services we're about to
    // write (the source of truth) so total_cost is never persisted as 0 while the
    // services hold real prices. Prefer the grid's exact client total when sent.
    const paxN = config.pax || 1
    const passport = config.passport || 'non_eu'
    const supplierTotal = (days || []).reduce((sum: number, day: any) => {
      return sum + (day.slots || []).reduce((dsum: number, slot: any) => {
        const isGroup = GROUP_SLOTS.has(slot.slotId)
        if (slot.customAmount > 0) {
          return dsum + (isGroup ? slot.customAmount : slot.customAmount * paxN)
        }
        let line = 0
        for (const item of (slot.selectedItems || [])) {
          const rate = passport === 'eu' ? Number(item.rateEur) || 0 : Number(item.rateNonEur) || 0
          line += isGroup ? rate : rate * paxN
        }
        return dsum + line
      }, 0)
    }, 0)
    const marginPct = resolveMarginPercent({ requested: config.marginPercent, orgDefault: await getOrgDefaultMargin(supabase, await getCurrentOrgId()) })
    const computedSellingTotal = Math.round(supplierTotal * (1 + marginPct / 100) * 100) / 100
    const finalSellingTotal = (totals?.sellingPriceTotal && totals.sellingPriceTotal > 0)
      ? totals.sellingPriceTotal
      : computedSellingTotal

    // --- 1. Create or update itinerary ---
    const startDate = config.startDate || now.split('T')[0]
    const endDate = addDays(startDate, Math.max(days.length - 1, 0))

    const itineraryData: Record<string, any> = {
      client_name: config.clientName || 'Unnamed Client',
      client_email: config.clientEmail || null,
      client_phone: config.clientPhone || null,
      trip_name: config.tourName || 'Untitled Trip',
      start_date: startDate,
      end_date: endDate,
      total_days: days.length,
      num_adults: config.pax || 1,
      num_children: 0,
      num_infants: 0,
      currency: config.currency || 'EUR',
      total_cost: finalSellingTotal,
      tier: config.tier || 'standard',
      status: 'draft',
      cost_mode: 'manual',
      source: config.clientType === 'b2b' ? 'b2b_custom' : 'b2c_direct',
      partner_id: config.partnerId || null,
      partner_commission_percent: config.clientType === 'b2b' ? (config.marginPercent || 0) : 0,
      updated_at: now,
    }

    let itineraryId: string
    let itineraryCode: string

    // Sanitize numeric values to avoid overflow
    itineraryData.total_cost = Math.min(Math.round((itineraryData.total_cost || 0) * 100) / 100, 99999999.99)
    itineraryData.partner_commission_percent = Math.min(Math.max(Math.round((itineraryData.partner_commission_percent || 0) * 100) / 100, 0), 100)
    itineraryData.num_adults = Math.min(itineraryData.num_adults || 1, 999)

    console.log('Pricing grid save - itinerary data:', JSON.stringify(itineraryData, null, 2))

    if (isUpdate) {
      // Update existing itinerary
      const { data, error } = await supabase
        .from('itineraries')
        .update(itineraryData)
        .eq('id', config.itineraryId)
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
      itineraryData.itinerary_code = generateItineraryCode()
      itineraryData.created_at = now

      const { data, error } = await supabase
        .from('itineraries')
        .insert([itineraryData])
        .select('id, itinerary_code')
        .single()

      if (error) throw new Error(`Failed to create itinerary: ${error.message}`)
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
    const dayInserts = days.map((day: any, idx: number) => ({
      day_number: day.dayNumber || idx + 1,
      title: day.title || `Day ${idx + 1}`,
      description: day.description || '',
      city: day.city || '',
      overnight_city: day.city || '',
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
    const marginPctService = Math.min(Math.max(Number(config.marginPercent) || 0, 0), 100)
    const grossUp = (n: number) => Math.round(n * (1 + marginPctService / 100) * 100) / 100

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
          if (item.rateId) rateIdsByTable[tbl].add(item.rateId)
        }
      }
    }

    // Pass 2 — batched lookup. One query per table, only when there are IDs.
    const supplierIdByRateId = new Map<string, string>()
    for (const [tbl, ids] of Object.entries(rateIdsByTable)) {
      if (!ids.size) continue
      const { data: rows, error: lookupErr } = await supabase
        .from(tbl)
        .select('id, supplier_id')
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

    for (const day of days) {
      const dayNumber = day.dayNumber
      const slots = day.slots || []
      for (const slot of slots) {
        const serviceType = SLOT_TO_SERVICE[slot.slotId]
        if (!serviceType) continue
        const isGroup = GROUP_SLOTS.has(slot.slotId)
        const passport = config.passport || 'non_eu'

        // Custom amount slots — no rateId, no canonical supplier
        if (slot.customAmount > 0) {
          const supplierCost = isGroup ? slot.customAmount : slot.customAmount * (config.pax || 1)
          pushService(dayNumber, {
            service_type: serviceType,
            service_name: slot.slotId === 'other_group' ? 'Other (Group)' : 'Other (Per Person)',
            quantity: isGroup ? 1 : (config.pax || 1),
            rate_eur: slot.customAmount,
            rate_non_eur: slot.customAmount,
            total_cost: supplierCost,
            client_price: grossUp(supplierCost),
            supplier_id: null,
            notes: `__grid:custom_amount|slot:${slot.slotId}`,
          })
          continue
        }

        // Selected items — rateId-keyed; supplier_id from batched lookup
        for (const item of (slot.selectedItems || [])) {
          const rate = passport === 'eu' ? item.rateEur : item.rateNonEur
          const supplierCost = isGroup ? rate : rate * (config.pax || 1)
          pushService(dayNumber, {
            service_type: serviceType,
            service_name: item.name,
            quantity: isGroup ? 1 : (config.pax || 1),
            rate_eur: item.rateEur,
            rate_non_eur: item.rateNonEur,
            total_cost: supplierCost,
            client_price: grossUp(supplierCost),
            supplier_id: item.rateId ? (supplierIdByRateId.get(item.rateId) ?? null) : null,
            notes: `__grid:slot:${slot.slotId}|rate_id:${item.rateId}`,
          })
        }
      }
    }

    // Sanitize all service numeric values
    for (const svc of serviceInserts) {
      svc.rate_eur = Math.round((svc.rate_eur || 0) * 100) / 100
      svc.rate_non_eur = Math.round((svc.rate_non_eur || 0) * 100) / 100
      svc.total_cost = Math.round((svc.total_cost || 0) * 100) / 100
      svc.client_price = Math.round((svc.client_price || 0) * 100) / 100
      svc.quantity = Math.min(svc.quantity || 1, 999)
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

    // Post-write reconciliation. Recompute total_cost from the actual service
    // rows we just wrote (source of truth), not from the pre-flight slot
    // estimate which can drift if the client sent stale totals or omitted
    // them. For both B2B and B2C, the header total = supplier total × margin
    // — the per-service client_price computed above already applies this, so
    // the header reflects the sum of client_price rather than supplier cost.
    // The previous version only updated when the value differed from the
    // initial INSERT, but the initial INSERT used finalSellingTotal from the
    // client body — when that was missing/zero, the row stuck at 0 and the
    // view rendered EUR 0.00 despite real per-service prices.
    const actualSupplierTotal = serviceInserts.reduce((s, svc) => s + (svc.total_cost || 0), 0)
    const actualClientTotal = serviceInserts.reduce((s, svc) => s + (svc.client_price || 0), 0)
    const authoritativeTotal = actualClientTotal > 0
      ? Math.round(actualClientTotal * 100) / 100
      : Math.round(actualSupplierTotal * 100) / 100
    if (authoritativeTotal !== itineraryData.total_cost) {
      const { error: updErr } = await supabase
        .from('itineraries')
        .update({ total_cost: authoritativeTotal })
        .eq('id', itineraryId)
      if (updErr) {
        console.warn('[pricing-grid save] total_cost reconciliation update failed:', updErr.message)
      }
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
    })
  } catch (error: any) {
    console.error('Save pricing grid error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
