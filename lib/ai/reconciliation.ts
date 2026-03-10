/**
 * Reconciliation Layer
 *
 * Runs AFTER AI generation but BEFORE applyDayRules().
 * Cross-checks AI-generated itinerary days against parser-extracted data
 * and forces corrections where the AI dropped or changed information.
 *
 * Pure function: no side effects, no database access.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeStr(s: string): string {
  return (s || '').trim().toLowerCase()
}

function arrContains(arr: string[], target: string): boolean {
  const norm = normalizeStr(target)
  return arr.some(item => normalizeStr(item) === norm)
}

// ---------------------------------------------------------------------------
// Day matching
// ---------------------------------------------------------------------------

interface DayPair {
  ai: any
  parser: any
}

function matchDays(aiDays: any[], parserDays: any[]): DayPair[] {
  const pairs: DayPair[] = []
  const usedParserIndices = new Set<number>()

  // Primary: match by day_number
  for (const aiDay of aiDays) {
    const idx = parserDays.findIndex(
      (p, i) => !usedParserIndices.has(i) && p.day_number === aiDay.day_number
    )
    if (idx >= 0) {
      pairs.push({ ai: aiDay, parser: parserDays[idx] })
      usedParserIndices.add(idx)
    }
  }

  // Fallback: match remaining AI days by array position
  const unmatchedAi = aiDays.filter(
    d => !pairs.some(p => p.ai === d)
  )
  const unmatchedParser = parserDays.filter(
    (_, i) => !usedParserIndices.has(i)
  )
  for (let i = 0; i < Math.min(unmatchedAi.length, unmatchedParser.length); i++) {
    pairs.push({ ai: unmatchedAi[i], parser: unmatchedParser[i] })
  }

  if (unmatchedAi.length > unmatchedParser.length) {
    console.warn(
      `⚠️ Reconciliation: ${unmatchedAi.length - unmatchedParser.length} AI day(s) had no parser match`
    )
  }

  return pairs
}

// ---------------------------------------------------------------------------
// Main reconciliation
// ---------------------------------------------------------------------------

export function reconcileWithParserData(
  aiDays: any[],
  parserDays: any[] | null
): any[] {
  if (!parserDays || parserDays.length === 0) {
    return aiDays
  }

  const pairs = matchDays(aiDays, parserDays)
  let attractionsAdded = 0
  let attractionsMoved = 0
  let mealsForced = 0
  let flightsForced = 0
  let overnightCityCorrected = 0
  let citiesAdded = 0
  let cruiseDaysForced = 0

  for (const { ai: aiDay, parser: parserDay } of pairs) {
    const dayNum = aiDay.day_number || '?'

    // -----------------------------------------------------------------
    // RULE 1: Attractions recovery
    // Parser's entrance_included[] → AI's attractions[]
    // -----------------------------------------------------------------
    const parserInside: string[] = parserDay.entrance_included || []
    const aiAttractions: string[] = aiDay.attractions || []
    const aiPhotoStops: string[] = aiDay.photo_stops || []

    for (const attr of parserInside) {
      if (!arrContains(aiAttractions, attr) && !arrContains(aiPhotoStops, attr)) {
        aiDay.attractions = aiDay.attractions || []
        aiDay.attractions.push(attr)
        attractionsAdded++
        console.log(`🔧 Reconciliation Day ${dayNum}: Restored attraction "${attr}" (parser: INSIDE)`)
      }
    }

    // Also check parser's general attractions[] for anything the AI dropped
    const parserAttractions: string[] = parserDay.attractions || []
    for (const attr of parserAttractions) {
      const currentAiAttractions: string[] = aiDay.attractions || []
      const currentAiPhotoStops: string[] = aiDay.photo_stops || []
      if (!arrContains(currentAiAttractions, attr) && !arrContains(currentAiPhotoStops, attr)) {
        // Only add if it's in entrance_included or not in photo_stops
        const isPhotoStop = arrContains(parserDay.photo_stops || [], attr)
        if (!isPhotoStop) {
          aiDay.attractions = aiDay.attractions || []
          aiDay.attractions.push(attr)
          attractionsAdded++
          console.log(`🔧 Reconciliation Day ${dayNum}: Restored attraction "${attr}" (parser: attractions)`)
        }
      }
    }

    // -----------------------------------------------------------------
    // RULE 2: Photo stops correction (OUTSIDE markers)
    // If parser says OUTSIDE but AI put it in attractions[], move it
    // -----------------------------------------------------------------
    const parserPhotoStops: string[] = parserDay.photo_stops || []

    for (const stop of parserPhotoStops) {
      const currentAttractions: string[] = aiDay.attractions || []
      const idx = currentAttractions.findIndex(
        (a: string) => normalizeStr(a) === normalizeStr(stop)
      )
      if (idx >= 0) {
        // Remove from attractions
        aiDay.attractions.splice(idx, 1)
        // Add to photo_stops if not already there
        aiDay.photo_stops = aiDay.photo_stops || []
        if (!arrContains(aiDay.photo_stops, stop)) {
          aiDay.photo_stops.push(stop)
        }
        attractionsMoved++
        console.log(`🔧 Reconciliation Day ${dayNum}: Moved "${stop}" to photo_stops (parser: OUTSIDE)`)
      }

      // Also ensure OUTSIDE sites not in attractions even if AI re-added them
      // (they should only be in photo_stops)
      if (!arrContains(aiDay.photo_stops || [], stop)) {
        aiDay.photo_stops = aiDay.photo_stops || []
        aiDay.photo_stops.push(stop)
      }
    }

    // -----------------------------------------------------------------
    // RULE 3: Meals recovery
    // Parser's meals_included.lunch/dinner → AI's includes_lunch/dinner
    // -----------------------------------------------------------------
    const parserMeals = parserDay.meals_included
    if (parserMeals && typeof parserMeals === 'object') {
      if (parserMeals.lunch === true && aiDay.includes_lunch !== true) {
        aiDay.includes_lunch = true
        mealsForced++
        console.log(`🔧 Reconciliation Day ${dayNum}: Forced includes_lunch=true (parser detected lunch)`)
      }
      if (parserMeals.dinner === true && aiDay.includes_dinner !== true) {
        aiDay.includes_dinner = true
        mealsForced++
        console.log(`🔧 Reconciliation Day ${dayNum}: Forced includes_dinner=true (parser detected dinner)`)
      }
    }

    // -----------------------------------------------------------------
    // RULE 4: Flight recovery
    // Parser's transport_type/flight_info → AI's transport_type/flight_info
    // -----------------------------------------------------------------
    if (parserDay.transport_type === 'flight' && aiDay.transport_type !== 'flight') {
      aiDay.transport_type = 'flight'
      flightsForced++
      console.log(`🔧 Reconciliation Day ${dayNum}: Forced transport_type="flight" (parser detected flight)`)
    }
    if (parserDay.flight_info && !aiDay.flight_info) {
      aiDay.flight_info = parserDay.flight_info
      flightsForced++
      console.log(`🔧 Reconciliation Day ${dayNum}: Restored flight_info="${parserDay.flight_info}"`)
    }

    // -----------------------------------------------------------------
    // RULE 5: Overnight city correction
    // Parser's explicit notation is authoritative for overnight_city
    // -----------------------------------------------------------------
    if (parserDay.overnight_city && aiDay.overnight_city) {
      if (normalizeStr(parserDay.overnight_city) !== normalizeStr(aiDay.overnight_city)) {
        console.log(
          `🔧 Reconciliation Day ${dayNum}: Corrected overnight_city ` +
          `"${aiDay.overnight_city}" → "${parserDay.overnight_city}" (parser authoritative)`
        )
        aiDay.overnight_city = parserDay.overnight_city
        overnightCityCorrected++
      }
    }

    // -----------------------------------------------------------------
    // RULE 6: Cities visited merge
    // -----------------------------------------------------------------
    const parserCities: string[] = parserDay.cities_visited || []
    if (parserCities.length > 0) {
      aiDay.cities_visited = aiDay.cities_visited || []
      for (const city of parserCities) {
        if (!arrContains(aiDay.cities_visited, city)) {
          aiDay.cities_visited.push(city)
          citiesAdded++
          console.log(`🔧 Reconciliation Day ${dayNum}: Added city "${city}" to cities_visited`)
        }
      }
    }

    // -----------------------------------------------------------------
    // RULE 7: Cruise day enforcement
    // -----------------------------------------------------------------
    if (parserDay.is_cruise_day === true && aiDay.is_cruise_day !== true) {
      aiDay.is_cruise_day = true
      aiDay.accommodation_type = 'cruise'
      cruiseDaysForced++
      console.log(`🔧 Reconciliation Day ${dayNum}: Forced is_cruise_day=true (parser detected cruise)`)
    }

    // -----------------------------------------------------------------
    // RULE 8: City correction for first day (arrival city)
    // If parser says city is X but AI set it to Y, prefer parser
    // This fixes the ALY-instead-of-CAI airport code issue
    // -----------------------------------------------------------------
    if (parserDay.city && aiDay.city) {
      if (normalizeStr(parserDay.city) !== normalizeStr(aiDay.city)) {
        console.log(
          `🔧 Reconciliation Day ${dayNum}: Corrected city ` +
          `"${aiDay.city}" → "${parserDay.city}" (parser authoritative)`
        )
        aiDay.city = parserDay.city
      }
    }
  }

  // Summary
  const totalChanges = attractionsAdded + attractionsMoved + mealsForced +
    flightsForced + overnightCityCorrected + citiesAdded + cruiseDaysForced
  if (totalChanges > 0) {
    console.log(
      `✅ Reconciliation summary: ${totalChanges} correction(s) — ` +
      `${attractionsAdded} attractions added, ${attractionsMoved} moved to photo_stops, ` +
      `${mealsForced} meals forced, ${flightsForced} flights forced, ` +
      `${overnightCityCorrected} overnight cities corrected, ${citiesAdded} cities added, ` +
      `${cruiseDaysForced} cruise days forced`
    )
  } else {
    console.log('✅ Reconciliation: AI output matches parser data — no corrections needed')
  }

  return aiDays
}
