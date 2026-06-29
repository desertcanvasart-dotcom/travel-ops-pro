// ============================================
// PROMPT BUILDER: AI generation functions
// Extracted from generate-itinerary/route.ts
// ============================================

import Anthropic from '@anthropic-ai/sdk'
import { type PackageType } from '@/lib/package-types'
import { createMessageWithRetry } from '@/lib/ai/anthropic-client'
import { MODEL_GENERATOR } from '@/lib/ai/models'
import {
  type ServiceTier,
  type ExtractedDay,
  TIER_DESCRIPTIONS,
  calculateExpectedDays,
  preParseRawItinerary,
} from '@/lib/ai/parsing-utils'
import { type WritingRule, buildWritingRulesContext } from '@/lib/ai/content-library'
import { EGYPT_TRAVEL_GLOSSARY } from '@/lib/ai/egypt-glossary'

// ============================================
// STRUCTURED MODE: FOLLOW PROVIDED ITINERARY
// ============================================

export async function generateFromStructuredInput(
  extractedDays: ExtractedDay[],
  rawItinerary: string,
  params: {
    tier: ServiceTier
    totalPax: number
    language: string
    attractionNames: string[]
    attractionMenu?: string
    writingRules: WritingRule[]
    packageType?: PackageType
    contentContext?: string
  }
): Promise<any> {
  const { tier, totalPax, language, attractionNames, attractionMenu, writingRules, packageType, contentContext } = params
  const writingContext = buildWritingRulesContext(writingRules)

  // Calculate expected number of days
  const expectedDays = calculateExpectedDays(rawItinerary, extractedDays)

  // PRE-PARSE the raw itinerary into day segments
  const daySegments = preParseRawItinerary(rawItinerary)

  console.log(`📋 STRUCTURED MODE: Pre-parsed ${daySegments.length} day segments, expecting ${expectedDays} days`)
  daySegments.forEach(seg => {
    console.log(`  Day ${seg.dayNumber}: ${seg.rawContent.substring(0, 80)}...`)
  })

  // Build the day-by-day mapping section
  const dayMappingSection = daySegments.map(seg => {
    return `
DAY ${seg.dayNumber} INPUT (CONVERT THIS EXACTLY):
───────────────────────────────────────
${seg.rawContent}
───────────────────────────────────────`
  }).join('\n')

  const prompt = `You are a DATA CONVERTER. Your ONLY task is to convert an existing itinerary into JSON format.

⛔ THIS IS NOT A CREATIVE TASK ⛔
You are NOT designing an itinerary. You are CONVERTING an existing one.
The input may be in Egyptian travel shorthand (D1 CAI, D2 ALX) OR in full prose English (Day 1 Arrival in Cairo...).
Either way, your job is the SAME: extract EXACTLY what is described and convert to JSON.

${EGYPT_TRAVEL_GLOSSARY}

═══════════════════════════════════════════════════════════════
⛔ FORBIDDEN ACTIONS - VIOLATING THESE IS A CRITICAL ERROR ⛔
═══════════════════════════════════════════════════════════════

1. FORBIDDEN: Adding attractions, cities, or activities NOT in the input
   - If Abu Simbel is not mentioned → DO NOT ADD IT
   - If Unfinished Obelisk is not mentioned → DO NOT ADD IT
   - If Aswan, Luxor, or a Nile Cruise is not mentioned → DO NOT ADD THEM
   - If the input says Cairo only → the output must be Cairo only

2. FORBIDDEN: Changing the itinerary type
   - If the input describes a HOTEL stay (e.g., "Marriott Mena House") → this is a LAND itinerary, NOT a cruise
   - If the input describes a Nile Cruise → keep it as a cruise
   - NEVER convert a hotel itinerary into a cruise or vice versa

3. FORBIDDEN: Removing or skipping activities from input
   - If Day 1 says "Alexandria tour" → Day 1 MUST include Alexandria
   - If Day 2 says "Pyramids & Museum" → Day 2 MUST include BOTH

4. FORBIDDEN: Reordering days or activities
   - Day 1 content goes in day_number: 1
   - Day 2 content goes in day_number: 2
   - NEVER put Day 1 content in day_number: 2

5. FORBIDDEN: "Improving" the itinerary
   - Do NOT add sites you think they "should" visit
   - Do NOT rearrange for "better flow"
   - Do NOT combine or split days
   - Do NOT add a Nile Cruise to a land-only itinerary

═══════════════════════════════════════════════════════════════
📋 EXACT DAY-BY-DAY INPUT TO CONVERT
═══════════════════════════════════════════════════════════════
${dayMappingSection}

═══════════════════════════════════════════════════════════════
📋 FULL RAW ITINERARY (for reference)
═══════════════════════════════════════════════════════════════
${rawItinerary}

═══════════════════════════════════════════════════════════════
🔍 DECODING RULES
═══════════════════════════════════════════════════════════════

CITY CODES:
CAI=Cairo, ALX=Alexandria, ASW=Aswan, LXR=Luxor, HRG=Hurghada, CRZ=Cruise

MULTI-CITY PATTERN:
"D1 CAI/ALX/CAI" = Day trip: Arrive Cairo → Visit Alexandria → Return Cairo
This is NOT just "Arrival" - it's arrival PLUS a FULL DAY TOUR!

DAY TRIPS (CRITICAL):
If the input mentions visiting a city and then RETURNING to the base hotel:
- "day trip to Alexandria" → overnight_city = base hotel city (e.g., "Cairo"), NOT "Alexandria"
- "return to Cairo" or "back to [city]" → confirms it's a day trip
- cities_visited = ["Cairo", "Alexandria"] but overnight_city = "Cairo"
- The hotel stay remains in the base city throughout

ARRIVAL DAYS (CRITICAL):
If the FIRST day is just "arrival" + "transfer to hotel" with NO sightseeing:
- is_arrival: true, is_transfer_only: true
- attractions: [] (EMPTY — do NOT list nearby landmarks)
- guide_required: false
- needs_airport_service: true, needs_hotel_service: true
If the first day has BOTH arrival AND sightseeing (e.g., "D1 CAI/ALX/CAI"):
- is_arrival: true, is_transfer_only: false
- List actual visited sites in attractions[]
- guide_required: true
- needs_airport_service: true, needs_hotel_service: true

DEPARTURE/FAREWELL DAYS (CRITICAL):
If input mentions "farewell", "departure", "airport transfer", "final breakfast":
- is_departure: true, is_transfer_only: true
- attractions: [] (EMPTY — do NOT list nearby landmarks)
- guide_required: false
- needs_airport_service: true, needs_hotel_service: true
- overnight_city should be the departure city (usually Cairo)

TRANSFER-ONLY RULE:
When is_transfer_only is true, the attractions array MUST be empty [].
Do NOT add landmarks just because the traveler can "see" them from the car/hotel.
A "glimpse of the pyramids" is NOT the same as "visiting the pyramids".

ENTRANCE FEE LOGIC:
DEFAULT: Any attraction that is actually VISITED (entered) = add to attractions[]
(OUTSIDE) = Photo stop only → add to photo_stops[] (NO entrance fee)
Do NOT use an "entrance_included" array. The "attractions" array IS the entrance fee list.
Only sites explicitly marked (OUTSIDE) go into photo_stops[] and are excluded from fees.

═══════════════════════════════════════════════════════════════
🎯 DATABASE ATTRACTION MENU (CRITICAL — use EXACT canonical names!)
═══════════════════════════════════════════════════════════════
Below is the COMPLETE list of attractions and activities with pricing in the database.
Each item shows its CANONICAL name (the one you MUST use), its type [entrance] or [activity],
and any known aliases in parentheses.

RULES:
1. ALWAYS use the CANONICAL name (the main name before [entrance]/[activity]), NEVER an alias
2. If the input mentions "Temple of Horus", look up that it's an alias for "Edfu Temple" → use "Edfu Temple"
3. If the input mentions "Pyramids" or "Sphinx", these are covered by "Giza Plateau" → use "Giza Plateau" (ONE entry, not two)
4. [entrance] = ticketed site with entrance fee → put in attractions[]
5. [activity] = bookable activity with activity rate → put in attractions[]
6. Anything NOT in this list = photo stop or non-ticketed → put in photo_stops[], NOT attractions[]
7. Do NOT invent attraction names. If it's not listed here, it doesn't have pricing.

${attractionMenu || attractionNames.join(', ')}

MEAL VENUES vs ATTRACTIONS (CRITICAL):
Restaurants, markets, and bazaars where tourists EAT are NOT attractions.
Do NOT add these to attractions[]:
- "Fish Market" (when it's for lunch/dinner, not sightseeing)
- Restaurant names
- "Khan El Khalili" (when it's for shopping/dining, not a guided visit with entrance fee)
If a place is BOTH a dining venue AND a tourist site, only add it to attractions[]
if the traveler is actually entering and touring it (not just eating there).

FREE DAYS:
"D5 CRZ" with nothing else = Sailing day → is_free_day: true, is_sailing_day: true
"D8 HRG" with nothing else = Free day → is_free_day: true

MEALS:
L = Lunch included
D = Dinner included
"Chinese Dinner" = Dinner at Chinese restaurant
"Pigeon Lunch" = Lunch with Egyptian pigeon dish

FLIGHTS:
MS956@05:10 = EgyptAir flight 956 at 05:10
"DEPARTED BY MS955@23:20" = Departure flight at 23:20

DOMESTIC FLIGHTS (between Egyptian cities, e.g., Cairo→Aswan, Luxor→Cairo):
- transport_type: "flight"
- flight_info: "MS956 arriving 05:10" (airline code + time)
- needs_airport_service: true (airport services needed at BOTH ends)
- is_arrival: false, is_departure: false (these are for international only)
- Guide is NOT needed during the flight/transfer portions
- If sightseeing happens after landing, set guide_required: true and list attractions normally

INTERCITY ROAD TRANSFERS (driving between cities, e.g., Aswan→Luxor, Luxor→Hurghada, Cairo→Alexandria overnight):
- The "city" field must reflect the DESTINATION city (where the day ends)
- The "overnight_city" must be the city where the traveler sleeps that night
- needs_hotel_service: true (check-out at origin, check-in at destination)
- If sightseeing at the destination: guide_required: true and list attractions normally
- If transfer only (no sightseeing): is_transfer_only: true
- This is DIFFERENT from a day trip — a day trip returns to the same city (overnight_city stays the same)
- NOTE: Do NOT confuse intercity road transfers with day trips. "Drive to Luxor" = intercity. "Day trip to Alexandria and return" = day trip.

═══════════════════════════════════════════════════════════════
⚙️ CONFIGURATION
═══════════════════════════════════════════════════════════════
TOTAL DAYS: ${expectedDays}
TIER: ${tier.toUpperCase()}
TRAVELERS: ${totalPax}
LANGUAGE: ${language}
PACKAGE: ${packageType || 'land-package'}
${packageType === 'tours-only' || packageType === 'day-trips' ? `
⚠️ TOURS-ONLY/DAY-TRIPS PACKAGE (CRITICAL):
This is a TOURS-ONLY package - NO accommodation is included!
- Set overnight_city to NULL for all days
- Set accommodation_type to NULL for all days
- Set needs_hotel_service to FALSE for all days
- DO NOT mention overnight stays or accommodation in descriptions
- This is guide + transport + entrance fees ONLY
` : ''}${packageType === 'cruise-package' || packageType === 'cruise-land' ? `
⚠️ NILE CRUISE PACKAGE (CRITICAL):
This is a ${packageType === 'cruise-package' ? 'CRUISE-ONLY' : 'CRUISE + LAND'} package!
- Set is_cruise_day: true for ALL days spent on the Nile cruise
- Set accommodation_type: "cruise" for ALL cruise days (NOT "hotel")
- Set is_sailing_day: true for days with NO tours (just sailing on the Nile)
- Cruise days do NOT need individual transport (transport is bundled)
- Meals on cruise days are typically included (Full Board: breakfast, lunch, dinner)
- The last day (departure/disembarkation) should have is_cruise_day: false

⚠️ CRUISE TRANSPORT BUNDLE (CRITICAL — DO NOT ADD THESE AS ATTRACTIONS):
On cruise days, the following are INCLUDED in the bundled cruise transport package.
They are NOT separate attractions or activities — do NOT put them in attractions[] or photo_stops[]:
- Felucca ride / Felucca sailboat ride (included in cruise transport)
- Horse carriage ride (included in cruise transport)
- Motorboat ride (included in cruise transport)
- Camel ride (included in cruise transport)
These are transport/experience items bundled with the cruise, not ticketed entrance sites.
If the itinerary mentions a felucca ride on a cruise day, describe it in the day description
but do NOT add it to attractions[]. It has no separate fee.
` : ''}
${language !== 'English' ? `
⚠️ LANGUAGE REQUIREMENT (CRITICAL):
Write ALL content (trip_name, title, description) in ${language}.
- trip_name must be in ${language}
- Each day's title must be in ${language}
- Each day's description must be in ${language}
- City names should remain in English for internal use
- Attraction names must remain EXACT as provided (in English) for database matching
` : `
⚠️ LANGUAGE: Write ALL content (trip_name, title, description) in ENGLISH.
- ALL attraction names MUST be in English
- Do NOT use Japanese, Arabic, or any non-Latin characters
- City names in English
`}
═══════════════════════════════════════════════════════════════
📝 DESCRIPTION WRITING GUIDELINES
═══════════════════════════════════════════════════════════════
When writing the "description" field for each day, use the curated descriptions
below as source material. Adapt them to fit the day's specific activities but
preserve the brand voice and key factual details from the content library.
Do NOT invent details for attractions that have curated content available.

${contentContext || 'Write professional 2-3 sentence descriptions.'}
${writingContext}
═══════════════════════════════════════════════════════════════
📤 OUTPUT FORMAT (Return ONLY valid JSON)
═══════════════════════════════════════════════════════════════

{
  "trip_name": "Egypt: Cairo, Nile Cruise & Hurghada",
  "total_days": ${expectedDays},
  "days": [
    {
      "day_number": 1,
      "date": null,
      "title": "Day 1: Arrival & Alexandria Day Trip",
      "description": "2-3 sentences describing ONLY what is in the input",
      "city": "Cairo",
      "cities_visited": ["Cairo", "Alexandria"],
      "overnight_city": "Cairo",
      "accommodation_type": "hotel",

      "is_arrival": true,
      "is_departure": false,
      "is_transfer_only": false,
      "is_free_day": false,
      "is_cruise_day": false,
      "is_sailing_day": false,

      "attractions": ["Pompey's Pillar", "Qaitbay Citadel", "Alexandria Library", "Montazah Park"],
      "photo_stops": ["Alexandria Library"],

      "activities": ["Airport arrival", "Transfer to Alexandria", "Visit Pompey's Pillar", "Visit Qaitbay Citadel", "Photo stop at Alexandria Library", "Visit Montazah Park", "Lunch", "Return to Cairo", "Dinner"],
      "guide_required": true,

      "includes_lunch": true,
      "includes_dinner": true,
      "meal_notes": null,

      "flight_info": "MS956 arriving 05:10",
      "transport_type": "flight",

      "needs_airport_service": true,
      "needs_hotel_service": true
    }
  ]
}

═══════════════════════════════════════════════════════════════
✅ VERIFICATION CHECKLIST (Complete before responding)
═══════════════════════════════════════════════════════════════

□ I have exactly ${expectedDays} day objects in my response
□ Day 1 contains ALL activities from D1/Day 1 input (not just "arrival")
□ Day 2 contains ALL activities from D2/Day 2 input
□ Each day's content matches ONLY what was in that day's input
□ I did NOT add Abu Simbel, Unfinished Obelisk, or other sites not mentioned
□ DAY TRIPS: If input says "return to Cairo" or "back to [city]", the overnight_city is the RETURN city, NOT the visited city
□ OVERNIGHT CITIES: If the hotel is in Cairo and they take a day trip, overnight_city = "Cairo" (not the day-trip destination)
□ ARRIVAL DAY: First day of multi-day package has is_arrival: true, needs_airport_service: true, needs_hotel_service: true
□ ARRIVAL DAY: If first day has NO sightseeing (just arrival+transfer), set is_transfer_only: true, attractions: []
□ DEPARTURE DAY: Last day has is_departure: true, needs_airport_service: true, needs_hotel_service: true
□ DEPARTURE DAY: If last day has NO sightseeing (just farewell/transfer), set is_transfer_only: true, attractions: []
□ TRANSFER-ONLY: When is_transfer_only is true, attractions MUST be [] and guide_required MUST be false
□ MEAL VENUES: Restaurants and dining venues (Fish Market, etc.) are NOT in attractions[]
□ ALL attraction names are in ENGLISH (no Japanese, Arabic, or other non-Latin names)
□ Free/sailing days have is_free_day: true
□ ALL attractions are in the attractions[] array (entrance fees apply by default)
□ ONLY sites explicitly marked (OUTSIDE) are in photo_stops[] (NO fee)
□ There is NO "entrance_included" array in the output
□ Flight arrivals have needs_airport_service: true
□ Domestic flights between cities: transport_type: "flight", needs_airport_service: true, is_arrival: false, is_departure: false
□ Intercity road transfers: city = destination city, overnight_city = destination city, needs_hotel_service: true
□ Day trips: city = destination BUT overnight_city = BASE city (traveler returns to same hotel)
□ The last day with activities includes everything mentioned (not just "departure")

NOW CONVERT THE ITINERARY TO JSON:`

  console.log('🤖 Sending STRICT structured prompt to AI...')

  const message = await createMessageWithRetry({
    model: MODEL_GENERATOR,
    max_tokens: 16384,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  })

  const responseText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')

  // Parse JSON
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('❌ Failed to parse AI response:', responseText.substring(0, 500))
    throw new Error('Failed to parse AI response as JSON')
  }

  const result = JSON.parse(jsonMatch[0])

  // ============================================
  // POST-GENERATION VALIDATION
  // ============================================

  // Validate day count
  if (result.days && result.days.length < expectedDays) {
    console.warn(`⚠️ AI returned ${result.days.length} days but expected ${expectedDays}`)
  } else {
    console.log(`✅ AI successfully generated ${result.days?.length || 0} days`)
  }

  // Log first day for debugging
  if (result.days && result.days[0]) {
    console.log('📍 Day 1 generated:', {
      title: result.days[0].title,
      attractions: result.days[0].attractions,
      cities_visited: result.days[0].cities_visited
    })
  }

  // HALLUCINATION CHECK: Verify output cities match input cities
  if (result.days && daySegments.length > 0) {
    const outputCities = result.days.map((d: any) => (d.city || '').toLowerCase()).filter(Boolean)

    // Check if AI hallucinated cruise days when input has no cruise
    const inputHasCruise = /\b(crz|nile\s*cruise|cruise)\b/i.test(rawItinerary)
    const outputHasCruise = result.days.some((d: any) =>
      d.is_cruise_day === true ||
      d.accommodation_type === 'cruise' ||
      /\b(cruise|sailing|nile)\b/i.test(d.title || '') && /\b(on board|sailing)\b/i.test(d.title || '')
    )

    if (!inputHasCruise && outputHasCruise) {
      console.error('🚨 HALLUCINATION DETECTED: AI generated cruise days but input has NO cruise!')
      console.error('🚨 Stripping cruise flags from output...')
      // Strip cruise flags — force to land itinerary
      result.days.forEach((d: any) => {
        d.is_cruise_day = false
        d.is_sailing_day = false
        if (d.accommodation_type === 'cruise') d.accommodation_type = 'hotel'
      })
    }

    // CRUISE DAY CONSISTENCY FIX: Ensure all days between first and last cruise day are marked
    // The AI sometimes marks only the embarkation day, missing sailing/touring days
    if (inputHasCruise && outputHasCruise) {
      const cruiseDayIndices = result.days
        .map((d: any, i: number) => (d.is_cruise_day || d.accommodation_type === 'cruise') ? i : -1)
        .filter((i: number) => i >= 0)

      if (cruiseDayIndices.length > 0) {
        const firstCruise = cruiseDayIndices[0]
        const lastCruise = cruiseDayIndices[cruiseDayIndices.length - 1]

        // Also detect cruise nights from input (e.g., "3NTS CRZ")
        const cruiseNightsMatch = rawItinerary.match(/(\d+)\s*(?:NTS?|nights?)\s*(?:CRZ|cruise)/i)
        const expectedCruiseNights = cruiseNightsMatch ? parseInt(cruiseNightsMatch[1]) : 0

        // Fill gaps between first and last marked cruise day
        let fixedCount = 0
        for (let i = firstCruise; i <= lastCruise; i++) {
          const day = result.days[i]
          if (!day.is_cruise_day && day.accommodation_type !== 'cruise') {
            day.is_cruise_day = true
            day.accommodation_type = 'cruise'
            fixedCount++
          }
        }

        // If we know expected cruise nights and they exceed the range, extend forward
        const actualCruiseDays = lastCruise - firstCruise + 1
        if (expectedCruiseNights > 0 && actualCruiseDays < expectedCruiseNights) {
          const missingDays = expectedCruiseNights - actualCruiseDays
          for (let i = 1; i <= missingDays; i++) {
            const idx = lastCruise + i
            if (idx < result.days.length) {
              const day = result.days[idx]
              // Only extend if this day isn't already a land day with hotel + specific sightseeing outside cruise ports
              if (!day.is_departure && !day.is_arrival) {
                day.is_cruise_day = true
                day.accommodation_type = 'cruise'
                // If no activities, mark as sailing day
                if (!day.attractions?.length) {
                  day.is_sailing_day = true
                  day.is_free_day = true
                }
                fixedCount++
                console.log(`🚢 Extended cruise to Day ${day.day_number} (expected ${expectedCruiseNights} nights)`)
              }
            }
          }
        }

        if (fixedCount > 0) {
          console.log(`🚢 Fixed ${fixedCount} cruise day(s) that were not marked by AI`)
        }
      }
    }

    // Check if AI hallucinated cities not in input (e.g., Aswan/Luxor when input says Cairo)
    const inputMentionsCairo = /\b(cairo|cai|giza|gza|pyramid|museum|mena\s*house)\b/i.test(rawItinerary)
    const inputMentionsUpperEgypt = /\b(aswan|asw|luxor|lxr|kom\s*ombo|edfu|abu\s*simbel|philae|valley\s*of\s*(the\s*)?kings)\b/i.test(rawItinerary)
    const outputMentionsUpperEgypt = outputCities.some((c: string) =>
      /\b(aswan|luxor|kom\s*ombo|edfu)\b/i.test(c)
    )

    if (inputMentionsCairo && !inputMentionsUpperEgypt && outputMentionsUpperEgypt) {
      console.error('🚨 HALLUCINATION DETECTED: AI added Upper Egypt cities (Aswan/Luxor) but input only mentions Cairo area!')
      console.error('🚨 This is a critical hallucination — the AI ignored the input entirely.')
    }
  }

  return result
}

// ============================================
// CREATIVE MODE: AI GENERATES ITINERARY
// ============================================

export async function generateCreativeItinerary(
  params: {
    clientName: string
    tourName: string
    durationDays: number
    tier: ServiceTier
    totalPax: number
    numAdults: number
    numChildren: number
    language: string
    cities: string[]
    interests: string[]
    specialRequests: string[]
    startDate: string
    effectiveCity: string
    attractionNames: string[]
    attractionMenu?: string
    contentContext: string
    writingContext: string
    includeLunch: boolean
    includeDinner: boolean
    includeAccommodation: boolean
    // Optional agent-memory personalisation block (learned client/pricing/
    // inquiry/supplier patterns). Empty string when there's nothing learned yet.
    memoryContext?: string
  }
): Promise<any> {
  const {
    clientName, tourName, durationDays, tier, totalPax, numAdults, numChildren,
    language, cities, interests, specialRequests, startDate, effectiveCity,
    attractionNames, attractionMenu, contentContext, writingContext, includeLunch, includeDinner, includeAccommodation,
    memoryContext,
  } = params

  const prompt = `Create a ${durationDays}-day Egypt itinerary.
${memoryContext ? `\n${memoryContext}\n` : ''}
${EGYPT_TRAVEL_GLOSSARY}

CLIENT: ${clientName}
TOUR: ${tourName}
DATE: ${startDate}
TRAVELERS: ${numAdults} adults${numChildren > 0 ? `, ${numChildren} children` : ''}
TIER: ${tier.toUpperCase()} (${TIER_DESCRIPTIONS[tier]})
CITIES: ${cities.length > 0 ? cities.join(', ') : effectiveCity}
${interests.length > 0 ? `INTERESTS: ${interests.join(', ')}` : ''}
${specialRequests.length > 0 ? `SPECIAL REQUESTS: ${specialRequests.join(', ')}` : ''}

═══════════════════════════════════════════════════════════════
🎯 DATABASE ATTRACTION MENU (CRITICAL — use EXACT canonical names!)
═══════════════════════════════════════════════════════════════
Below is the COMPLETE list of attractions and activities with pricing in the database.
Each item shows its CANONICAL name (the one you MUST use), its type [entrance] or [activity],
and any known aliases in parentheses.

RULES:
1. ALWAYS use the CANONICAL name (the main name before [entrance]/[activity]), NEVER an alias
2. If a common name is listed as an alias, use the canonical name instead
   (e.g., "Temple of Horus" is an alias → use "Edfu Temple")
3. Combined tickets: "Giza Plateau" covers Pyramids + Sphinx — use ONE entry "Giza Plateau"
4. [entrance] = ticketed site with entrance fee → put in attractions[]
5. [activity] = bookable activity with activity rate → put in attractions[]
6. Anything NOT in this list = photo stop or non-ticketed → put in photo_stops[], NOT attractions[]
7. Do NOT invent attraction names. If it's not listed here, it doesn't have pricing.
8. Only select attractions from cities the client is visiting.

${attractionMenu || attractionNames.join(', ')}
═══════════════════════════════════════════════════════════════

${contentContext}
${writingContext}

CONTENT USAGE RULE:
When describing attractions listed in the CURATED CONTENT LIBRARY above,
use the provided descriptions and highlights as the basis for your writing.
Adapt the curated text to fit naturally within the day narrative, but preserve
the brand voice, key details, and factual information. Do NOT invent descriptions
for attractions that have curated content available.

PACKAGE INCLUDES:
- Transportation: Yes (private vehicle)
- Guide: Yes (${language} speaking)
- Entrance Fees: Yes (all attractions in the "attractions" array get entrance fees automatically)

ENTRANCE FEE RULE:
- All sites in "attractions" array = entrance fee included (default)
- If a site is a photo stop only (outside viewing), add it to "photo_stops" array instead
- Lunch: ${includeLunch ? 'Yes' : 'No'}
- Dinner: ${includeDinner ? 'Yes' : 'No'}
- Hotels: ${includeAccommodation ? 'Yes (except last day)' : 'No'}

PLANNING GUIDELINES:
1. Create a logical flow between cities (don't jump around)
2. First day typically arrival + lighter activities
3. Last day typically departure transfer
4. Group nearby attractions on the same day
5. Include realistic driving times
6. For ${tier} tier: ${TIER_DESCRIPTIONS[tier]}

CRUISE TRANSPORT BUNDLE (if cruise days exist):
On cruise days, the following are INCLUDED in the bundled cruise transport package.
They are NOT separate attractions or activities — do NOT put them in attractions[] or photo_stops[]:
- Felucca ride / Felucca sailboat ride (included in cruise transport)
- Horse carriage ride (included in cruise transport)
- Motorboat ride (included in cruise transport)
- Camel ride (included in cruise transport)
If mentioning these, describe them in the day description but NOT in attractions[].

CRITICAL CONSTRAINTS:
- ONLY use cities from the CITIES list above. Do NOT add cities not mentioned.
- If no Nile Cruise / CRZ is mentioned, do NOT create a cruise itinerary.
- If no Aswan/Luxor is mentioned, do NOT add Upper Egypt destinations.
- Stay faithful to the client's request — do not "improve" by adding unrelated destinations.
- Do NOT generate a Nile Cruise unless the client explicitly asks for one.
${language !== 'English' ? `
LANGUAGE REQUIREMENT (CRITICAL):
Write ALL content (trip_name, title, description) in ${language}.
- trip_name must be in ${language}
- Each day's title must be in ${language}
- Each day's description must be in ${language}
- City names should remain in their original English form for internal use
- Attraction names must remain EXACT as provided (in English) for database matching
` : `
LANGUAGE: Write ALL content in ENGLISH.
- ALL text must be in English
- ALL attraction names MUST be in English (no Japanese, Arabic, or other scripts)
`}
Return ONLY valid JSON:
{
  "trip_name": "Descriptive Trip Name",
  "total_days": ${durationDays},
  "days": [
    {
      "day_number": 1,
      "title": "Day 1: Arrival in Cairo",
      "description": "Professional 2-3 sentence description of the day",
      "city": "Cairo",
      "overnight_city": "Cairo",
      "is_arrival": true,
      "is_departure": false,
      "is_transfer_only": false,
      "attractions": ["Exact Attraction Name"],
      "photo_stops": [],
      "is_cruise_day": false,
      "accommodation_type": "hotel",
      "guide_required": true,
      "includes_lunch": ${includeLunch},
      "includes_dinner": ${includeDinner},
      "includes_hotel": ${includeAccommodation}
    }
  ]
}

Use EXACT attraction names from the provided list. Set includes_hotel to false on the last day.
For cruise packages: set is_cruise_day: true and accommodation_type: "cruise" for all days on the Nile cruise.`

  const message = await createMessageWithRetry({
    model: MODEL_GENERATOR,
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  })

  const responseText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response as JSON')
  }

  return JSON.parse(jsonMatch[0])
}
