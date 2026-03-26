import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// ============================================
// POST /api/pricing-grid/save
// Save pricing grid state → itineraries + itinerary_days + itinerary_services
// ============================================

function generateItineraryCode(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 9000) + 1000
  return `ITN-S-${year}-${random}`  // S = from pricing grid (slot-based)
}

function addDays(dateStr: string, numDays: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + numDays)
  return d.toISOString().split('T')[0]
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
          .in('day_id', dayIds)
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
            day_id: dayDbId,
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
            day_id: dayDbId,
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

    if (serviceInserts.length > 0) {
      const { error: svcError } = await supabase
        .from('itinerary_services')
        .insert(serviceInserts)

      if (svcError) throw new Error(`Failed to insert services: ${svcError.message}`)
    }

    console.log(`Pricing grid saved: ${itineraryCode} — ${days.length} days, ${serviceInserts.length} services`)

    return NextResponse.json({
      success: true,
      itineraryId,
      itineraryCode,
      daysCreated: days.length,
      servicesCreated: serviceInserts.length,
    })
  } catch (error: any) {
    console.error('Save pricing grid error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
