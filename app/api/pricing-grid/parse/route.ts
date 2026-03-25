// POST /api/pricing-grid/parse
// Parses pasted text into a fully populated pricing grid.
// 1. Fetches all available rates from DB
// 2. Sends rates catalog + text to AI
// 3. AI maps services to actual rate IDs from the catalog
// 4. Returns grid days with slots pre-filled and matched to real rates

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createMessageWithRetry, getUserFriendlyError } from '@/lib/ai/anthropic-client'

// ============================================
// RATE CATALOG BUILDER
// ============================================

async function buildRateCatalog(supabase: any, tier: string) {
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
  ] = await Promise.all([
    supabase.from('transportation_rates').select('id, service_code, service_type, vehicle_type, origin_city, destination_city, capacity_min, capacity_max, base_rate_eur').eq('is_active', true),
    supabase.from('guide_rates').select('id, service_code, guide_language, guide_type, city, base_rate_eur, rate_eur').eq('is_active', true),
    supabase.from('airport_staff_rates').select('id, service_code, airport_code, direction, rate_eur').eq('is_active', true),
    supabase.from('hotel_staff_rates').select('id, service_code, service_type, hotel_category, destination, rate_eur').eq('is_active', true),
    supabase.from('tipping_rates').select('id, service_code, role, rate_eur, amount_eur, description').eq('is_active', true),
    supabase.from('activity_rates').select('id, service_code, activity_name, city, rate_eur, base_rate_eur, category, pricing_type').eq('is_active', true),
    supabase.from('accommodation_rates').select('id, service_code, property_name, city, tier, board_basis, pp_double_eur, pp_double_non_eur, single_supp_eur, single_supp_non_eur').eq('is_active', true).eq('tier', tier),
    supabase.from('entrance_fees').select('id, service_code, attraction_name, city, eur_rate, non_eur_rate, category').eq('is_active', true),
    supabase.from('meal_rates').select('id, service_code, restaurant_name, meal_type, city, base_rate_eur, base_rate_non_eur, rate_eur, rate_non_eur, tier').eq('is_active', true),
    supabase.from('cruise_rates').select('id, service_code, ship_name, route, nights, cabin_type, tier, season, rate_single_eur, rate_double_eur, rate_triple_eur').eq('is_active', true).eq('tier', tier),
  ])

  // Build concise catalog strings for the AI prompt
  const catalog: Record<string, string> = {}

  catalog.vehicle = (transportRates || [])
    .filter((r: any) => r.service_type === 'day_tour')
    .map((r: any) => `ID:${r.id} | ${r.vehicle_type} | ${r.capacity_min}-${r.capacity_max}pax | ${r.origin_city || 'any'} | €${r.base_rate_eur}`)
    .join('\n')

  catalog.route = (transportRates || [])
    .filter((r: any) => ['intercity_transfer', 'airport_transfer'].includes(r.service_type))
    .map((r: any) => `ID:${r.id} | ${r.service_type} | ${r.origin_city || ''}→${r.destination_city || ''} | ${r.vehicle_type} | €${r.base_rate_eur}`)
    .join('\n')

  catalog.guide = (guideRates || [])
    .map((r: any) => `ID:${r.id} | ${r.guide_language} | ${r.guide_type || 'Egyptologist'} | ${r.city || 'any'} | €${r.base_rate_eur || r.rate_eur}`)
    .join('\n')

  catalog.airport_services = (airportRates || [])
    .map((r: any) => `ID:${r.id} | ${r.airport_code} | ${r.direction} | €${r.rate_eur}`)
    .join('\n')

  catalog.hotel_services = (hotelServiceRates || [])
    .map((r: any) => `ID:${r.id} | ${r.service_type} | ${r.hotel_category} | ${r.destination || 'any'} | €${r.rate_eur}`)
    .join('\n')

  catalog.tipping = (tippingRates || [])
    .map((r: any) => `ID:${r.id} | ${r.role || r.service_code} | €${r.rate_eur || r.amount_eur} | ${r.description || ''}`)
    .join('\n')

  catalog.boat_rides = (activityRates || [])
    .filter((r: any) => /boat|felucca|motor/i.test(r.activity_name || r.category || ''))
    .map((r: any) => `ID:${r.id} | ${r.activity_name} | ${r.city || 'any'} | €${r.rate_eur || r.base_rate_eur} | ${r.pricing_type || 'per_group'}`)
    .join('\n')

  catalog.accommodation = (accommodationRates || [])
    .map((r: any) => `ID:${r.id} | ${r.property_name} | ${r.city} | ${r.tier} | ${r.board_basis || 'RO'} | PPD €${r.pp_double_eur} | Supp €${r.single_supp_eur || 0}`)
    .join('\n')

  catalog.entrance_fees = (entranceFees || [])
    .map((r: any) => `ID:${r.id} | ${r.attraction_name} | ${r.city} | EU €${r.eur_rate} | NonEU €${r.non_eur_rate}`)
    .join('\n')

  catalog.experiences = (activityRates || [])
    .filter((r: any) => !/boat|felucca|motor/i.test(r.activity_name || r.category || ''))
    .map((r: any) => `ID:${r.id} | ${r.activity_name} | ${r.city || 'any'} | €${r.rate_eur || r.base_rate_eur} | ${r.pricing_type || 'per_person'}`)
    .join('\n')

  catalog.meals = (mealRates || [])
    .map((r: any) => `ID:${r.id} | ${r.meal_type} | ${r.restaurant_name || 'Restaurant'} | ${r.city} | €${r.base_rate_eur || r.rate_eur}`)
    .join('\n')

  catalog.cruise = (cruiseRates || [])
    .map((r: any) => `ID:${r.id} | ${r.ship_name} | ${r.route || ''} | ${r.nights}N | ${r.cabin_type} | ${r.season || ''} | Double €${r.rate_double_eur}`)
    .join('\n')

  return { catalog, rawRates: { transportRates, guideRates, airportRates, hotelServiceRates, tippingRates, activityRates, accommodationRates, entranceFees, mealRates, cruiseRates } }
}

// ============================================
// AI SYSTEM PROMPT
// ============================================

function buildSystemPrompt(catalog: Record<string, string>) {
  return `You are a travel itinerary pricing engine. Given a text (WhatsApp conversation, email, or itinerary), parse it into days and map each service to ACTUAL RATE IDs from the catalog below.

## RATE CATALOGS (use these exact IDs)

### VEHICLE (group — auto-select by pax count for the day's city)
${catalog.vehicle || '(none available)'}

### ROUTE (group — intercity/airport transfers)
${catalog.route || '(none available)'}

### GUIDE (group)
${catalog.guide || '(none available)'}

### AIRPORT SERVICES (group — match airport code by city: Cairo=CAI, Luxor=LXR, Aswan=ASW, Hurghada=HRG, Sharm=SSH)
${catalog.airport_services || '(none available)'}

### HOTEL SERVICES (group — check-in/check-out porterage)
${catalog.hotel_services || '(none available)'}

### TIPPING (group — add driver_tip for any day with vehicle, guide_tip for days with guide)
${catalog.tipping || '(none available)'}

### BOAT RIDES (group)
${catalog.boat_rides || '(none available)'}

### ACCOMMODATION (per person — match by city, only for nights with hotel stay, NOT last day)
${catalog.accommodation || '(none available)'}

### ENTRANCE FEES (per person — match attractions mentioned)
${catalog.entrance_fees || '(none available)'}

### EXPERIENCES (per person — hot air balloon, horse carriage, etc.)
${catalog.experiences || '(none available)'}

### MEALS (per person — match by city and meal type)
${catalog.meals || '(none available)'}

### NILE CRUISE (per person — for cruise days)
${catalog.cruise || '(none available)'}

## OUTPUT FORMAT

For each day, output services using the EXACT IDs from the catalogs above.
Use the ID format as shown (e.g., "a1b2c3d4-..." UUID format).

\`\`\`json
{
  "days": [
    {
      "dayNumber": 1,
      "title": "Arrival in Cairo",
      "city": "Cairo",
      "description": "Arrive at Cairo airport, transfer to hotel, rest of day at leisure.",
      "slots": {
        "vehicle": ["<vehicle_id matching city & pax>"],
        "route": ["<airport_transfer_id for this city>"],
        "guide": [],
        "airport_services": ["<airport_id for CAI arrival>"],
        "hotel_services": ["<hotel_service_id for check-in>"],
        "tipping": ["<driver_tip_id>"],
        "boat_rides": [],
        "other_group": 0,
        "accommodation": ["<hotel_id matching city>"],
        "entrance_fees": [],
        "flights": [],
        "experiences": [],
        "meals": [],
        "water": [],
        "cruise": [],
        "other_pp": 0
      }
    }
  ]
}
\`\`\`

## DAY TYPE RULES

### Arrival Day (first day, international arrival)
- airport_services: arrival service for the city's airport (Cairo=CAI, Luxor=LXR, Aswan=ASW, Hurghada=HRG, Sharm=SSH)
- hotel_services: check-in service
- vehicle: airport transfer matching pax and city
- tipping: driver tip ONLY
- accommodation: hotel in arrival city
- NO guide, NO entrance fees, NO meals (arrival day = rest)

### Departure Day (last day, international departure)
- airport_services: departure service for the city's airport
- hotel_services: check-out service
- vehicle: hotel-to-airport transfer
- tipping: driver tip ONLY
- NO guide, NO entrance fees, NO meals, NO accommodation

### Touring Day (ANY day with sightseeing, visits, temples, museums, pyramids, bazaar, old city, etc.)
- vehicle: day-tour vehicle matching pax and city
- guide: ALWAYS add a guide for touring days — pick the guide matching the requested language
- entrance_fees: match EVERY attraction/site mentioned by name
- meals: ALWAYS add lunch AND dinner for the day's city. Pick restaurant meals matching city.
- water: ALWAYS add water
- hotel_services: check-in/check-out service
- tipping: driver tip + guide tip
- accommodation: hotel in overnight city (if not last day)

### Cruise Embarkation Day (fly/transfer to cruise, board the ship)
- If there is a DOMESTIC FLIGHT: add airport_services for BOTH departure and arrival airports, add vehicle for airport transfers at both cities
- hotel_services: check-out from hotel
- cruise: SELECT THE CRUISE RATE — this is the per-person cabin rate for the entire cruise stay
- tipping: driver tip
- accommodation: NONE (sleeping on cruise)
- meals: NONE on cruise (included)

### Cruise Sailing/Touring Day (on board the Nile cruise, may visit temples at stops)
- entrance_fees: match any temples/sites visited during stops (e.g., Kom Ombo, Edfu/Horus Temple)
- tipping: NONE (cruise tips are separate)
- vehicle: NONE (transport included in cruise package)
- guide: NONE (included in cruise)
- accommodation: NONE (cruise cabin)
- meals: NONE (included in cruise)
- cruise: EMPTY (already selected on embarkation day — cruise is charged ONCE for the entire stay)

### Cruise Disembarkation Day (leave cruise, transfer to next destination)
- vehicle: NONE (cruise transport package covers sightseeing vehicle on checkout day)
- entrance_fees: match any sites visited (e.g., Valley of the Kings, Hatshepsut Temple)
- If transferring to another city: add route (intercity transfer from dock city to overnight city)
- hotel_services: cruise disembarkation + hotel check-in at destination
- tipping: driver tip
- accommodation: hotel in overnight city
- meals: lunch + dinner at overnight city (if NOT all-inclusive hotel)

### Free/Leisure Day (beach, resort, no sightseeing)
- accommodation: hotel
- water: add water
- vehicle: NONE
- guide: NONE
- meals: ONLY if hotel is NOT all-inclusive (board_basis != AI)

## MATCHING RULES
- ALWAYS use actual IDs from the catalogs. If no matching rate exists, use an empty array [].
- Match accommodation by CITY — pick the hotel in the correct city.
- Match entrance fees by ATTRACTION NAMES mentioned. Use fuzzy matching: "Temple of Horus" = "Edfu Temple", "Pyramids" = "Giza Plateau", "Khan el-Khalili" = "El-Muizz Street".
- Match meals by CITY and meal type (lunch/dinner). For each touring day, add ONE lunch and ONE dinner.
- Match airport services by CITY airport code.
- Match vehicle by pax capacity AND city.
- For intercity transfers (route slot), match origin→destination cities.
- The cruise rate is charged ONCE on the embarkation day for the full cruise duration.

Output ONLY valid JSON, no other text.`
}

// ============================================
// MAIN HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { text, tier, pax } = await request.json()

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ success: false, error: 'No text provided' }, { status: 400 })
    }

    // 1. Fetch all rates from DB
    const { catalog, rawRates } = await buildRateCatalog(supabase, tier || 'standard')

    // 2. Build prompt with real rate IDs
    const systemPrompt = buildSystemPrompt(catalog)

    // 3. Send to AI
    const response = await createMessageWithRetry({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Parse this into a fully priced day-by-day itinerary. Pax: ${pax || 2}. Tier: ${tier || 'standard'}.\n\n${text}`
        }
      ]
    })

    // 4. Extract JSON
    const responseText = response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('')

    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ success: false, error: 'Failed to parse AI response' }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0])

    // 5. Enrich parsed days with actual rate data (prices, names, etc.)
    const allRatesFlat = buildFlatRateMap(rawRates)
    const enrichedDays = (parsed.days || []).map((day: any) => ({
      ...day,
      slots: enrichSlots(day.slots || {}, allRatesFlat)
    }))

    return NextResponse.json({ success: true, days: enrichedDays })
  } catch (error) {
    console.error('Parse error:', error)
    const { message, status } = getUserFriendlyError(error)
    return NextResponse.json({ success: false, error: message }, { status })
  }
}

// ============================================
// ENRICHMENT — resolve IDs to full rate objects
// ============================================

function buildFlatRateMap(rawRates: any): Map<string, any> {
  const map = new Map<string, any>()

  const addAll = (rows: any[] | null, transform: (r: any) => any) => {
    for (const r of rows || []) {
      if (r.id) map.set(r.id, transform(r))
    }
  }

  addAll(rawRates.transportRates, (r: any) => ({
    rateId: r.id, name: `${r.vehicle_type || 'Vehicle'} — ${r.origin_city || ''}${r.destination_city ? '→' + r.destination_city : ''}`,
    rateEur: toNum(r.base_rate_eur), rateNonEur: toNum(r.base_rate_eur),
  }))
  addAll(rawRates.guideRates, (r: any) => ({
    rateId: r.id, name: `${r.guide_language} ${r.guide_type || 'Guide'}`,
    rateEur: toNum(r.base_rate_eur || r.rate_eur), rateNonEur: toNum(r.base_rate_eur || r.rate_eur),
  }))
  addAll(rawRates.airportRates, (r: any) => ({
    rateId: r.id, name: `${r.airport_code} — ${r.direction}`,
    rateEur: toNum(r.rate_eur), rateNonEur: toNum(r.rate_eur),
  }))
  addAll(rawRates.hotelServiceRates, (r: any) => ({
    rateId: r.id, name: `${r.service_type}${r.destination ? ' (' + r.destination + ')' : ''}`,
    rateEur: toNum(r.rate_eur), rateNonEur: toNum(r.rate_eur),
  }))
  addAll(rawRates.tippingRates, (r: any) => ({
    rateId: r.id, name: r.role || r.service_code || 'Tip',
    rateEur: toNum(r.rate_eur || r.amount_eur), rateNonEur: toNum(r.rate_eur || r.amount_eur),
  }))
  addAll(rawRates.activityRates, (r: any) => ({
    rateId: r.id, name: r.activity_name,
    rateEur: toNum(r.rate_eur || r.base_rate_eur), rateNonEur: toNum(r.rate_eur || r.base_rate_eur),
  }))
  addAll(rawRates.accommodationRates, (r: any) => ({
    rateId: r.id, name: `${r.property_name} (${r.city})`,
    rateEur: toNum(r.pp_double_eur), rateNonEur: toNum(r.pp_double_non_eur),
    single_supp_eur: toNum(r.single_supp_eur), single_supp_non_eur: toNum(r.single_supp_non_eur),
    board_basis: r.board_basis,
  }))
  addAll(rawRates.entranceFees, (r: any) => ({
    rateId: r.id, name: r.attraction_name,
    rateEur: toNum(r.eur_rate), rateNonEur: toNum(r.non_eur_rate),
  }))
  addAll(rawRates.mealRates, (r: any) => ({
    rateId: r.id, name: `${r.meal_type} — ${r.restaurant_name || 'Restaurant'} (${r.city})`,
    rateEur: toNum(r.base_rate_eur || r.rate_eur), rateNonEur: toNum(r.base_rate_non_eur || r.rate_non_eur || r.base_rate_eur || r.rate_eur),
  }))
  addAll(rawRates.cruiseRates, (r: any) => ({
    rateId: r.id, name: `${r.ship_name} (${r.nights}N, ${r.cabin_type})`,
    rateEur: toNum(r.rate_double_eur), rateNonEur: toNum(r.rate_double_eur),
  }))

  return map
}

function enrichSlots(slots: Record<string, any>, rateMap: Map<string, any>): Record<string, any> {
  const enriched: Record<string, any> = {}

  for (const [slotId, value] of Object.entries(slots)) {
    if (typeof value === 'number') {
      // Custom amount slots (other_group, other_pp)
      enriched[slotId] = { selectedItems: [], customAmount: value }
      continue
    }

    const ids = Array.isArray(value) ? value : (value ? [value] : [])
    const selectedItems = ids
      .map((id: string) => rateMap.get(id))
      .filter(Boolean)

    enriched[slotId] = { selectedItems, customAmount: 0 }
  }

  return enriched
}

function toNum(v: any): number {
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}
