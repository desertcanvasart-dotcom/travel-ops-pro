// ============================================
// PARSING UTILITIES
// Extracted from generate-itinerary/route.ts
// ============================================

// ============================================
// TIER SYSTEM CONSTANTS
// ============================================

export type ServiceTier = 'budget' | 'standard' | 'deluxe' | 'luxury'
export type InputMode = 'creative' | 'structured'

export const VALID_TIERS: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']

export const TIER_MAP: Record<string, ServiceTier> = {
  'budget': 'budget',
  'economy': 'budget',
  'standard': 'standard',
  'mid-range': 'standard',
  'deluxe': 'deluxe',
  'superior': 'deluxe',
  'luxury': 'luxury',
  'premium': 'luxury',
  'vip': 'luxury'
}

export const TIER_DESCRIPTIONS: Record<ServiceTier, string> = {
  'budget': 'cost-effective, good value',
  'standard': 'comfortable mid-range',
  'deluxe': 'superior quality, premium',
  'luxury': 'top-tier, VIP treatment'
}

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ExtractedDay {
  day_number: number
  date: string | null
  date_display: string | null
  title: string
  city: string | null
  is_arrival: boolean
  is_departure: boolean
  is_transfer_only: boolean
  is_free_day: boolean
  activities: string[]
  attractions: string[]
  meals_included: {
    breakfast: boolean
    lunch: boolean
    dinner: boolean
  }
  guide_required: boolean
  transport_type: string | null
  flight_info: string | null
  hotel_name: string | null
  overnight_city: string
  notes: string | null
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function isValidDate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

export function toNumber(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return fallback
  }
  return Number(value)
}

export function normalizeTier(value: string | null | undefined): ServiceTier {
  if (!value) return 'standard'
  const normalized = value.toLowerCase().trim()
  return TIER_MAP[normalized] || 'standard'
}

// ============================================
// CALCULATE EXPECTED DAYS FROM RAW ITINERARY
// ============================================

export function calculateExpectedDays(rawItinerary: string, extractedDays: ExtractedDay[] | null): number {
  // Method 1: Count day markers (D1, D2, D3... or Day 1, Day 2...)
  const dayMarkerPattern = /\b[Dd](?:ay)?\s*(\d+)\b/g
  let maxDayNumber = 0
  let match
  while ((match = dayMarkerPattern.exec(rawItinerary)) !== null) {
    const dayNum = parseInt(match[1])
    if (dayNum > maxDayNumber) {
      maxDayNumber = dayNum
    }
  }

  // Method 2: Sum up NTS (nights) patterns like "2NTS CAI + 3NTS CRZ"
  const ntsPattern = /(\d+)\s*NTS/gi
  let totalNights = 0
  while ((match = ntsPattern.exec(rawItinerary)) !== null) {
    totalNights += parseInt(match[1])
  }
  const daysFromNights = totalNights > 0 ? totalNights + 1 : 0

  // Method 3: Use extracted days array length
  const extractedCount = extractedDays?.length || 0

  // Take the maximum of all methods
  const expectedDays = Math.max(maxDayNumber, daysFromNights, extractedCount)

  console.log(`📊 Day calculation:`, {
    maxDayFromMarkers: maxDayNumber,
    totalNights,
    daysFromNightsFormula: daysFromNights,
    extractedDaysCount: extractedCount,
    finalExpectedDays: expectedDays
  })

  return expectedDays || 1 // Default to 1 if nothing found
}

// ============================================
// PRE-PARSE RAW ITINERARY INTO DAY SEGMENTS
// ============================================

export function preParseRawItinerary(rawItinerary: string): { dayNumber: number; rawContent: string }[] {
  const segments: { dayNumber: number; rawContent: string }[] = []

  // Try Egyptian shorthand first: D1, D2, D3...
  const egyptPattern = /(?:^|\n)\s*D(\d+)\b/gi
  const egyptMatches = [...rawItinerary.matchAll(egyptPattern)]

  // Then try prose-style: "Day 1", "Day 2" (can appear anywhere, not just line start)
  const prosePattern = /\bDay\s*(\d+)\b/gi
  const proseMatches = [...rawItinerary.matchAll(prosePattern)]

  // Use whichever pattern found more matches (prefer Egyptian shorthand if both found)
  let matches: RegExpMatchArray[]
  let dayNumGroup: number

  if (egyptMatches.length >= 2) {
    matches = egyptMatches
    dayNumGroup = 1
  } else if (proseMatches.length >= 2) {
    matches = proseMatches
    dayNumGroup = 1
  } else if (egyptMatches.length > 0) {
    matches = egyptMatches
    dayNumGroup = 1
  } else if (proseMatches.length > 0) {
    matches = proseMatches
    dayNumGroup = 1
  } else {
    // No day markers found, return entire content as day 1
    return [{ dayNumber: 1, rawContent: rawItinerary.trim() }]
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const dayNum = parseInt(match[dayNumGroup])
    const startIdx = match.index!
    const endIdx = i < matches.length - 1 ? matches[i + 1].index! : rawItinerary.length

    const content = rawItinerary.substring(startIdx, endIdx).trim()
    segments.push({ dayNumber: dayNum, rawContent: content })
  }

  // Sort by day number
  segments.sort((a, b) => a.dayNumber - b.dayNumber)

  console.log(`📋 Pre-parsed ${segments.length} day segments from raw itinerary`)
  return segments
}

// ============================================
// DETERMINE INPUT MODE
// ============================================

/**
 * Determine whether to use 'structured' or 'creative' generation mode.
 *
 * Priority:
 *  1. Explicit override from caller (input_mode_override)
 *  2. Parser-flagged structured input with extracted days
 *  3. Auto-detection from raw_itinerary patterns (day markers, shorthand)
 *  4. Safety net: parser said structured + raw_itinerary exists → force structured
 *  5. Fallback: creative
 */
export function determineInputMode(params: {
  input_mode_override?: string | null
  is_structured_input?: boolean
  extracted_days?: ExtractedDay[] | null
  raw_itinerary?: string | null
}): InputMode {
  const { input_mode_override, is_structured_input, extracted_days, raw_itinerary } = params

  // 1. Explicit override
  if (input_mode_override === 'structured') return 'structured'
  if (input_mode_override === 'creative') return 'creative'

  // 2. Parser-flagged structured input with extracted days
  if (is_structured_input && extracted_days && extracted_days.length > 0) {
    return 'structured'
  }

  let mode: InputMode = 'creative'

  // 3. Auto-detect from raw_itinerary patterns
  if (raw_itinerary) {
    const structuredPatterns = [
      /\bD\d+\b/i,                    // D1, D2, D3...
      /\d+\s*NTS?\s*[A-Z]{2,4}/i,     // 2NTS CAI, 3NTS CRZ
      /\bDay\s*\d+\s*(?:[:\-\u2013\u2014]|\b)/i, // Day 1:, Day 2 -, Day 1 Arrival
      /PROGRAM\s*:/i,                  // PROGRAM: header
      /\b[A-Z]{3}\/[A-Z]{3}\b/        // CAI/ALX, LXR/HRG city transitions
    ]

    const dayMarkerCount = (raw_itinerary.match(/\bDay\s*\d+\b/gi) || []).length
    const dMarkerCount = (raw_itinerary.match(/\bD\d+\b/gi) || []).length

    if (structuredPatterns.some(pattern => pattern.test(raw_itinerary))) {
      mode = 'structured'
      console.log('\uD83D\uDD0D Auto-detected structured input from patterns in raw_itinerary')
    }

    // Extra safety: if there are 2+ day markers, force structured even if regex didn't match
    if (mode === 'creative' && (dayMarkerCount >= 2 || dMarkerCount >= 2)) {
      mode = 'structured'
      console.log(`\uD83D\uDD0D Forced structured mode: found ${dayMarkerCount} Day markers and ${dMarkerCount} D markers`)
    }
  }

  // 4. Safety net: parser flagged structured AND raw_itinerary exists → force structured
  if (is_structured_input && raw_itinerary && mode === 'creative') {
    mode = 'structured'
    console.log('\uD83D\uDEE1\uFE0F SAFETY: Parser detected structured input but mode was creative \u2014 forcing structured')
  }

  return mode
}
