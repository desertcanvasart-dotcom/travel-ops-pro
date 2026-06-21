// POST /api/pricing-grid/parse
// Parses pasted text into a fully populated pricing grid.
// 1. Fetches all available rates from DB
// 2. Sends rates catalog + text to AI
// 3. AI maps services to actual rate IDs from the catalog
// 4. Returns grid days with slots pre-filled and matched to real rates

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createMessageWithRetry, getUserFriendlyError } from '@/lib/ai/anthropic-client'
import { enrichSlots } from '@/app/pricing-grid/lib/enrich-slots'

// ============================================
// RATE CATALOG BUILDER
// ============================================

async function buildRateCatalog(supabase: any, tier: string) {
  // Use select('*') — specific column selects fail silently if a column name doesn't match
  const results = await Promise.all([
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
  ])

  // Log any Supabase errors
  const tableNames = ['transportation_rates', 'guide_rates', 'airport_staff_rates', 'hotel_staff_rates', 'tipping_rates', 'activity_rates', 'accommodation_rates', 'entrance_fees', 'meal_rates', 'nile_cruises', 'b2b_transport_packages', 'flight_rates']
  results.forEach((r: any, i: number) => {
    if (r.error) console.error(`❌ DB ERROR fetching ${tableNames[i]}:`, r.error.message, r.error.details || '')
  })

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
  ] = results

  // Build concise catalog strings for the AI prompt
  const catalog: Record<string, string> = {}

  // Vehicle tiers: expand each service row into options per vehicle type
  const VEHICLE_TIERS = [
    { key: 'sedan',   label: 'Sedan',   capMin: 1,  capMax: 2  },
    { key: 'minivan', label: 'Minivan', capMin: 3,  capMax: 7  },
    { key: 'van',     label: 'Van',     capMin: 8,  capMax: 12 },
    { key: 'minibus', label: 'Minibus', capMin: 13, capMax: 20 },
    { key: 'bus',     label: 'Bus',     capMin: 21, capMax: 45 },
  ]

  const expandCatalogTiers = (r: any, prefix: string) =>
    VEHICLE_TIERS
      .filter(t => parseFloat(r[`${t.key}_rate_eur`]) > 0)
      .map(t => `ID:${r.id}__${t.key} | ${t.label} (${t.capMin}-${t.capMax}pax) | ${prefix} | ${r.origin_city || r.city || 'any'} | €${r[`${t.key}_rate_eur`]}`)

  catalog.vehicle = (transportRates || [])
    .filter((r: any) => r.service_type === 'day_tour')
    .flatMap((r: any) => expandCatalogTiers(r, r.route_name || r.service_code || 'Day Tour'))
    .join('\n')

  catalog.route = (transportRates || [])
    .filter((r: any) => r.service_type !== 'day_tour')
    .flatMap((r: any) => expandCatalogTiers(r, `${r.service_type} | ${r.origin_city || r.city || ''}→${r.destination_city || ''}`))
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
    .map((r: any) => `ID:${r.id} | ${r.ship_name} | ${r.route_name || ''} | ${r.duration_nights}N | ${r.cabin_type} | ${r.tier} | Double €${r.rate_double_eur || r.rate_low_double_eur}`)
    .join('\n')

  catalog.cruise_transport_package = (cruiseTransportPkgs || [])
    .map((r: any) => `ID:${r.id} | ${r.package_name} | ${r.origin_city}→${r.destination_city} | ${r.duration_days}d | Sedan €${r.sedan_rate} | Minivan €${r.minivan_rate} | Van €${r.van_rate} | Includes: ${r.includes || 'vehicle + guide + boat rides'}`)
    .join('\n')

  catalog.flights = (flightRates || [])
    .map((r: any) => `ID:${r.id} | ${r.airline} | ${r.route_from}→${r.route_to} | ${r.cabin_class} | €${r.base_rate_eur}${r.tax_eur ? ` +tax €${r.tax_eur}` : ''}`)
    .join('\n')

  return { catalog, rawRates: { transportRates, guideRates, airportRates, hotelServiceRates, tippingRates, activityRates, accommodationRates, entranceFees, mealRates, cruiseRates, cruiseTransportPkgs, flightRates } }
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

### FLIGHTS (per person — domestic flights between Egyptian cities)
${catalog.flights || '(none available)'}

### NILE CRUISE (per person — for cruise days)
${catalog.cruise || '(none available)'}

### CRUISE TRANSPORT PACKAGE (group — bundled vehicle + guide + boat rides for ALL Nile cruise days)
${catalog.cruise_transport_package || '(none available)'}
When a quotation includes a Nile cruise (any duration: 3N, 4N, or 7N), ALWAYS add the cruise transport package.
This package covers ALL transportation for the entire cruise: felucca rides, motorboat, buses, horse carriages, and other transfers.
Add it as a ROUTE on the cruise embarkation day. The same package applies regardless of cruise duration.

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
- route: airport transfer for the arrival city (from the ROUTE catalog, NOT the vehicle catalog)
- airport_services: arrival service for the city's airport (Cairo=CAI, Luxor=LXR, Aswan=ASW, Hurghada=HRG, Sharm=SSH)
- hotel_services: check-in service
- tipping: driver tip ONLY
- accommodation: hotel in arrival city
- vehicle: EMPTY [] (no day-tour vehicle on arrival — the airport transfer goes in ROUTE)
- NO guide, NO entrance fees, NO meals (arrival day = rest)

### Departure Day (last day, international departure)
- route: airport transfer for the departure city (from the ROUTE catalog, NOT the vehicle catalog)
- airport_services: departure service for the city's airport
- hotel_services: check-out service
- tipping: driver tip ONLY
- vehicle: EMPTY [] (no day-tour vehicle on departure — the airport transfer goes in ROUTE)
- NO guide, NO entrance fees, NO meals, NO accommodation

### Touring Day (ANY day with sightseeing, visits, temples, museums, pyramids, bazaar, old city, etc.)
- vehicle: day-tour vehicle matching pax and city (from the VEHICLE catalog)
- route: EMPTY [] unless transferring between cities (then use intercity_transfer from ROUTE catalog)
- guide: ALWAYS add a guide for touring days — pick the guide matching the requested language
- entrance_fees: match EVERY attraction/site mentioned by name
- meals: ALWAYS add lunch AND dinner for the day's city. Pick restaurant meals matching city.
- water: ALWAYS add water
- hotel_services: check-in/check-out service
- tipping: driver tip + guide tip
- accommodation: hotel in overnight city (if not last day)

### IMPORTANT: Nile Cruise Transport Package Rule
When a Nile cruise is part of the itinerary, a CRUISE TRANSPORT PACKAGE covers ALL transportation from the cruise embarkation day through the last cruise sightseeing day. This includes:
- Airport transfers at the cruise city
- All sightseeing vehicles during cruise days
- Felucca rides, motorboat rides, horse carriages
- All transfers between temples and sites
Therefore, on ALL cruise-related days (embarkation through final cruise sightseeing):
- vehicle: EMPTY [] (covered by transport package)
- route: EMPTY [] (covered by transport package)
- boat_rides: EMPTY [] (covered by transport package)
Transportation BEFORE the cruise (e.g., Cairo day tours, Cairo airport) uses normal vehicle/route.
Transportation AFTER the last cruise sightseeing day (e.g., Luxor → Hurghada) uses normal route.

### Cruise Embarkation Day (fly/transfer to cruise, board the ship)
- If there is a DOMESTIC FLIGHT: add the flight to the "flights" slot. Add airport_services for BOTH departure and arrival airports.
- vehicle: EMPTY [] (covered by cruise transport package)
- route: EMPTY [] (cruise transport package will be auto-added by the system)
- boat_rides: EMPTY [] (covered by cruise transport package)
- hotel_services: check-out from hotel
- cruise: SELECT THE CRUISE RATE — this is the per-person PER NIGHT cabin rate. Add it on EVERY night the guest sleeps on the ship.
- tipping: driver tip
- accommodation: NONE (sleeping on cruise)
- meals: NONE on cruise (included)

### Cruise Sailing/Touring Day (on board the Nile cruise, may visit temples at stops)
- cruise: SELECT THE SAME CRUISE RATE again — the rate is PER NIGHT, so add it on every night spent on the ship
- entrance_fees: match any temples/sites visited during stops (e.g., Kom Ombo, Edfu/Horus Temple)
- vehicle: EMPTY [] (covered by cruise transport package)
- route: EMPTY [] (covered by cruise transport package)
- boat_rides: EMPTY [] (covered by cruise transport package)
- guide: NONE (included in cruise)
- tipping: NONE (cruise tips are separate)
- accommodation: NONE (cruise cabin — the cruise rate IS the accommodation)
- meals: NONE (included in cruise)

### Cruise Disembarkation + Sightseeing Day (leave cruise in the morning, visit sites like Valley of the Kings)
- cruise: EMPTY [] — the guest does NOT sleep on the ship this night (they move to a hotel)
- entrance_fees: match any sites visited (e.g., Valley of the Kings, Hatshepsut Temple, Karnak)
- vehicle: EMPTY [] (covered by cruise transport package)
- route: EMPTY [] (covered by cruise transport package)
- boat_rides: EMPTY [] (covered by cruise transport package)
- hotel_services: hotel check-in at destination
- tipping: driver tip
- accommodation: hotel in overnight city (they sleep in a hotel after disembarking)
- meals: lunch + dinner at overnight city (if NOT all-inclusive hotel)

### First Day AFTER Cruise Range (transfer to next destination, e.g., Luxor → Hurghada)
- This day is NOT covered by the cruise transport package
- route: intercity transfer from cruise end city to next destination (from ROUTE catalog)
- vehicle: day-tour vehicle if sightseeing, otherwise EMPTY
- Normal auto-fill rules apply from this day onward

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
- The cruise rate is PER PERSON PER NIGHT. Add it on every day the guest sleeps on the ship (embarkation + sailing days, NOT on disembarkation day).

## METADATA EXTRACTION

In addition to parsing days, extract trip metadata from the conversation text. Return a "metadata" object at the top level alongside "days":

\`\`\`json
{
  "metadata": {
    "clientName": "John Smith or null if not found",
    "pax": 3,
    "startDate": "2026-04-15",
    "passport": "eu or non_eu",
    "tourName": "Descriptive name for the tour",
    "nationality": "American, British, etc."
  },
  "days": [...]
}
\`\`\`

Rules for metadata:
- **clientName**: Extract the client's name from the conversation. Look for introductions, signatures, or how the person identifies themselves. Return null if not found.
- **pax**: Count the number of travelers mentioned (e.g., "2 adults", "my wife and I" = 2, "family of 4" = 4, "solo traveler" = 1). Return null if not determinable.
- **startDate**: Extract the trip start date in YYYY-MM-DD format. Look for specific dates, "arriving on March 15", etc. Return null if not found.
- **passport**: Infer from nationality. European nationalities (German, French, Italian, Spanish, Dutch, Belgian, Austrian, Swedish, Danish, Finnish, Norwegian, Portuguese, Greek, Irish, Polish, Czech, Hungarian, Romanian, Bulgarian, Croatian, Slovenian, Slovak, Estonian, Latvian, Lithuanian, Luxembourgish, Maltese, Cypriot, Swiss, British) = "eu". All others = "non_eu". Return null if nationality is unknown.
- **tourName**: Generate a short descriptive name for the tour based on the destinations and activities (e.g., "Cairo & Luxor Cultural Tour", "Egypt Nile Cruise & Red Sea Adventure"). Always generate this.
- **nationality**: Extract nationality if mentioned (e.g., "I'm American", "from Japan", "Brazilian couple"). Return null if not found.

Return null for any field that cannot be determined from the conversation.

Output ONLY valid JSON, no other text.`
}

// ============================================
// GENERATIVE PROMPT (fallback for vague inquiries)
// ============================================

function buildGenerativePrompt(catalog: Record<string, string>) {
  return `You are a travel itinerary designer for Egypt tours. The input is a VAGUE travel inquiry — NOT a detailed day-by-day itinerary. Your job is to DESIGN a suggested itinerary based on the destinations, dates, interests, and group size mentioned, then map each service to ACTUAL RATE IDs from the catalog below.

## DESIGN RULES
- If the client mentions specific destinations (Cairo, Luxor, Aswan, Hurghada, etc.), include them.
- If the client mentions a Nile Cruise (SS Sudan, Oberoi, Sonesta, etc.), design a cruise itinerary with embarkation, sailing, and disembarkation days.
- If duration is mentioned (e.g., "5 days", "a week"), use that. Otherwise, suggest 7-10 days based on destinations.
- If no specific cities are mentioned but Egypt is implied, suggest a classic Cairo + Luxor + Aswan itinerary.
- If the client mentions "beach" or "Red Sea", include Hurghada or Sharm El Sheikh.
- Design a realistic, well-paced itinerary — don't cram too many sites into one day.
- Always start with an arrival day and end with a departure day.

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

### FLIGHTS (per person — domestic flights between Egyptian cities)
${catalog.flights || '(none available)'}

### NILE CRUISE (per person — for cruise days)
${catalog.cruise || '(none available)'}

### CRUISE TRANSPORT PACKAGE (group — bundled vehicle + guide + boat rides for ALL Nile cruise days)
${catalog.cruise_transport_package || '(none available)'}
When a quotation includes a Nile cruise (any duration: 3N, 4N, or 7N), ALWAYS add the cruise transport package.

## OUTPUT FORMAT

Return a JSON object with "metadata" and "days" — same format as a parsed itinerary:

\`\`\`json
{
  "metadata": {
    "clientName": "extracted or null",
    "pax": 2,
    "startDate": "YYYY-MM-DD or null",
    "passport": "eu or non_eu or null",
    "tourName": "Descriptive tour name",
    "nationality": "extracted or null"
  },
  "days": [
    {
      "dayNumber": 1,
      "title": "Arrival in Cairo",
      "city": "Cairo",
      "description": "Arrive at Cairo airport, transfer to hotel.",
      "slots": {
        "vehicle": [],
        "route": ["<airport_transfer_id>"],
        "guide": [],
        "airport_services": ["<airport_id>"],
        "hotel_services": ["<check_in_id>"],
        "tipping": ["<driver_tip_id>"],
        "boat_rides": [],
        "other_group": 0,
        "accommodation": ["<hotel_id>"],
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

### Arrival Day (first day)
- route: airport transfer, airport_services: arrival, hotel_services: check-in, tipping: driver tip, accommodation: hotel
- NO guide, NO entrance fees, NO meals

### Touring Day (sightseeing)
- vehicle: day-tour vehicle, guide: ALWAYS, entrance_fees: match sites, meals: lunch + dinner, water: ALWAYS
- tipping: driver + guide tip, accommodation: hotel, hotel_services: porterage

### Cruise Embarkation Day
- flights: if domestic flight needed, airport_services: both airports
- cruise: per-night rate, hotel_services: check-out from hotel
- NO accommodation (sleeping on cruise), NO outside meals

### Cruise Sailing Day
- cruise: per-night rate, entrance_fees: if visiting temples at stops
- NO vehicle, NO route, NO guide, NO meals, NO accommodation

### Cruise Disembarkation + Sightseeing Day
- entrance_fees: match sites visited, accommodation: hotel in overnight city
- meals: lunch + dinner, hotel_services: check-in
- NO cruise rate (not sleeping on ship)

### Free/Leisure Day (beach, resort)
- accommodation: hotel, water: yes
- NO vehicle, NO guide

### Departure Day (last day)
- route: airport transfer, airport_services: departure, hotel_services: check-out, tipping: driver tip
- NO guide, NO entrance fees, NO meals, NO accommodation

## MATCHING RULES
- ALWAYS use actual IDs from the catalogs. If no matching rate exists, use an empty array [].
- Match accommodation by CITY. Match entrance fees by attraction name. Match meals by CITY.
- Match vehicle by pax capacity AND city. Match airport services by city airport code.

## METADATA RULES
- Extract client name, pax, nationality, dates from the text if mentioned. Return null if not found.
- Infer passport type from nationality (European = "eu", others = "non_eu").
- Always generate a descriptive tourName.

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

    let parsed = JSON.parse(jsonMatch[0])
    let generationMode: 'parsed' | 'generated' = 'parsed'

    // 4b. Fallback: if AI returned 0 days (vague inquiry), retry with generative prompt
    if (!parsed.days || parsed.days.length === 0) {
      console.log('Parse returned 0 days — falling back to generative mode')
      generationMode = 'generated'

      const genPrompt = buildGenerativePrompt(catalog)
      const genResponse = await createMessageWithRetry({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: genPrompt,
        messages: [
          {
            role: 'user',
            content: `Design a suggested Egypt itinerary based on this inquiry. Pax: ${pax || 2}. Tier: ${tier || 'standard'}.\n\n${text}`
          }
        ]
      })

      const genText = genResponse.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('')

      const genJsonMatch = genText.match(/\{[\s\S]*\}/)
      if (genJsonMatch) {
        const genParsed = JSON.parse(genJsonMatch[0])
        // Merge: keep metadata from first pass if generative didn't extract it
        parsed = {
          metadata: { ...(parsed.metadata || {}), ...(genParsed.metadata || {}) },
          days: genParsed.days || [],
        }
      }
    }

    // 5. Enrich parsed days with actual rate data (prices, names, etc.)
    const allRatesFlat = buildFlatRateMap(rawRates)

    // Helper: pick the right vehicle tier key for a given pax count
    const pickTierForPax = (paxNum: number): string => {
      if (paxNum <= 2) return 'sedan'
      if (paxNum <= 7) return 'minivan'
      if (paxNum <= 12) return 'van'
      if (paxNum <= 20) return 'minibus'
      return 'bus'
    }

    // 6. Post-process: fill obvious gaps the AI missed (deterministic rules)
    const totalDays = parsed.days?.length || 0

    // Pre-scan: detect cruise day range (embarkation through last cruise sightseeing day)
    // Days within this range get the cruise transport package; vehicle/route/boat_rides are suppressed
    let cruiseStartIdx = -1  // embarkation day index
    let cruiseEndIdx = -1    // last cruise-related day (disembarkation sightseeing)
    for (let i = 0; i < totalDays; i++) {
      const d = parsed.days[i]
      const titleDesc = `${d.title || ''} ${d.description || ''}`.toLowerCase()
      const isCruise = /cruise|sailing|on board|nile cruise|embark|disembark/.test(titleDesc)
      // Also detect post-cruise sightseeing (e.g., "Luxor East Bank" after disembarkation)
      const isPostCruiseSightseeing = cruiseEndIdx === i - 1 && cruiseEndIdx >= 0 &&
        /valley|west bank|east bank|karnak|hatshepsut|luxor temple|colossi|edfu|kom ombo/i.test(titleDesc)
      if (isCruise || isPostCruiseSightseeing) {
        if (cruiseStartIdx === -1) cruiseStartIdx = i
        cruiseEndIdx = i
      }
    }
    if (cruiseStartIdx >= 0) {
      console.log(`Cruise range detected: Day ${cruiseStartIdx + 1} through Day ${cruiseEndIdx + 1}`)
    }

    const processedDays = (parsed.days || []).map((day: any, idx: number) => {
      const slots = day.slots || {}

      // Normalize all slot values to arrays (AI sometimes returns strings or single IDs)
      for (const [key, val] of Object.entries(slots)) {
        if (typeof val === 'string') slots[key] = val ? [val] : []
        else if (typeof val === 'number') continue  // custom amounts
        else if (!Array.isArray(val)) slots[key] = []
      }

      // Validate IDs: remove any that don't exist in the rate map
      for (const [key, val] of Object.entries(slots)) {
        if (Array.isArray(val)) {
          const validIds = (val as string[]).filter(id => allRatesFlat.has(id))
          if (validIds.length !== (val as string[]).length) {
            console.log(`Day ${day.dayNumber} "${key}": dropped ${(val as string[]).length - validIds.length} invalid IDs`)
          }
          slots[key] = validIds
        }
      }

      const isFirstDay = idx === 0
      const isLastDay = idx === totalDays - 1
      const isArrivalDay = isFirstDay || /\barrival\b/i.test(day.title || '')
      const isDepartureDay = isLastDay || /\bdeparture\b/i.test(day.title || '')
      const isCruiseDay = /cruise|sailing|on board|nile cruise/i.test(day.title || day.description || '')
      const isCruiseEmbarkation = /embark|board.*cruise|cruise.*embark|flight.*aswan.*cruise|fly.*aswan.*board/i.test(day.title || day.description || '')
      // Is this day within the cruise transport package range?
      const isInCruiseRange = cruiseStartIdx >= 0 && idx >= cruiseStartIdx && idx <= cruiseEndIdx
      const isCruiseRangeStart = idx === cruiseStartIdx
      // Sightseeing detection: from TITLE (not description — hotel names cause false positives)
      // NOTE: Arrival and departure days CAN have sightseeing (e.g., arrive Cairo + Alexandria day trip,
      // or departure day with Grand Museum visit). Don't exclude them.
      const hasSightseeing = (
        (slots.entrance_fees?.length > 0) ||
        /visit|tour|explore|sightsee|temple|pyramid|museum|bazaar|mosque|church|tomb|sphinx|khan|old cairo|citadel|valley|west bank|grand museum|memphis|alexandria|day tour/i.test(day.title || day.description || '')
      )

      // Helper: check if slot is empty (handles undefined, null, empty array)
      const isEmpty = (key: string) => !slots[key] || !Array.isArray(slots[key]) || slots[key].length === 0

      // Log DB rate counts for debugging
      if (idx === 0) {
        console.log('DB rate counts:', {
          guideRates: rawRates.guideRates?.length || 0,
          transportRates: rawRates.transportRates?.length || 0,
          mealRates: rawRates.mealRates?.length || 0,
          tippingRates: rawRates.tippingRates?.length || 0,
          hotelServiceRates: rawRates.hotelServiceRates?.length || 0,
          cruiseRates: rawRates.cruiseRates?.length || 0,
          accommodationRates: rawRates.accommodationRates?.length || 0,
          entranceFees: rawRates.entranceFees?.length || 0,
        })
      }

      // Touring day: auto-fill guide if missing
      // Guide IS needed on cruise sightseeing days (embarkation sightseeing, disembarkation sightseeing)
      // Guide is NOT needed on pure sailing days, arrival-only, departure-only
      const needsGuide = hasSightseeing || isCruiseEmbarkation ||
        /visit|tour|explore|sightsee|temple|pyramid|museum|tomb|valley|west bank|east bank|karnak|edfu|kom ombo|high dam|philae/i.test(day.title || day.description || '')
      if (needsGuide && !isDepartureDay && isEmpty('guide')) {
        const guide = rawRates.guideRates?.find((g: any) => /spanish|english/i.test(g.guide_language || ''))
          || rawRates.guideRates?.[0]
        if (guide) {
          slots.guide = [guide.id]
          console.log(`Day ${day.dayNumber}: AUTO-FILLED guide → ${guide.guide_language} (${guide.id})`)
        } else {
          console.log(`Day ${day.dayNumber}: FAILED to auto-fill guide — no guide rates in DB`)
        }
      }

      // Auto-fill route (all transport: day-tour vehicles + airport transfers + intercity transfers)
      // Route is now multi-select — a day can have multiple routes
      // Cruise transport package is handled separately below and ADDED to routes (not replacing them)
      const allTransportRoutes = rawRates.transportRates?.filter((t: any) =>
        t.service_type !== 'day_tour'
      ) || []
      const isFlightDay = /flight|fly/i.test(day.title || day.description || '')
      {
        const routes = allTransportRoutes
        const dayTourVehicles = rawRates.transportRates?.filter((t: any) => t.service_type === 'day_tour') || []
        const routeIds: string[] = [...(Array.isArray(slots.route) ? slots.route : [])]
        const paxNum = pax || 2
        const tier = pickTierForPax(paxNum)
        const cityLower = day.city?.toLowerCase()?.trim()
        const prevDay = idx > 0 ? parsed.days[idx - 1] : null
        const prevCity = prevDay?.city?.toLowerCase()?.trim() || ''
        const prevOvernightCity = (prevDay?.overnight_city || prevDay?.city || '')?.toLowerCase()?.trim()
        const nextDay = idx < totalDays - 1 ? parsed.days[idx + 1] : null
        const nextCity = nextDay?.city?.toLowerCase()?.trim() || ''
        const overnightCity = (day.overnight_city || day.city || '')?.toLowerCase()?.trim()

        // Extract ALL cities mentioned in this day's title and description
        // This catches multi-city days like "Luxor West Bank and Transfer to Hurghada"
        const KNOWN_CITIES = ['cairo', 'luxor', 'aswan', 'hurghada', 'sharm el sheikh', 'sharm', 'giza', 'alexandria', 'dahab', 'marsa alam', 'el gouna', 'siwa']
        const dayText = `${day.title || ''} ${day.description || ''}`.toLowerCase()
        const mentionedCities = KNOWN_CITIES.filter(c => dayText.includes(c))
        // Build complete set of cities involved in this day
        const allDayCities = new Set<string>()
        if (cityLower && cityLower !== 'cruise') allDayCities.add(cityLower)
        if (overnightCity && overnightCity !== 'cruise') allDayCities.add(overnightCity)
        mentionedCities.forEach(c => allDayCities.add(c))
        // On flight/transfer days, include the previous overnight city
        if (/flight|fly|transfer/i.test(day.title || day.description || '') && prevOvernightCity && prevOvernightCity !== 'cruise') {
          allDayCities.add(prevOvernightCity)
        }
        console.log(`Day ${day.dayNumber}: allDayCities=[${[...allDayCities].join(', ')}], city=${cityLower}, overnight=${overnightCity}, prevOvernight=${prevOvernightCity}`)

        // Helper: match city flexibly (handles "Cairo" vs "cairo", partial matches)
        const cityMatch = (dbCity: string | undefined, target: string) => {
          if (!dbCity || !target) return false
          const db = dbCity.toLowerCase().trim()
          // Filter out "cruise" as a city name
          if (db === 'cruise' || target === 'cruise') return false
          return db === target || db.includes(target) || target.includes(db)
        }

        // Helper: check if a DB city matches ANY of the day's cities
        const matchesAnyDayCity = (dbCity: string | undefined) => {
          if (!dbCity) return false
          for (const dc of allDayCities) {
            if (cityMatch(dbCity, dc)) return true
          }
          return false
        }

        // Helper: push tiered route ID (avoid duplicates)
        const pushRoute = (service: any, label: string) => {
          const tieredId = `${service.id}__${tier}`
          if (!routeIds.includes(tieredId)) {
            routeIds.push(tieredId)
            console.log(`Day ${day.dayNumber}: Route added: ${label} → ${service.service_type} ${service.origin_city}→${service.destination_city} (${tieredId})`)
          }
        }

        // --- DAY-TOUR VEHICLES (merged into route) ---
        // Any day with sightseeing gets a day-tour vehicle for the sightseeing city.
        // Exception: cruise days (covered by cruise transport package)
        // No fallback: if no vehicle exists for this city, skip (intercity transfer covers it for day trips)
        if (hasSightseeing && !isCruiseDay && !isInCruiseRange) {
          const sightseeingCity = cityLower
          const service = dayTourVehicles.find((t: any) =>
            cityMatch(t.origin_city, sightseeingCity!) || cityMatch(t.city, sightseeingCity!)
          )
          if (service) {
            pushRoute(service, 'day-tour vehicle')
          }
        }

        // --- AIRPORT TRANSFERS ---

        // Helper: match transport record's origin to a city (origin_city falls back to city field)
        const matchOrigin = (r: any, target: string) =>
          cityMatch(r.origin_city, target) || cityMatch(r.city, target)
        const matchDest = (r: any, target: string) =>
          cityMatch(r.destination_city, target)
        const matchAnyCity = (r: any, target: string) =>
          matchOrigin(r, target) || matchDest(r, target)

        // Arrival day (first day): airport → hotel
        if (isFirstDay) {
          const airportTransfer = routes.find((r: any) =>
            r.service_type === 'airport_transfer' && matchAnyCity(r, cityLower!)
          )
          if (airportTransfer) pushRoute(airportTransfer, 'arrival airport transfer')
        }

        // Departure day (last day): hotel → airport
        // The airport transfer is for the DEPARTURE city (this day's city, where the airport is)
        if (isLastDay) {
          const airportTransfer = routes.find((r: any) =>
            r.service_type === 'airport_transfer' && matchAnyCity(r, cityLower!)
          )
          if (airportTransfer) pushRoute(airportTransfer, 'departure airport transfer')
        }

        // Domestic flight day: airport transfers at BOTH departure city and arrival city
        // This also applies on first/last days that involve a domestic flight
        // (e.g., last day: fly from Hurghada to Cairo, sightsee, depart internationally)
        if (isFlightDay) {
          // Departure city = where we slept last night (previous overnight city)
          const depCity = prevOvernightCity || prevCity
          console.log(`Day ${day.dayNumber}: Flight day detected. depCity="${depCity}", arrCity="${cityLower}", airport_transfers in DB: ${routes.filter((r: any) => r.service_type === 'airport_transfer').map((r: any) => `${r.origin_city}/${r.destination_city}`).join(', ')}`)
          if (depCity && depCity !== 'cruise') {
            const depTransfer = routes.find((r: any) =>
              r.service_type === 'airport_transfer' && matchAnyCity(r, depCity)
            )
            if (depTransfer) {
              pushRoute(depTransfer, 'flight departure airport transfer')
            } else {
              console.log(`Day ${day.dayNumber}: WARNING — No airport transfer found for departure city "${depCity}"`)
            }
          }
          // Arrival city = this day's city
          if (cityLower) {
            const arrTransfer = routes.find((r: any) =>
              r.service_type === 'airport_transfer' &&
              matchAnyCity(r, cityLower) &&
              !routeIds.includes(`${r.id}__${tier}`) // avoid duplicate if same city
            )
            if (arrTransfer) {
              pushRoute(arrTransfer, 'flight arrival airport transfer')
            } else {
              console.log(`Day ${day.dayNumber}: WARNING — No airport transfer found for arrival city "${cityLower}"`)
            }
          }
        }

        // --- INTERCITY TRANSFERS ---
        // SYSTEMATIC APPROACH: Use allDayCities to find ALL relevant intercity transfers.
        // For any pair of cities mentioned in this day, check if there's a transfer route.
        // This handles: arrival from previous city, onward transfer, multi-city days, post-cruise transfers.
        //
        // CRUISE RANGE RULE: On the cruise END day (disembarkation), the cruise transport package
        // already covers getting from the cruise start city to the cruise end city. So we must NOT
        // add an intercity transfer that duplicates the cruise route (e.g., Aswan→Luxor when cruise
        // goes Aswan→Luxor). Only add transfers BEYOND the cruise (e.g., Luxor→Hurghada onward).
        {
          // Determine effective previous city (walk back past cruise days if needed)
          let effectivePrevCity = prevOvernightCity || prevCity
          if (effectivePrevCity === 'cruise' || !effectivePrevCity) {
            for (let j = idx - 1; j >= 0; j--) {
              const pc = (parsed.days[j]?.overnight_city || parsed.days[j]?.city || '').toLowerCase().trim()
              if (pc && pc !== 'cruise') {
                effectivePrevCity = pc
                break
              }
            }
          }

          // For cruise end day: the effectivePrevCity is the cruise START city (e.g., Aswan).
          // We should NOT add an intercity transfer from that city — the cruise package covers it.
          // Instead, only add transfers from the cruise END city (e.g., Luxor) onward.
          const isCruiseEndDay = cruiseEndIdx >= 0 && idx === cruiseEndIdx
          const cruiseStartCity = isCruiseEndDay && cruiseStartIdx >= 0
            ? (parsed.days[cruiseStartIdx]?.city || '').toLowerCase().trim()
            : ''

          // Add effective previous city to our city set ONLY if not on cruise end day
          // (on cruise end day, the "previous city" is the cruise start city which is already covered)
          if (effectivePrevCity && effectivePrevCity !== 'cruise' && !isCruiseEndDay) {
            allDayCities.add(effectivePrevCity)
          }

          // Now find all intercity transfers where BOTH origin and destination are in our city set
          const dayCityArray = [...allDayCities]
          const addedTransfers = new Set<string>()
          for (let i = 0; i < dayCityArray.length; i++) {
            for (let j = 0; j < dayCityArray.length; j++) {
              if (i === j) continue
              const fromCity = dayCityArray[i]
              const toCity = dayCityArray[j]

              // On cruise end day: skip any transfer FROM the cruise start city
              // (the cruise package already covers transport from cruise start to end city)
              if (isCruiseEndDay && cruiseStartCity && cityMatch(fromCity, cruiseStartCity)) continue

              // Only add if the transfer makes sense for this day:
              // 1. Arrival: effectivePrevCity → cityLower (coming from previous overnight)
              // 2. Onward: fromCity → overnightCity (relocating to a different overnight city)
              // 3. Day trip: overnightCity → mentioned city (round-trip to another city, returning same day)
              const isArrivalTransfer = fromCity === effectivePrevCity && allDayCities.has(toCity) && fromCity !== cityLower
              const isOnwardTransfer = toCity === overnightCity && fromCity !== toCity
              // Day trip: from the overnight city to a mentioned city that isn't the overnight city
              // (e.g., Cairo→Alexandria day trip when sleeping in Cairo)
              const isDayTripTransfer = fromCity === overnightCity && toCity !== overnightCity && mentionedCities.includes(toCity)
              if (!isArrivalTransfer && !isOnwardTransfer && !isDayTripTransfer) continue

              const transferKey = `${fromCity}->${toCity}`
              if (addedTransfers.has(transferKey)) continue

              const transfer = routes.find((r: any) =>
                ['intercity_transfer', 'intercity', 'city_transfer'].includes(r.service_type) &&
                matchOrigin(r, fromCity) &&
                matchDest(r, toCity)
              )
              if (transfer) {
                addedTransfers.add(transferKey)
                pushRoute(transfer, `intercity ${fromCity}→${toCity}`)
              }
            }
          }
          console.log(`Day ${day.dayNumber}: Intercity check with cities=[${dayCityArray.join(', ')}], effectivePrev=${effectivePrevCity}, isCruiseEnd=${isCruiseEndDay}, found ${addedTransfers.size} transfers`)
        }

        // Store all collected routes (but don't overwrite if cruise package handler will add more)
        if (routeIds.length > 0) {
          slots.route = routeIds
        }
      }

      // Auto-fill meals — respecting cruise full-board and hotel board basis
      // Rules:
      //   Cruise embarkation: lunch on board, dinner on board → NO outside meals
      //   Cruise sailing: all meals on board → NO outside meals
      //   Cruise disembarkation: breakfast on board only → may need lunch + dinner if sightseeing
      //   Hotel BB (bed & breakfast): needs lunch + dinner
      //   Hotel HB (half board): needs lunch only (dinner included)
      //   Hotel FB (full board): NO outside meals
      //   Hotel AI (all inclusive): NO outside meals
      //   Hotel RO (room only) or no board: needs lunch + dinner
      //   Arrival/departure days: no meals auto-filled
      if (isEmpty('meals') && !isArrivalDay && !isDepartureDay) {
        // Determine which meals are needed based on board type
        let needsLunch = false
        let needsDinner = false

        if (isInCruiseRange) {
          // Cruise range: full board on all days EXCEPT disembarkation (last cruise day)
          if (idx === cruiseEndIdx) {
            // Disembarkation day: breakfast on board, may need lunch + dinner if sightseeing
            if (hasSightseeing) {
              needsLunch = true
              needsDinner = true
            }
            console.log(`Day ${day.dayNumber}: Cruise disembarkation — breakfast on board, sightseeing=${hasSightseeing}`)
          } else {
            // Embarkation or sailing: all meals on board
            console.log(`Day ${day.dayNumber}: Cruise day — all meals on board, skipping outside meals`)
          }
        } else if (hasSightseeing) {
          // Non-cruise touring day: check hotel board basis
          const accIds = slots.accommodation || []
          let boardBasis = 'BB' // Default: bed & breakfast (needs lunch + dinner)

          if (accIds.length > 0) {
            // Look up the accommodation from DB to get board_basis
            const accId = accIds[0]
            const accRate = rawRates.accommodationRates?.find((r: any) => r.id === accId)
            if (accRate?.board_basis) {
              boardBasis = accRate.board_basis.toUpperCase()
            }
            // Also check the flat rate map for board_basis
            const flatRate = allRatesFlat.get(accId)
            if (flatRate?.board_basis) {
              boardBasis = flatRate.board_basis.toUpperCase()
            }
          }

          switch (boardBasis) {
            case 'FB': // Full board: breakfast + lunch + dinner included
            case 'AI': // All inclusive: everything included
              console.log(`Day ${day.dayNumber}: Hotel is ${boardBasis} — no outside meals needed`)
              break
            case 'HB': // Half board: breakfast + dinner included
              needsLunch = true
              console.log(`Day ${day.dayNumber}: Hotel is HB — only lunch needed from outside`)
              break
            case 'BB': // Bed & breakfast: only breakfast included
            case 'RO': // Room only: nothing included
            default:
              needsLunch = true
              needsDinner = true
              console.log(`Day ${day.dayNumber}: Hotel is ${boardBasis} — lunch + dinner needed from outside`)
              break
          }
        }

        // Find and add the needed meals
        if (needsLunch || needsDinner) {
          const cityLower = day.city?.toLowerCase()
          const cityMeals = rawRates.mealRates?.filter((m: any) =>
            m.city?.toLowerCase() === cityLower
          ) || []
          const mealIds: string[] = []
          if (needsLunch) {
            const lunch = cityMeals.find((m: any) => /lunch/i.test(m.meal_type || ''))
            if (lunch) mealIds.push(lunch.id)
          }
          if (needsDinner) {
            const dinner = cityMeals.find((m: any) => /dinner/i.test(m.meal_type || ''))
            if (dinner) mealIds.push(dinner.id)
          }
          if (mealIds.length > 0) {
            slots.meals = mealIds
            console.log(`Day ${day.dayNumber}: AUTO-FILLED ${mealIds.length} meals for ${day.city}`)
          } else {
            console.log(`Day ${day.dayNumber}: No meals found for city "${day.city}" (${rawRates.mealRates?.length || 0} total meal rates)`)
          }
        }
      }

      // Auto-fill water on EVERY day (people drink water every day)
      if (isEmpty('water')) {
        slots.water = ['water-standard']
      }

      // Touring day: auto-fill tipping if missing (driver + guide tip)
      // This includes arrival/departure days that have sightseeing
      if (hasSightseeing && !isCruiseDay && isEmpty('tipping')) {
        const tips = rawRates.tippingRates || []
        const driverTip = tips.find((t: any) => /driver.*day|TIP-DRIVER-DAY/i.test(t.role || t.service_code || ''))
          || tips.find((t: any) => /driver/i.test(t.role || t.service_code || ''))
        const guideTip = tips.find((t: any) => /guide/i.test(t.role || t.service_code || '') && !/driver/i.test(t.role || t.service_code || ''))
        const tipIds: string[] = []
        if (driverTip) tipIds.push(driverTip.id)
        if (guideTip) tipIds.push(guideTip.id)
        if (tipIds.length > 0) {
          slots.tipping = tipIds
          console.log(`Day ${day.dayNumber}: AUTO-FILLED ${tipIds.length} tips`)
        } else {
          console.log(`Day ${day.dayNumber}: No tips found (${tips.length} total tip rates)`)
        }
      }

      // Arrival/departure day: driver tip only
      if ((isArrivalDay || isDepartureDay) && isEmpty('tipping')) {
        const tips = rawRates.tippingRates || []
        const driverTip = tips.find((t: any) => /driver.*half|TIP-DRIVER-HALF/i.test(t.role || t.service_code || ''))
          || tips.find((t: any) => /driver/i.test(t.role || t.service_code || ''))
        if (driverTip) {
          slots.tipping = [driverTip.id]
          console.log(`Day ${day.dayNumber}: AUTO-FILLED arrival/departure driver tip`)
        }
      }

      // Hotel services: auto-fill if missing on non-cruise, non-last day
      if (!isCruiseDay && !isLastDay && isEmpty('hotel_services')) {
        const hotelSvc = rawRates.hotelServiceRates?.find((h: any) =>
          h.service_type === 'full_service' &&
          (h.hotel_category === (tier || 'standard') || h.hotel_category === 'all')
        ) || rawRates.hotelServiceRates?.[0]
        if (hotelSvc) {
          slots.hotel_services = [hotelSvc.id]
          console.log(`Day ${day.dayNumber}: AUTO-FILLED hotel service → ${hotelSvc.service_type} ${hotelSvc.hotel_category}`)
        }
      }

      // Cruise rate: charged per person per NIGHT (not flat for entire stay)
      // Add on every night the guest sleeps on the ship:
      // - All days in cruise range EXCEPT the last day (disembarkation day = sleep in hotel)
      const sleepsOnCruise = isInCruiseRange && idx < cruiseEndIdx
      if (sleepsOnCruise && isEmpty('cruise')) {
        const cruise = rawRates.cruiseRates?.[0]
        if (cruise) {
          slots.cruise = [cruise.id]
          console.log(`Day ${day.dayNumber}: AUTO-FILLED cruise night → ${cruise.ship_name} (€${cruise.rate_double_eur || cruise.rate_low_double_eur}/pp/night)`)
        } else {
          console.log(`Day ${day.dayNumber}: FAILED cruise auto-fill — ${rawRates.cruiseRates?.length || 0} cruise rates`)
        }
      }

      // Cruise transport package handling:
      // - On embarkation day (cruise range start): ADD the transport package to route slot
      //   (alongside any airport transfers that were already added above)
      // - On ALL days in cruise range: clear vehicle and boat_rides
      //   because the package covers ALL transportation within cruise (cars, felucca, motorboat, horse carriage)
      // - Route slot keeps any airport/intercity transfers that are OUTSIDE the cruise scope
      //   (e.g., Cairo airport transfer on the flight day, Luxor→Hurghada after cruise)
      if (isInCruiseRange) {
        // Clear individual transport slots — package covers everything within cruise
        slots.boat_rides = []

        if (isCruiseRangeStart) {
          // Cruise embarkation day: ADD the transport package alongside any pre-cruise transfers
          // (e.g., Cairo airport transfer for the flight to the cruise city)
          const pkg = rawRates.cruiseTransportPkgs?.[0]

          // On flight days, also ensure the departure city airport transfer is present
          // The flight-day code above should have added it, but verify it's in slots.route
          if (isFlightDay) {
            const prevDayData = idx > 0 ? parsed.days[idx - 1] : null
            const depCity = (prevDayData?.overnight_city || prevDayData?.city || '').toLowerCase().trim()
            const paxTier = pickTierForPax(pax || 2)
            const dayCityLower = day.city?.toLowerCase()?.trim()
            if (depCity && depCity !== 'cruise' && depCity !== dayCityLower) {
              const depTransfer = allTransportRoutes.find((r: any) => {
                if (r.service_type !== 'airport_transfer') return false
                const rc = (r.origin_city || r.city || '').toLowerCase().trim()
                return rc === depCity || rc.includes(depCity) || depCity.includes(rc)
              })
              if (depTransfer) {
                const tieredId = `${depTransfer.id}__${paxTier}`
                const currentRoutes = Array.isArray(slots.route) ? slots.route : []
                if (!currentRoutes.includes(tieredId)) {
                  slots.route = [...currentRoutes, tieredId]
                  console.log(`Day ${day.dayNumber}: Ensured pre-cruise airport transfer for ${depCity} (${tieredId})`)
                }
              }
            }
          }

          if (pkg) {
            const existingRoutes = Array.isArray(slots.route) ? slots.route : []
            if (!existingRoutes.includes(pkg.id)) {
              slots.route = [...existingRoutes, pkg.id]
            }
            console.log(`Day ${day.dayNumber}: AUTO-FILLED cruise transport package → ${pkg.package_name} (covers days ${cruiseStartIdx + 1}-${cruiseEndIdx + 1}), total routes: ${slots.route.length}`)
          } else {
            console.log(`Day ${day.dayNumber}: No cruise transport packages in DB`)
          }
        } else if (idx !== cruiseEndIdx) {
          // Mid-cruise sailing days: no individual routes needed (package is on embarkation day)
          // But keep any routes that were already set (e.g., from AI parse)
          if (isEmpty('route')) slots.route = []
        }
        // On cruise END day (last sightseeing): keep any onward transfers (e.g., Luxor→Hurghada)
        // Transfers within the cruise route are excluded by the intercity logic above
      }

      console.log(`Day ${day.dayNumber} "${day.title}": sightseeing=${hasSightseeing}, cruise=${isCruiseDay}, embark=${isCruiseEmbarkation}`,
        Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])))

      return { ...day, slots }
    })

    const enrichedDays = processedDays.map((day: any) => ({
      ...day,
      slots: enrichSlots(day.slots || {}, allRatesFlat)
    }))

    // AI FENCE (harness Layer 3): surface anything that must be reviewed before
    // this draft can become a deliverable price — catch-all slots the AI guessed
    // a number for (now zeroed + flagged) and fully AI-generated itineraries.
    const needsHumanInputCount = enrichedDays.reduce((sum: number, d: any) =>
      sum + Object.values(d.slots || {}).filter((s: any) => s?.needsHumanInput).length, 0)
    const needsReview = generationMode === 'generated' || needsHumanInputCount > 0
    const reviewReason = generationMode === 'generated'
      ? 'AI-generated draft — review every line before sending.'
      : needsHumanInputCount > 0
        ? `${needsHumanInputCount} catch-all amount(s) need manual entry — the AI's numbers are not used.`
        : null

    return NextResponse.json({
      success: true,
      days: enrichedDays,
      metadata: parsed.metadata || null,
      generationMode,
      needsReview,
      needsHumanInputCount,
      reviewReason,
    })
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

  // Expand transport rows into vehicle-tier entries (sedan, minivan, van, minibus, bus)
  const TIERS = [
    { key: 'sedan',   label: 'Sedan',   capMin: 1,  capMax: 2  },
    { key: 'minivan', label: 'Minivan', capMin: 3,  capMax: 7  },
    { key: 'van',     label: 'Van',     capMin: 8,  capMax: 12 },
    { key: 'minibus', label: 'Minibus', capMin: 13, capMax: 20 },
    { key: 'bus',     label: 'Bus',     capMin: 21, capMax: 45 },
  ]
  for (const r of rawRates.transportRates || []) {
    if (!r.id) continue
    const routeLabel = r.route_name || r.service_code || `${r.origin_city || r.city || ''}${r.destination_city ? '→' + r.destination_city : ''}`
    let hasTieredRates = false
    for (const t of TIERS) {
      const rate = toNum(r[`${t.key}_rate_eur`])
      if (rate > 0) {
        hasTieredRates = true
        map.set(`${r.id}__${t.key}`, {
          rateId: `${r.id}__${t.key}`,
          name: `${t.label} (${t.capMin}-${t.capMax} pax) — ${routeLabel}`,
          rateEur: rate,
          rateNonEur: toNum(r[`${t.key}_rate_non_eur`] || r[`${t.key}_rate_eur`]),
        })
      }
    }
    // Fallback: if no tiered columns exist, use legacy base_rate_eur
    if (!hasTieredRates && toNum(r.base_rate_eur) > 0) {
      const fallbackRate = toNum(r.base_rate_eur)
      for (const t of TIERS) {
        map.set(`${r.id}__${t.key}`, {
          rateId: `${r.id}__${t.key}`,
          name: `${t.label} (${t.capMin}-${t.capMax} pax) — ${routeLabel}`,
          rateEur: fallbackRate,
          rateNonEur: toNum(r.base_rate_non_eur || r.base_rate_eur),
        })
      }
      console.log(`Transport "${routeLabel}" (${r.id}): using legacy base_rate_eur=${fallbackRate} (no tiered columns)`)
    }
  }
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
    rateId: r.id, name: `${r.ship_name} (${r.duration_nights}N, ${r.cabin_type})`,
    rateEur: toNum(r.rate_double_eur || r.rate_low_double_eur), rateNonEur: toNum(r.rate_double_eur || r.rate_low_double_eur),
  }))

  // Cruise transport packages
  addAll(rawRates.cruiseTransportPkgs, (r: any) => ({
    rateId: r.id, name: `${r.package_name} (${r.origin_city}→${r.destination_city})`,
    rateEur: toNum(r.sedan_rate), rateNonEur: toNum(r.sedan_rate),
  }))
  // Flights
  addAll(rawRates.flightRates, (r: any) => ({
    rateId: r.id, name: `${r.airline} ${r.route_from}→${r.route_to} (${r.cabin_class})`,
    rateEur: toNum(r.base_rate_eur) + toNum(r.tax_eur), rateNonEur: toNum(r.base_rate_non_eur) + toNum(r.tax_non_eur),
  }))

  // Water (hardcoded — not from DB)
  map.set('water-standard', {
    rateId: 'water-standard', name: 'Water Bottles',
    rateEur: 0.50, rateNonEur: 0.50,
  })

  return map
}

function toNum(v: any): number {
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}
