// POST /api/pricing-grid/parse
// Parses pasted text (WhatsApp, email, itinerary) into day+service structure via AI.

import { NextRequest, NextResponse } from 'next/server'
import { createMessageWithRetry, getUserFriendlyError } from '@/lib/ai/anthropic-client'

const SYSTEM_PROMPT = `You are a travel itinerary parser. Given a WhatsApp conversation, email, or itinerary text, extract a day-by-day breakdown with services.

For each day, output:
- dayNumber: integer
- title: short title (e.g., "Arrival in Cairo", "Luxor West Bank")
- city: main city for the day
- description: brief description of activities

- services: object mapping slot IDs to selected service names/IDs:
  GROUP SLOTS (charged once per group):
  - vehicle: null (auto-selected by pax) unless special vehicle needed
  - route: route description if intercity transfer (e.g., "Luxor → Hurghada"), null for standard day tours
  - guide: "english" or "spanish" or null if no guide needed
  - airport_services: array of "arrival" and/or "departure" if airport meet is needed, else []
  - hotel_services: array of "checkin" and/or "checkout" if hotel porterage needed, else []
  - tipping: array of "driver_tip" and/or "guide_tip" based on who is present, else []
  - boat_rides: array of boat ride names if any (e.g., ["felucca"]), else []
  - other_group: 0

  PER-PERSON SLOTS (charged per traveler):
  - accommodation: hotel name or null (only for nights with hotel stay, not last day)
  - entrance_fees: array of attraction names visited (e.g., ["Karnak Temple", "Luxor Temple"]), else []
  - flights: array of flight routes if domestic flights (e.g., ["Cairo → Aswan"]), else []
  - experiences: array of experience names (e.g., ["Hot Air Balloon"]), else []
  - meals: array of included meals (e.g., ["lunch", "dinner"]), else []
  - water: "standard" for touring days, null for arrival/departure/free days
  - cruise: cruise ship name if it's a cruise day, null otherwise
  - other_pp: 0

RULES:
- Arrival day: airport_services=["arrival"], hotel_services=["checkin"], no guide, no entrance fees
- Departure day: airport_services=["departure"], hotel_services=["checkout"], no guide, no meals
- Cruise days: set cruise slot, NO separate accommodation, meals are included (empty meals array)
- Free/leisure days: minimal services (accommodation only, maybe water)
- Each touring day needs: vehicle, guide (if with guide), tipping, water, entrance_fees for sites visited

Output valid JSON only: { "days": [...] }`

export async function POST(request: NextRequest) {
  try {
    const { text, tier } = await request.json()

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ success: false, error: 'No text provided' }, { status: 400 })
    }

    const response = await createMessageWithRetry({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Parse this into a day-by-day itinerary with services. Tier: ${tier || 'standard'}\n\n${text}`
        }
      ]
    })

    // Extract JSON from response
    const responseText = response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('')

    // Parse JSON (handle potential markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ success: false, error: 'Failed to parse AI response as JSON' }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0])

    return NextResponse.json({ success: true, days: parsed.days || [] })
  } catch (error) {
    console.error('Parse error:', error)
    const { message, status } = getUserFriendlyError(error)
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
