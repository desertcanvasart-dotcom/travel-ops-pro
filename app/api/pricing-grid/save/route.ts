import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createServerClient } from '@/lib/supabase-server'

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

    const isUpdate = !!config.itineraryId
    const now = new Date().toISOString()

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
      total_cost: totals?.sellingPriceTotal || 0,
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

    // --- 2. Build day + service payloads ---
    // The destructive replace (delete old days/services + insert new) runs in a
    // single Postgres transaction via the save_pricing_grid_days RPC, so a
    // partial failure can no longer leave an itinerary with its days deleted but
    // not re-inserted. Services reference days by day_number; the RPC resolves
    // each to the freshly-inserted day id.
    const dayPayload = days.map((day: any, idx: number) => ({
      day_number: day.dayNumber || idx + 1,
      title: day.title || `Day ${idx + 1}`,
      description: day.description || '',
      city: day.city || '',
      overnight_city: day.city || '',
      date: addDays(startDate, idx),
    }))

    const servicePayload: any[] = []
    for (let di = 0; di < days.length; di++) {
      const day = days[di]
      const dayNumber = day.dayNumber || di + 1
      const slots = day.slots || []
      for (const slot of slots) {
        const serviceType = SLOT_TO_SERVICE[slot.slotId]
        if (!serviceType) continue
        const isGroup = GROUP_SLOTS.has(slot.slotId)
        const passport = config.passport || 'non_eu'

        // Custom amount slots
        if (slot.customAmount > 0) {
          servicePayload.push({
            day_number: dayNumber,
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
          servicePayload.push({
            day_number: dayNumber,
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
    for (const svc of servicePayload) {
      svc.rate_eur = Math.round((svc.rate_eur || 0) * 100) / 100
      svc.rate_non_eur = Math.round((svc.rate_non_eur || 0) * 100) / 100
      svc.total_cost = Math.round((svc.total_cost || 0) * 100) / 100
      svc.quantity = Math.min(svc.quantity || 1, 999)
    }

    // --- 3. Atomically replace days + services (single transaction) ---
    const { error: rpcError } = await supabase.rpc('save_pricing_grid_days', {
      p_itinerary_id: itineraryId,
      p_days: dayPayload,
      p_services: servicePayload,
    })

    if (rpcError) throw new Error(`Failed to save days/services: ${rpcError.message}`)

    // Recompute the itinerary total server-side from the ACTUAL service costs
    // rather than trusting the client-supplied total. For B2B the selling price is
    // supplier cost × (1 + margin). For B2C the markup is applied client-side, but
    // we still floor the stored total at supplier cost so a tampered/buggy client
    // can never persist a quote priced below cost.
    const supplierTotal = servicePayload.reduce((s, svc) => s + (svc.total_cost || 0), 0)
    const marginPercent = Math.min(Math.max(Number(config.marginPercent) || 0, 0), 100)
    let authoritativeTotal = itineraryData.total_cost
    if (config.clientType === 'b2b') {
      authoritativeTotal = Math.round(supplierTotal * (1 + marginPercent / 100) * 100) / 100
    } else if (authoritativeTotal < supplierTotal) {
      authoritativeTotal = Math.round(supplierTotal * 100) / 100
    }
    if (authoritativeTotal !== itineraryData.total_cost) {
      await supabase.from('itineraries').update({ total_cost: authoritativeTotal }).eq('id', itineraryId)
    }

    console.log(`Pricing grid saved: ${itineraryCode} — ${days.length} days, ${servicePayload.length} services`)

    return NextResponse.json({
      success: true,
      itineraryId,
      itineraryCode,
      daysCreated: days.length,
      servicesCreated: servicePayload.length,
    })
  } catch (error: any) {
    console.error('Save pricing grid error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
