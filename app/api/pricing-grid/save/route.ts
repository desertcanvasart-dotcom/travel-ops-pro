import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createServerClient } from '@/lib/supabase-server'
import { gridCompleteness } from '@/app/pricing-grid/lib/grid-completeness'

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
    const marginPct = config.marginPercent || 25
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
      // Create new itinerary
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

    // --- 2. Delete existing days + services (for upsert) ---
    if (isUpdate) {
      // Get existing day IDs
      const { data: existingDays } = await supabase
        .from('itinerary_days')
        .select('id')
        .eq('itinerary_id', itineraryId)

      if (existingDays && existingDays.length > 0) {
        const dayIds = existingDays.map((d: any) => d.id)
        // Delete services first (FK constraint)
        await supabase
          .from('itinerary_services')
          .delete()
          .in('itinerary_day_id', dayIds)
        // Delete days
        await supabase
          .from('itinerary_days')
          .delete()
          .eq('itinerary_id', itineraryId)
      }
    }

    // --- 3. Insert days ---
    const dayInserts = days.map((day: any, idx: number) => ({
      itinerary_id: itineraryId,
      day_number: day.dayNumber || idx + 1,
      title: day.title || `Day ${idx + 1}`,
      description: day.description || '',
      city: day.city || '',
      overnight_city: day.city || '',
      date: addDays(startDate, idx),
    }))

    const { data: insertedDays, error: daysError } = await supabase
      .from('itinerary_days')
      .insert(dayInserts)
      .select('id, day_number')

    if (daysError) throw new Error(`Failed to insert days: ${daysError.message}`)

    // Create a map: dayNumber → dayDbId
    const dayIdMap = new Map<number, string>()
    for (const d of insertedDays || []) {
      dayIdMap.set(d.day_number, d.id)
    }

    // --- 4. Insert services ---
    const serviceInserts: any[] = []

    for (const day of days) {
      const dayDbId = dayIdMap.get(day.dayNumber)
      if (!dayDbId) continue

      const slots = day.slots || []
      for (const slot of slots) {
        const serviceType = SLOT_TO_SERVICE[slot.slotId]
        if (!serviceType) continue
        const isGroup = GROUP_SLOTS.has(slot.slotId)
        const passport = config.passport || 'non_eu'

        // Custom amount slots
        if (slot.customAmount > 0) {
          serviceInserts.push({
            itinerary_day_id: dayDbId,
            service_type: serviceType,
            service_name: slot.slotId === 'other_group' ? 'Other (Group)' : 'Other (Per Person)',
            quantity: isGroup ? 1 : (config.pax || 1),
            rate_eur: slot.customAmount,
            rate_non_eur: slot.customAmount,
            total_cost: isGroup ? slot.customAmount : slot.customAmount * (config.pax || 1),
            notes: `__grid:custom_amount|slot:${slot.slotId}`,
          })
          continue
        }

        // Selected items
        for (const item of (slot.selectedItems || [])) {
          const rate = passport === 'eu' ? item.rateEur : item.rateNonEur
          serviceInserts.push({
            itinerary_day_id: dayDbId,
            service_type: serviceType,
            service_name: item.name,
            quantity: isGroup ? 1 : (config.pax || 1),
            rate_eur: item.rateEur,
            rate_non_eur: item.rateNonEur,
            total_cost: isGroup ? rate : rate * (config.pax || 1),
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
      svc.quantity = Math.min(svc.quantity || 1, 999)
    }

    if (serviceInserts.length > 0) {
      const { error: svcError } = await supabase
        .from('itinerary_services')
        .insert(serviceInserts)

      if (svcError) throw new Error(`Failed to insert services: ${svcError.message}`)
    }

    // Post-write reconciliation: the pre-flight supplierTotal above was computed
    // from the raw input slots; recompute now from the actual service rows we
    // just wrote (which may differ if service construction adjusted anything).
    // For B2B the selling price is supplier cost × (1 + margin). For B2C the
    // markup is applied client-side, but we still floor the stored total at
    // supplier cost so a tampered/buggy client can never persist a quote
    // priced below cost.
    const actualSupplierTotal = serviceInserts.reduce((s, svc) => s + (svc.total_cost || 0), 0)
    const marginPercent = Math.min(Math.max(Number(config.marginPercent) || 0, 0), 100)
    let authoritativeTotal = itineraryData.total_cost
    if (config.clientType === 'b2b') {
      authoritativeTotal = Math.round(actualSupplierTotal * (1 + marginPercent / 100) * 100) / 100
    } else if (authoritativeTotal < actualSupplierTotal) {
      authoritativeTotal = Math.round(actualSupplierTotal * 100) / 100
    }
    if (authoritativeTotal !== itineraryData.total_cost) {
      await supabase.from('itineraries').update({ total_cost: authoritativeTotal }).eq('id', itineraryId)
    }

    console.log(`Pricing grid saved: ${itineraryCode} — ${days.length} days, ${serviceInserts.length} services`)

    return NextResponse.json({
      success: true,
      itineraryId,
      itineraryCode,
      daysCreated: days.length,
      servicesCreated: serviceInserts.length,
      completeness,
    })
  } catch (error: any) {
    console.error('Save pricing grid error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
