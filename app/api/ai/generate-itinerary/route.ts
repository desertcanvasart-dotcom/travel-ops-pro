import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  fetchCruiseTransportPricingRules,
  findCruiseTransportRule,
  getCruiseTransportRate
} from '@/lib/auto-pricing-service'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Admin client for bypassing RLS on content library
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Default margin percentage (used if no user preference)
const DEFAULT_MARGIN_PERCENT = 25

// ============================================
// TIER SYSTEM CONSTANTS
// ============================================
type ServiceTier = 'budget' | 'standard' | 'deluxe' | 'luxury'
type InputMode = 'creative' | 'structured'

// UPDATED: New package types
type PackageType = 'day-trips' | 'tours-only' | 'land-package' | 'cruise-package' | 'cruise-land'

const VALID_TIERS: ServiceTier[] = ['budget', 'standard', 'deluxe', 'luxury']

// Map legacy budget_level values to new tier system
const TIER_MAP: Record<string, ServiceTier> = {
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

const TIER_DESCRIPTIONS: Record<ServiceTier, string> = {
  'budget': 'cost-effective, good value',
  'standard': 'comfortable mid-range',
  'deluxe': 'superior quality, premium',
  'luxury': 'top-tier, VIP treatment'
}

// ============================================
// LANGUAGE CODE MAPPING
// ============================================

type VersionLanguage = 'en' | 'ja'

function getVersionLanguageCode(language: string): VersionLanguage {
  const lower = (language || '').toLowerCase()
  if (lower.includes('japanese') || lower === 'ja' || lower === '日本語') return 'ja'
  // Default to English for all other languages
  return 'en'
}

/**
 * Auto-create itinerary_version and itinerary_day_versions after generation.
 * This ensures the language tab is populated immediately.
 */
async function createLanguageVersions(
  supabase: any,
  itineraryId: string,
  tripName: string,
  language: string,
  dayIds: { id: string; title: string; description: string; city: string; overnight_city: string }[]
) {
  const langCode = getVersionLanguageCode(language)

  try {
    // Create itinerary_version
    const { error: versionError } = await supabase
      .from('itinerary_versions')
      .insert({
        itinerary_id: itineraryId,
        language: langCode,
        trip_name: tripName
      })

    if (versionError) {
      // Unique constraint violation = version already exists, skip
      if (!versionError.message?.includes('duplicate') && !versionError.message?.includes('unique')) {
        console.error('Error creating itinerary version:', versionError)
      }
    } else {
      console.log(`✅ Auto-created ${langCode} itinerary version`)
    }

    // Create itinerary_day_versions for each day
    if (dayIds.length > 0) {
      const dayVersions = dayIds.map(day => ({
        itinerary_day_id: day.id,
        language: langCode,
        title: day.title,
        description: day.description,
        city: day.city,
        overnight_city: day.overnight_city
      }))

      const { error: dayVersionError } = await supabase
        .from('itinerary_day_versions')
        .insert(dayVersions)

      if (dayVersionError) {
        if (!dayVersionError.message?.includes('duplicate') && !dayVersionError.message?.includes('unique')) {
          console.error('Error creating day versions:', dayVersionError)
        }
      } else {
        console.log(`✅ Auto-created ${langCode} day versions for ${dayIds.length} days`)
      }
    }
  } catch (err) {
    // Non-critical - don't fail the whole generation
    console.error('Error in createLanguageVersions:', err)
  }
}

// ============================================
// COMPREHENSIVE EGYPT TRAVEL ABBREVIATIONS
// ============================================

const EGYPT_TRAVEL_GLOSSARY = `
=================================================================
EGYPTIAN TRAVEL INDUSTRY ABBREVIATIONS - COMPREHENSIVE GLOSSARY
=================================================================

CRITICAL: You MUST decode these abbreviations and follow the itinerary EXACTLY as written.
DO NOT add, remove, or reorder any activities. Convert ONLY what is written.

-----------------------------------------------------------------
AIRPORT & CITY CODES (IATA CODES)
-----------------------------------------------------------------
CAI = Cairo (Cairo International Airport)
ALX / ALY = Alexandria (Borg El Arab Airport)
ASW = Aswan (Aswan International Airport)
LXR = Luxor (Luxor International Airport)
HRG = Hurghada (Hurghada International Airport)
SSH = Sharm El Sheikh (Sharm El Sheikh International Airport)
RMF = Marsa Alam (Marsa Alam International Airport)
ABS = Abu Simbel (Abu Simbel Airport)
ATZ = Assiut (Assiut Airport)
MUH = Marsa Matrouh (Marsa Matrouh Airport)
PSD = Port Said (Port Said Airport)
TCP = Taba (Taba International Airport)
SKV = St. Catherine (St. Catherine International Airport)
HMB = Sohag (Sohag International Airport)
SPX = Sphinx/Giza (Sphinx International Airport)
DBB = Dabaa / El Alamein area
DAK = Dakhla Oasis (Dakhla Oasis Airport)
AAC = El Arish (El Arish International Airport)
EGH = El Gora (El Gora Airport)
UVL = El Kharga (El Kharga Airport)

COMMON CITY ABBREVIATIONS (non-IATA):
GZA = Giza
KOM = Kom Ombo
EDU / EDFU = Edfu
ESN = Esna
ABY = Abydos
DEN = Dendera
SAQ = Saqqara / Sakkara
MEM = Memphis
FAY = Fayoum
SIW = Siwa Oasis

-----------------------------------------------------------------
AIRLINE CODES (IATA)
-----------------------------------------------------------------
MS = EgyptAir (Egypt's national carrier)
BA = British Airways
TK = Turkish Airlines
QR = Qatar Airways
EK = Emirates
EY = Etihad Airways
LH = Lufthansa
AF = Air France
KL = KLM Royal Dutch
IB = Iberia
AZ = Alitalia / ITA Airways
SU = Aeroflot
FZ = FlyDubai
G9 = Air Arabia
XY = flynas
SV = Saudia (Saudi Arabian Airlines)
RJ = Royal Jordanian
ME = Middle East Airlines
GF = Gulf Air
WY = Oman Air
KU = Kuwait Airways
OS = Austrian Airlines
LX = Swiss International
SK = Scandinavian Airlines
AY = Finnair
LO = LOT Polish Airlines
NP = Nile Air (Egyptian low-cost)
SM = Air Cairo

-----------------------------------------------------------------
ACCOMMODATION CODES
-----------------------------------------------------------------
NTS = Nights (e.g., "3NTS" = 3 nights stay)
HTL = Hotel
CRZ = Cruise / Nile Cruise
OVN = Overnight
C/IN = Check-in
C/OUT = Check-out (disembarkation from cruise)

MEAL PLANS:
RO = Room Only (no meals)
BB = Bed & Breakfast (breakfast only)
HB = Half Board (breakfast + dinner)
FB = Full Board (breakfast + lunch + dinner)
AI = All Inclusive (all meals + drinks + snacks)
UAI = Ultra All Inclusive (premium AI with top-shelf drinks, room service)
SC = Self Catering

-----------------------------------------------------------------
DAY & TIME NOTATION
-----------------------------------------------------------------
D1, D2, D3... = Day 1, Day 2, Day 3...
"D1 CAI" = Day 1 in Cairo
"D3 CAI/ASW" = Day 3: Travel from Cairo to Aswan
"/" between cities = transfer/travel between those cities
@ = at (time), e.g., "arrive @05:10" = arrive at 05:10

-----------------------------------------------------------------
CRITICAL: ENTRANCE FEE LOGIC
-----------------------------------------------------------------
DEFAULT: Any site mentioned by name = Entrance fee INCLUDED automatically
(OUTSIDE) = NO entrance fee - photo stop only, viewing from outside

Examples:
- "Pyramids" = Entrance fee included (default)
- "Pompey's Pillar" = Entrance fee included (default)
- "Alexandria Library (OUTSIDE)" = Photo stop ONLY, NO entrance fee

-----------------------------------------------------------------
FREE DAYS AND SAILING DAYS
-----------------------------------------------------------------
When a day shows ONLY the location with NO activities:
- "D5 CRZ" = Sailing day on cruise (no tours, relaxing on board)
- "D8 HRG" = Free day in Hurghada (no scheduled activities)

Convert these to:
- Sailing days: title = "Sailing Day" or "Day at Leisure on Nile"
- Free days: title = "Free Day" or "Day at Leisure"

-----------------------------------------------------------------
MEALS IN ITINERARY
-----------------------------------------------------------------
B = Breakfast
L = Lunch
D = Dinner
"L" at end of day = Lunch included
"Chinese Dinner" = Dinner at Chinese restaurant
"Pigeon Lunch" = Lunch featuring Egyptian pigeon dish

-----------------------------------------------------------------
AIRPORT & HOTEL SERVICES (EGYPT TRAVEL INDUSTRY STANDARD)
-----------------------------------------------------------------

AIRPORT SERVICES (add when flights arrive/depart):
- International arrival: Airport meet & assist, visa assistance, luggage help, transfer to vehicle
- Domestic arrival: Airport meet & assist, luggage help, transfer to vehicle
- Departure: Hotel to airport transfer, check-in assistance

HOTEL SERVICES (add when):
- Check-in to hotel (first time in a city)
- Check-out from hotel (leaving city)
- Check-in to cruise (C/IN CRZ, "check in CRZ")
- Check-out from cruise (C/OUT CRZ)
- Moving from one city to another

-----------------------------------------------------------------
COMMON PATTERNS - EXAMPLES
-----------------------------------------------------------------
"2NTS CAI + 3NTS CRZ + 3NTS HRG"
= 2 nights Cairo + 3 nights Cruise + 3 nights Hurghada
= Total: 2+3+3 = 8 nights = 9 DAYS

"D1 CAI/ALX/CAI Arrive MS956@05:10, Pompey's Pillar, Library (OUTSIDE), L, back to CAI"
= Day 1: Arrive Cairo, then FULL DAY TRIP to Alexandria with sites, lunch, return to Cairo
= This is NOT just arrival - it's arrival + full day tour!

"D5 CRZ" (with nothing else)
= Day 5: Sailing day, no activities, relaxing on cruise

"D8 HRG" (with nothing else)
= Day 8: Free day in Hurghada, no scheduled activities

"C/OUT CRZ, LXR/HRG" = Check out of cruise, then travel from Luxor to Hurghada

-----------------------------------------------------------------
IMPORTANT CALCULATION RULE
-----------------------------------------------------------------
Number of DAYS = Number of NIGHTS + 1

Example: "2NTS CAI + 3NTS CRZ + 3NTS HRG"
- Nights: 2 + 3 + 3 = 8 nights
- Days: 8 + 1 = 9 days (D1 through D9)

-----------------------------------------------------------------
CRITICAL RULE: FOLLOW EXACTLY
-----------------------------------------------------------------
DO NOT add attractions not mentioned in the original!
DO NOT reorder days!
DO NOT skip any day!
If Abu Simbel is NOT mentioned, do NOT add it!
If a day just says "CRZ", it's a SAILING day with NO tours!
=================================================================
`

// ============================================
// EXTRACTED DAY STRUCTURE (from parser)
// ============================================
interface ExtractedDay {
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

// Helper to validate date
function isValidDate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

// Helper to safely convert to number
function toNumber(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return fallback
  }
  return Number(value)
}

// Helper to normalize tier value
function normalizeTier(value: string | null | undefined): ServiceTier {
  if (!value) return 'standard'
  const normalized = value.toLowerCase().trim()
  return TIER_MAP[normalized] || 'standard'
}

// ============================================
// CALCULATE EXPECTED DAYS FROM RAW ITINERARY
// ============================================

function calculateExpectedDays(rawItinerary: string, extractedDays: ExtractedDay[] | null): number {
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
// CRUISE DETECTION SYSTEM
// ============================================

interface CruiseDetectionResult {
  isCruise: boolean
  cruiseType: 'nile-cruise' | 'lake-nasser' | null
  route: string | null
  detectedDuration: number | null
  startCity: string | null
  endCity: string | null
  keywords: string[]
  includesLand: boolean
  cruiseNights: number
  landNights: number
}

function detectCruiseRequest(
  tourRequested: string,
  interests: string[],
  cities: string[],
  specialRequests: string[],
  durationDays: number,
  rawItinerary?: string,
  parserPackageType?: string
): CruiseDetectionResult {
  const allText = [
    tourRequested || '',
    rawItinerary || '',
    ...(interests || []),
    ...(cities || []),
    ...(specialRequests || [])
  ].join(' ').toLowerCase()

  // CRITICAL: If the parser already determined this is a land-package and
  // the raw itinerary contains hotel names but NO cruise-specific terms (CRZ, NTS CRZ),
  // trust the parser and skip cruise detection entirely.
  const hasCruiseAbbreviations = /\b(crz|nts\s*crz|c\/in\s*crz|c\/out\s*crz|nile\s*cruise)\b/i.test(allText)
  const hasHotelMentions = /\b(hotel|marriott|mena\s*house|hilton|sheraton|sofitel|movenpick|steigenberger|four\s*seasons|oberoi\s*hotel|hyatt|kempinski|resort|accommodation)\b/i.test(allText)

  if (parserPackageType === 'land-package' && !hasCruiseAbbreviations && hasHotelMentions) {
    console.log('🛡️ CRUISE GUARD: Parser says land-package, no CRZ/cruise abbreviations found, hotel names present — skipping cruise detection')
    return {
      isCruise: false,
      cruiseType: null,
      route: null,
      detectedDuration: null,
      startCity: null,
      endCity: null,
      keywords: [],
      includesLand: false,
      cruiseNights: 0,
      landNights: 0
    }
  }

  // Cruise keywords - TIGHTENED: removed generic words that cause false positives
  // "sailing" removed - appears in travel prose (e.g., "sailing through history")
  // "on board" removed - appears in prose (e.g., "on board with the plan")
  // "cruise" alone kept but we require it as a TRAVEL term, not part of other words
  const cruiseKeywords = [
    'nile cruise', 'river cruise', 'boat cruise',
    'felucca', 'dahabiya', 'cruise ship',
    'lake nasser', 'floating hotel',
    'crz', 'nts crz', 'check in crz', 'c/in crz'
  ]

  // For the generic word "cruise", only match if it's used as a travel/booking term,
  // not as part of a restaurant name or other context
  const hasCruiseAsBookingTerm = /\b(\d+\s*night[s]?\s*cruise|cruise\s*(from|to|between|package|itinerary|ship)|book\s*(a|the)\s*cruise|nile\s*cruise)\b/i.test(allText)

  const matchedKeywords = cruiseKeywords.filter(keyword => allText.includes(keyword))
  if (hasCruiseAsBookingTerm) {
    matchedKeywords.push('cruise (booking term)')
  }
  const isCruise = matchedKeywords.length > 0

  // Calculate cruise nights from "XNTs CRZ" pattern
  let cruiseNights = 0
  const cruiseNtsMatch = allText.match(/(\d+)\s*nts?\s*crz/i)
  if (cruiseNtsMatch) {
    cruiseNights = parseInt(cruiseNtsMatch[1])
  }

  // Calculate land nights
  let landNights = 0
  const landPatterns = [
    /(\d+)\s*nts?\s*cai/gi,  // Cairo nights
    /(\d+)\s*nts?\s*hrg/gi,  // Hurghada nights
    /(\d+)\s*nts?\s*ssh/gi,  // Sharm nights
    /(\d+)\s*nts?\s*alx/gi,  // Alexandria nights
    /(\d+)\s*nts?\s*htl/gi   // Generic hotel nights
  ]
  
  for (const pattern of landPatterns) {
    let match
    while ((match = pattern.exec(allText)) !== null) {
      landNights += parseInt(match[1])
    }
  }

  if (!isCruise) {
    return {
      isCruise: false,
      cruiseType: null,
      route: null,
      detectedDuration: null,
      startCity: null,
      endCity: null,
      keywords: [],
      includesLand: false,
      cruiseNights: 0,
      landNights: 0
    }
  }

  // Detect cruise type
  let cruiseType: 'nile-cruise' | 'lake-nasser' = 'nile-cruise'
  if (allText.includes('lake nasser') || allText.includes('abu simbel cruise')) {
    cruiseType = 'lake-nasser'
  }

  // Detect route direction
  let route: string | null = null
  let startCity: string | null = null
  let endCity: string | null = null

  // Check various route patterns
  const routePatterns = [
    { pattern: /luxor\s*(?:to|-|\/)\s*aswan|lxr\s*(?:to|-|\/)\s*asw/i, route: 'luxor-aswan', start: 'Luxor', end: 'Aswan' },
    { pattern: /aswan\s*(?:to|-|\/)\s*luxor|asw\s*(?:to|-|\/)\s*lxr/i, route: 'aswan-luxor', start: 'Aswan', end: 'Luxor' },
    { pattern: /round\s*trip/i, route: 'round-trip', start: 'Luxor', end: 'Luxor' }
  ]

  for (const { pattern, route: r, start, end } of routePatterns) {
    if (pattern.test(allText)) {
      route = r
      startCity = start
      endCity = end
      break
    }
  }

  // If no explicit route, infer from cities or default
  if (!route) {
    const citiesLower = (cities || []).map(c => c.toLowerCase())
    if (citiesLower.some(c => c.includes('luxor') || c.includes('lxr'))) {
      route = 'luxor-aswan'
      startCity = 'Luxor'
      endCity = 'Aswan'
    } else if (citiesLower.some(c => c.includes('aswan') || c.includes('asw'))) {
      route = 'aswan-luxor'
      startCity = 'Aswan'
      endCity = 'Luxor'
    } else if (cruiseType === 'lake-nasser') {
      route = 'aswan-abu-simbel'
      startCity = 'Aswan'
      endCity = 'Abu Simbel'
    } else {
      // Default to aswan-luxor (most common)
      route = 'aswan-luxor'
      startCity = 'Aswan'
      endCity = 'Luxor'
    }
  }

  // Detect duration from text
  let detectedDuration: number | null = null
  const durationPatterns = [
    { pattern: /(\d+)\s*night/i, addOne: true },
    { pattern: /(\d+)\s*day/i, addOne: false },
    { pattern: /(\d+)-night/i, addOne: true },
    { pattern: /(\d+)-day/i, addOne: false },
    { pattern: /(\d+)\s*nts?\s*crz/i, addOne: true }
  ]

  for (const { pattern, addOne } of durationPatterns) {
    const match = allText.match(pattern)
    if (match) {
      const num = parseInt(match[1])
      detectedDuration = addOne ? num + 1 : num
      break
    }
  }

  // Detect if trip includes land (hotels)
  const landCities = ['cairo', 'alexandria', 'hurghada', 'sharm', 'giza', 'dahab', 'marsa alam', 
                      'cai', 'alx', 'hrg', 'ssh', 'gza', 'rmf']
  
  const citiesLower = (cities || []).map(c => c.toLowerCase())
  const hasLandCities = citiesLower.some(city => 
    landCities.some(lc => city.includes(lc))
  ) || landCities.some(lc => allText.includes(lc + ' hotel') || allText.includes('nts ' + lc))
  
  // Only use cruiseNights comparison when we actually detected cruise nights from NTS pattern
  const includesLand = hasLandCities || landNights > 0 || (cruiseNights > 0 && durationDays > (cruiseNights + 1))

  console.log(`🚢 CRUISE DETECTION:`, {
    isCruise: true,
    type: cruiseType,
    route,
    startCity,
    endCity,
    cruiseNights,
    landNights,
    includesLand,
    detectedDuration,
    keywords: matchedKeywords
  })

  return {
    isCruise: true,
    cruiseType,
    route,
    detectedDuration,
    startCity,
    endCity,
    keywords: matchedKeywords,
    includesLand,
    cruiseNights,
    landNights
  }
}

// ============================================
// CONTENT LIBRARY CRUISE LOOKUP
// ============================================

interface CruiseContentMatch {
  found: boolean
  content: any
  variation: any
  dayByDay: any[]
  recommendedSuppliers: string[]
}

async function findCruiseContent(
  cruiseDetection: CruiseDetectionResult,
  tier: ServiceTier,
  requestedDuration: number | null
): Promise<CruiseContentMatch> {
  const noMatch: CruiseContentMatch = {
    found: false,
    content: null,
    variation: null,
    dayByDay: [],
    recommendedSuppliers: []
  }

  if (!cruiseDetection.isCruise) {
    return noMatch
  }

  try {
    // Build query based on detected cruise parameters
    let query = supabaseAdmin
      .from('content_library')
      .select(`
        *,
        content_variations!inner (
          id,
          tier,
          title,
          description,
          highlights,
          inclusions,
          day_by_day,
          recommended_suppliers,
          is_active
        )
      `)
      .eq('is_cruise', true)
      .eq('is_active', true)
      .eq('content_variations.is_active', true)
      .eq('content_variations.tier', tier)

    // Filter by route if detected
    if (cruiseDetection.route) {
      query = query.eq('route', cruiseDetection.route)
    }

    // Filter by cruise type
    if (cruiseDetection.cruiseType) {
      query = query.eq('tour_type', cruiseDetection.cruiseType)
    }

    const { data: cruises, error } = await query

    if (error || !cruises || cruises.length === 0) {
      console.log('⚠️ No cruise content found in Content Library for route:', cruiseDetection.route)
      
      // Try without route filter as fallback
      const { data: fallbackCruises } = await supabaseAdmin
        .from('content_library')
        .select(`
          *,
          content_variations!inner (
            id,
            tier,
            title,
            description,
            highlights,
            inclusions,
            day_by_day,
            recommended_suppliers,
            is_active
          )
        `)
        .eq('is_cruise', true)
        .eq('is_active', true)
        .eq('content_variations.is_active', true)
        .eq('content_variations.tier', tier)
        .limit(1)

      if (!fallbackCruises || fallbackCruises.length === 0) {
        console.log('⚠️ No cruise content found at all in Content Library')
        return noMatch
      }

      const content = fallbackCruises[0]
      const variation = content.content_variations[0]

      console.log(`📚 Found fallback cruise: ${content.name} (${variation.tier} tier)`)

      return {
        found: true,
        content,
        variation,
        dayByDay: variation.day_by_day || [],
        recommendedSuppliers: variation.recommended_suppliers || []
      }
    }

    // Find best match based on duration if specified
    let bestMatch = cruises[0]
    if (requestedDuration) {
      const durationMatch = cruises.find(c => c.duration_days === requestedDuration)
      if (durationMatch) {
        bestMatch = durationMatch
      }
    }

    const variation = bestMatch.content_variations[0]

    console.log(`📚 Found cruise content: ${bestMatch.name} (${variation.tier} tier, ${bestMatch.duration_days} days)`)

    return {
      found: true,
      content: bestMatch,
      variation,
      dayByDay: variation.day_by_day || [],
      recommendedSuppliers: variation.recommended_suppliers || []
    }

  } catch (err) {
    console.error('⚠️ Error querying cruise content:', err)
    return noMatch
  }
}

// ============================================
// CRUISE RATE LOOKUP (with cabin allocation)
// ============================================

interface CabinAllocation {
  type: 'single' | 'double' | 'triple' | 'suite'
  count: number
  pax: number  // total people in this cabin type
  ratePerPersonPerNight: number
  costPerNight: number  // rate × pax
}

interface CruiseRate {
  found: boolean
  shipName: string
  supplierId: string | null
  season: string
  cabinAllocation: CabinAllocation[]
  totalPerNight: number       // supplier cost for all cabins per night
  totalSupplierCost: number   // totalPerNight × nights
  nights: number
}

/**
 * Detect which season a date falls in for a given cruise ship record
 */
function detectCruiseSeason(ship: any, startDate: string): string {
  const date = new Date(startDate)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const mmdd = month * 100 + day  // e.g., March 20 = 320

  const toMmdd = (dateStr: string | null): number => {
    if (!dateStr) return 0
    const d = new Date(dateStr)
    return (d.getMonth() + 1) * 100 + d.getDate()
  }

  // Check peak season first (2 possible periods)
  if (ship.peak_season_1_start && ship.peak_season_1_end) {
    const start = toMmdd(ship.peak_season_1_start)
    const end = toMmdd(ship.peak_season_1_end)
    if (start <= end ? (mmdd >= start && mmdd <= end) : (mmdd >= start || mmdd <= end)) return 'peak'
  }
  if (ship.peak_season_2_start && ship.peak_season_2_end) {
    const start = toMmdd(ship.peak_season_2_start)
    const end = toMmdd(ship.peak_season_2_end)
    if (start <= end ? (mmdd >= start && mmdd <= end) : (mmdd >= start || mmdd <= end)) return 'peak'
  }

  // Check high season
  if (ship.high_season_start && ship.high_season_end) {
    const start = toMmdd(ship.high_season_start)
    const end = toMmdd(ship.high_season_end)
    if (start <= end ? (mmdd >= start && mmdd <= end) : (mmdd >= start || mmdd <= end)) return 'high'
  }

  // Default to low season
  return 'low'
}

/**
 * Get per-person-per-night rates for a given season and passport type
 */
function getCruiseSeasonRates(ship: any, season: string, isEuro: boolean): {
  single: number; double: number; triple: number; suite: number
} {
  const suffix = isEuro ? 'eur' : 'non_eur'
  return {
    single: toNumber(ship[`rate_${season}_single_${suffix}`], 0),
    double: toNumber(ship[`rate_${season}_double_${suffix}`], 0),
    triple: toNumber(ship[`rate_${season}_triple_${suffix}`], 0),
    suite:  toNumber(ship[`rate_${season}_suite_${suffix}`], 0),
  }
}

/**
 * Calculate all valid cabin allocations for a given number of passengers
 * Returns them sorted by total cost (cheapest first)
 */
function calculateCabinAllocations(
  totalPax: number,
  rates: { single: number; double: number; triple: number; suite: number }
): CabinAllocation[][] {
  const allocations: CabinAllocation[][] = []

  // Generate combinations of double, triple, single that sum to totalPax
  // Max cabins of each type
  const maxTriples = Math.floor(totalPax / 3)
  const maxDoubles = Math.floor(totalPax / 2)

  for (let triples = 0; triples <= maxTriples; triples++) {
    const remaining = totalPax - (triples * 3)
    for (let doubles = 0; doubles <= Math.floor(remaining / 2); doubles++) {
      const singles = remaining - (doubles * 2)

      const allocation: CabinAllocation[] = []
      let totalPerNight = 0

      if (doubles > 0 && rates.double > 0) {
        const cost = rates.double * 2 * doubles
        allocation.push({ type: 'double', count: doubles, pax: doubles * 2, ratePerPersonPerNight: rates.double, costPerNight: cost })
        totalPerNight += cost
      }
      if (triples > 0 && rates.triple > 0) {
        const cost = rates.triple * 3 * triples
        allocation.push({ type: 'triple', count: triples, pax: triples * 3, ratePerPersonPerNight: rates.triple, costPerNight: cost })
        totalPerNight += cost
      }
      if (singles > 0 && rates.single > 0) {
        const cost = rates.single * 1 * singles
        allocation.push({ type: 'single', count: singles, pax: singles, ratePerPersonPerNight: rates.single, costPerNight: cost })
        totalPerNight += cost
      }

      // Only include if all passengers are accounted for
      const allocatedPax = allocation.reduce((sum, a) => sum + a.pax, 0)
      if (allocatedPax === totalPax && allocation.length > 0) {
        allocations.push(allocation)
      }
    }
  }

  // Sort by total cost per night (cheapest first)
  allocations.sort((a, b) => {
    const costA = a.reduce((sum, cabin) => sum + cabin.costPerNight, 0)
    const costB = b.reduce((sum, cabin) => sum + cabin.costPerNight, 0)
    return costA - costB
  })

  return allocations
}

/**
 * Main cruise rate function: finds ship, detects season, calculates optimal cabin allocation
 */
async function getCruiseRate(
  params: {
    tier: ServiceTier
    recommendedSuppliers: string[]
    supabase: any
    totalPax: number
    nights: number
    startDate: string
    isEuroPassport: boolean
  }
): Promise<CruiseRate> {
  const { tier, recommendedSuppliers, supabase, totalPax, nights, startDate, isEuroPassport } = params

  const noRate: CruiseRate = {
    found: false,
    shipName: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Nile Cruise`,
    supplierId: null,
    season: 'high',
    cabinAllocation: [],
    totalPerNight: 0,
    totalSupplierCost: 0,
    nights
  }

  try {
    let ship: any = null

    // Try recommended suppliers first
    if (recommendedSuppliers && recommendedSuppliers.length > 0) {
      const { data } = await supabase
        .from('nile_cruises')
        .select('*')
        .eq('is_active', true)
        .in('ship_name', recommendedSuppliers)
        .limit(1)
      if (data?.length) ship = data[0]
    }

    // Fallback: tier match
    if (!ship) {
      const { data } = await supabase
        .from('nile_cruises')
        .select('*')
        .eq('is_active', true)
        .eq('tier', tier)
        .order('is_preferred', { ascending: false })
        .limit(1)
      if (data?.length) ship = data[0]
    }

    // Final fallback: any active cruise
    if (!ship) {
      const { data } = await supabase
        .from('nile_cruises')
        .select('*')
        .eq('is_active', true)
        .order('is_preferred', { ascending: false })
        .limit(1)
      if (data?.length) ship = data[0]
    }

    if (!ship) return noRate

    // Detect season
    const season = detectCruiseSeason(ship, startDate)
    const rates = getCruiseSeasonRates(ship, season, isEuroPassport)

    console.log(`🚢 Cruise: ${ship.ship_name} | Season: ${season} | Passport: ${isEuroPassport ? 'EUR' : 'non-EUR'}`)
    console.log(`💰 Rates (pppn): single=${rates.single}, double=${rates.double}, triple=${rates.triple}, suite=${rates.suite}`)

    // Calculate optimal cabin allocation (cheapest first)
    const allocations = calculateCabinAllocations(totalPax, rates)

    if (allocations.length === 0) return noRate

    // Use cheapest allocation
    const bestAllocation = allocations[0]
    const totalPerNight = bestAllocation.reduce((sum, a) => sum + a.costPerNight, 0)

    console.log(`🛏️ Cabin allocation (${totalPax} pax): ${bestAllocation.map(a => `${a.count}×${a.type}`).join(' + ')} = ${totalPerNight}/night`)

    return {
      found: true,
      shipName: ship.ship_name,
      supplierId: ship.supplier_id || ship.id,
      season,
      cabinAllocation: bestAllocation,
      totalPerNight,
      totalSupplierCost: totalPerNight * nights,
      nights
    }

  } catch (err) {
    console.error('⚠️ Error fetching cruise rate:', err)
    return noRate
  }
}

// ============================================
// CONTENT LIBRARY INTEGRATION (for non-cruise)
// ============================================

interface ContentItem {
  id: string
  name: string
  category_name: string
  category_slug: string
  tier: string
  title: string
  description: string
  highlights: string[]
  inclusions: string[]
}

interface WritingRule {
  rule_type: string
  rule_text: string
  category: string
  priority: number
}

async function fetchContentLibrary(
  tier: string,
  cities: string[],
  interests: string[]
): Promise<ContentItem[]> {
  try {
    const searchTags = [
      ...cities.map(c => c.toLowerCase()),
      ...interests.map(i => i.toLowerCase())
    ]

    const { data: variations, error } = await supabaseAdmin
      .from('content_variations')
      .select(`
        id,
        content_id,
        tier,
        title,
        description,
        highlights,
        inclusions,
        content_library!inner (
          id,
          name,
          slug,
          short_description,
          location,
          tags,
          is_cruise,
          content_categories!inner (
            name,
            slug
          )
        )
      `)
      .eq('tier', tier)
      .eq('is_active', true)

    if (error || !variations) {
      console.log('⚠️ No content library items found:', error?.message)
      return []
    }

    // Filter and transform content - exclude cruises for land tours
    const content: ContentItem[] = variations
      .filter((v: any) => {
        const item = v.content_library
        if (!item) return false
        if (item.is_cruise) return false // Exclude cruise content
        
        const itemTags = (item.tags || []).map((t: string) => t.toLowerCase())
        const itemLocation = (item.location || '').toLowerCase()
        const itemName = (item.name || '').toLowerCase()
        
        const matchesSearch = searchTags.length === 0 || searchTags.some(tag => 
          itemTags.includes(tag) ||
          itemLocation.includes(tag) ||
          itemName.includes(tag) ||
          tag.includes(itemLocation)
        )
        
        return matchesSearch
      })
      .map((v: any) => ({
        id: v.content_id,
        name: v.content_library.name,
        category_name: v.content_library.content_categories?.name || 'General',
        category_slug: v.content_library.content_categories?.slug || 'general',
        tier: v.tier,
        title: v.title || v.content_library.name,
        description: v.description || v.content_library.short_description || '',
        highlights: v.highlights || [],
        inclusions: v.inclusions || []
      }))

    console.log(`📚 Found ${content.length} content items for tier ${tier}`)
    return content
  } catch (err) {
    console.error('⚠️ Error fetching content library:', err)
    return []
  }
}

async function fetchWritingRules(): Promise<WritingRule[]> {
  try {
    const { data: rules, error } = await supabaseAdmin
      .from('writing_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })

    if (error || !rules) {
      return []
    }

    return rules
  } catch (err) {
    console.error('⚠️ Error fetching writing rules:', err)
    return []
  }
}

function buildContentContext(content: ContentItem[]): string {
  if (content.length === 0) return ''

  const grouped: Record<string, ContentItem[]> = {}
  content.forEach(item => {
    if (!grouped[item.category_slug]) {
      grouped[item.category_slug] = []
    }
    grouped[item.category_slug].push(item)
  })

  let context = '\n\nCONTENT LIBRARY:\n'

  for (const [category, items] of Object.entries(grouped)) {
    context += `\n[${items[0]?.category_name || category}]\n`
    items.slice(0, 5).forEach(item => {
      context += `• ${item.name}: ${item.description?.substring(0, 200) || ''}...\n`
    })
  }

  return context
}

function buildWritingRulesContext(rules: WritingRule[]): string {
  if (rules.length === 0) return ''

  let context = '\n\nWRITING STYLE:\n'

  const enforceRules = rules.filter(r => r.rule_type === 'enforce').slice(0, 5)
  const avoidRules = rules.filter(r => r.rule_type === 'avoid').slice(0, 5)

  if (enforceRules.length > 0) {
    context += 'MUST follow:\n'
    enforceRules.forEach(r => context += `- ${r.rule_text}\n`)
  }

  if (avoidRules.length > 0) {
    context += 'AVOID:\n'
    avoidRules.forEach(r => context += `- ${r.rule_text}\n`)
  }

  return context
}

// ============================================
// FETCH USER PREFERENCES
// ============================================
async function getUserPreferences(supabase: any): Promise<{
  default_cost_mode: 'auto' | 'manual'
  default_tier: ServiceTier
  default_margin_percent: number
  default_currency: string
}> {
  const defaults = {
    default_cost_mode: 'auto' as const,
    default_tier: 'standard' as ServiceTier,
    default_margin_percent: DEFAULT_MARGIN_PERCENT,
    default_currency: 'EUR'
  }

  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) return defaults

    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!prefs) return defaults

    return {
      default_cost_mode: prefs.default_cost_mode || defaults.default_cost_mode,
      default_tier: normalizeTier(prefs.default_tier) || defaults.default_tier,
      default_margin_percent: prefs.default_margin_percent ?? defaults.default_margin_percent,
      default_currency: prefs.default_currency || defaults.default_currency
    }
  } catch (error) {
    return defaults
  }
}

// ============================================
// FETCH ATTRACTION NAMES LIST
// ============================================
async function fetchAttractionsList(supabase: any): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('entrance_fees')
      .select('attraction_name')
      .eq('is_active', true)
      .eq('is_addon', false) // Exclude add-ons

    if (!data) return []

    // CRITICAL: Filter out non-Latin names (e.g., Japanese, Arabic) to prevent
    // the AI from outputting attraction names in wrong languages.
    // Only pass English/Latin-script names to the AI prompt.
    return data
      .map((a: any) => a.attraction_name)
      .filter((name: string) => {
        // Keep names that are primarily Latin characters (English, French, etc.)
        // Reject names that are primarily non-Latin (Japanese, Arabic, etc.)
        const latinChars = (name.match(/[a-zA-Z]/g) || []).length
        return latinChars > name.length * 0.3 // At least 30% Latin characters
      })
  } catch {
    return []
  }
}

// ============================================
// STRUCTURED MODE: FOLLOW PROVIDED ITINERARY
// ============================================

// ============================================
// PRE-PARSE RAW ITINERARY INTO DAY SEGMENTS
// ============================================
function preParseRawItinerary(rawItinerary: string): { dayNumber: number; rawContent: string }[] {
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

async function generateFromStructuredInput(
  extractedDays: ExtractedDay[],
  rawItinerary: string,
  params: {
    tier: ServiceTier
    totalPax: number
    language: string
    attractionNames: string[]
    writingRules: WritingRule[]
    packageType?: PackageType
  }
): Promise<any> {
  const { tier, totalPax, language, attractionNames, writingRules, packageType } = params
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

DEPARTURE/FAREWELL DAYS:
If input mentions "farewell", "departure", "airport transfer", "final breakfast":
- is_departure: true, is_transfer_only: true
- overnight_city should be the departure city (usually Cairo)
- Guide is NOT needed for transfer-only days

ENTRANCE FEE LOGIC:
DEFAULT: Any attraction mentioned = entrance fee included → add to attractions[]
(OUTSIDE) = Photo stop only → add to photo_stops[] (NO entrance fee)
Do NOT use an "entrance_included" array. The "attractions" array IS the entrance fee list.
Only sites explicitly marked (OUTSIDE) go into photo_stops[] and are excluded from fees.

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
□ DEPARTURE DAY: If input mentions "farewell", "departure", or "airport transfer", set is_departure: true, is_transfer_only: true
□ ALL attraction names are in ENGLISH (no Japanese, Arabic, or other non-Latin names)
□ Free/sailing days have is_free_day: true
□ ALL attractions are in the attractions[] array (entrance fees apply by default)
□ ONLY sites explicitly marked (OUTSIDE) are in photo_stops[] (NO fee)
□ There is NO "entrance_included" array in the output
□ Flight arrivals have needs_airport_service: true
□ The last day with activities includes everything mentioned (not just "departure")

NOW CONVERT THE ITINERARY TO JSON:`

  console.log('🤖 Sending STRICT structured prompt to AI...')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
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

    // Check if AI hallucinated cities not in input (e.g., Aswan/Luxor when input says Cairo)
    const inputMentionsCairo = /\b(cairo|cai|giza|gza|pyramid|museum|mena\s*house)\b/i.test(rawItinerary)
    const inputMentionsUpperEgypt = /\b(aswan|asw|luxor|lxr|kom\s*ombo|edfu|abu\s*simbel|philae|valley\s*of\s*(the\s*)?kings)\b/i.test(rawItinerary)
    const outputMentionsUpperEgypt = outputCities.some((c: string) =>
      /\b(aswan|luxor|kom\s*ombo|edfu)\b/i.test(c)
    )

    if (inputMentionsCairo && !inputMentionsUpperEgypt && outputMentionsUpperEgypt) {
      console.error('🚨 HALLUCINATION DETECTED: AI added Upper Egypt cities (Aswan/Luxor) but input only mentions Cairo area!')
      console.error('🚨 This is a critical hallucination — the AI ignored the input entirely.')
      // Force regeneration with a stricter prompt would be ideal, but for now log heavily
    }
  }

  return result
}

// ============================================
// CREATIVE MODE: AI GENERATES ITINERARY
// ============================================

async function generateCreativeItinerary(
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
    contentContext: string
    writingContext: string
    includeLunch: boolean
    includeDinner: boolean
    includeAccommodation: boolean
  }
): Promise<any> {
  const {
    clientName, tourName, durationDays, tier, totalPax, numAdults, numChildren,
    language, cities, interests, specialRequests, startDate, effectiveCity,
    attractionNames, contentContext, writingContext, includeLunch, includeDinner, includeAccommodation
  } = params

  const prompt = `Create a ${durationDays}-day Egypt itinerary.

${EGYPT_TRAVEL_GLOSSARY}

CLIENT: ${clientName}
TOUR: ${tourName}
DATE: ${startDate}
TRAVELERS: ${numAdults} adults${numChildren > 0 ? `, ${numChildren} children` : ''}
TIER: ${tier.toUpperCase()} (${TIER_DESCRIPTIONS[tier]})
CITIES: ${cities.length > 0 ? cities.join(', ') : effectiveCity}
${interests.length > 0 ? `INTERESTS: ${interests.join(', ')}` : ''}
${specialRequests.length > 0 ? `SPECIAL REQUESTS: ${specialRequests.join(', ')}` : ''}

AVAILABLE ATTRACTIONS (use EXACT names):
${attractionNames.join(', ')}
${contentContext}
${writingContext}

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

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
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

// ============================================
// DETERMINE EFFECTIVE PACKAGE TYPE
// ============================================

function determinePackageType(
  requestedPackageType: string,
  cruiseDetection: CruiseDetectionResult
): PackageType {
  // CRITICAL: If the parser explicitly set a non-cruise package type (land-package, tours-only, day-trips),
  // and cruise detection did NOT find strong cruise indicators, TRUST THE PARSER.
  // This prevents false cruise overrides from generic keyword matches.
  const parserSaysLand = ['land-package', 'tours-only', 'day-trips', 'full-package'].includes(requestedPackageType)
  const parserSaysCruise = ['cruise-package', 'cruise-land'].includes(requestedPackageType)

  // If parser explicitly says cruise, trust it
  if (parserSaysCruise) {
    if (requestedPackageType === 'cruise-land') return 'cruise-land'
    return 'cruise-package'
  }

  // If no cruise detected by the generator either, use the requested package type
  if (!cruiseDetection.isCruise) {
    if (requestedPackageType === 'full-package') {
      return 'land-package'
    }
    return (requestedPackageType as PackageType) || 'land-package'
  }

  // Cruise was detected by the generator BUT parser says land —
  // Only override if the cruise detection has strong evidence (cruise abbreviations, not just city names)
  if (parserSaysLand && cruiseDetection.keywords.length <= 1) {
    console.log(`🛡️ PACKAGE GUARD: Parser says ${requestedPackageType}, cruise detection weak (${cruiseDetection.keywords.join(', ')}) — keeping parser's decision`)
    if (requestedPackageType === 'full-package') return 'land-package'
    return (requestedPackageType as PackageType) || 'land-package'
  }

  // Strong cruise detection overrides parser — determine if cruise-only or cruise+land
  if (cruiseDetection.includesLand) {
    return 'cruise-land'
  }

  return 'cruise-package'
}

// ============================================
// MAIN API HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = createClient()
    const userPrefs = await getUserPreferences(supabase)
    
    const {
      client_name,
      client_email,
      client_phone,
      tour_requested,
      tour_name,
      start_date,
      duration_days: raw_duration_days,
      num_adults = 2,
      num_children = 0,
      language = 'English',
      conversation_language,
      interests = [],
      cities = [],
      special_requests = [],
      budget_level = 'standard',
      tier: raw_tier = null,
      hotel_name,
      city = 'Cairo',
      client_id = null,
      nationality = null,
      is_euro_passport = null,
      include_lunch = true,
      include_dinner = false,
      include_accommodation = true,
      margin_percent = userPrefs.default_margin_percent,
      currency = userPrefs.default_currency,
      cost_mode = userPrefs.default_cost_mode,
      package_type: requested_package_type = 'land-package',
      skip_pricing = false,
      
      // NEW: Structured input parameters from parser
      is_structured_input = false,
      extracted_days = null,
      raw_itinerary = null,
      input_mode_override = null, // 'creative' | 'structured' | null

      // B2B Partner fields
      partner_id = null,
      partner_commission_percent = 0,
      source = 'b2c_whatsapp'
    } = body

    const finalTourName = tour_requested || tour_name || 'Egypt Tour'
    // CRITICAL: "language" is the GUIDE language preference (e.g., "Spanish speaking guide").
    // It should NOT determine the itinerary content language.
    // The itinerary content language should ONLY be non-English if explicitly requested
    // (e.g., "write the itinerary in Spanish") — NOT inferred from nationality.
    // For now, guide language defaults to English unless explicitly requested.
    const finalLanguage = language !== 'English' ? language : 'English'
    const tier: ServiceTier = raw_tier ? normalizeTier(raw_tier) : budget_level !== 'standard' ? normalizeTier(budget_level) : userPrefs.default_tier

    if (!isValidDate(start_date)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid start date' },
        { status: 400 }
      )
    }

    // ============================================
    // DETERMINE INPUT MODE
    // ============================================
    let inputMode: InputMode = 'creative'

    if (input_mode_override === 'structured') {
      inputMode = 'structured'
    } else if (input_mode_override === 'creative') {
      inputMode = 'creative'
    } else if (is_structured_input && extracted_days && extracted_days.length > 0) {
      inputMode = 'structured'
    } else if (raw_itinerary) {
      // Auto-detect structured input from raw itinerary patterns
      // EXPANDED: Now also catches prose-style "Day 1 Arrival..." without colon/dash
      const structuredPatterns = [
        /\bD\d+\b/i,                    // D1, D2, D3...
        /\d+\s*NTS?\s*[A-Z]{2,4}/i,     // 2NTS CAI, 3NTS CRZ
        /\bDay\s*\d+\s*(?:[:\-–—]|\b)/i, // Day 1:, Day 2 -, Day 1 Arrival (any separator or word boundary)
        /PROGRAM\s*:/i,                  // PROGRAM: header
        /\b[A-Z]{3}\/[A-Z]{3}\b/        // CAI/ALX, LXR/HRG city transitions
      ]

      // Count how many "Day N" markers exist — if >=2, it's definitely structured
      const dayMarkerCount = (raw_itinerary.match(/\bDay\s*\d+\b/gi) || []).length
      const dMarkerCount = (raw_itinerary.match(/\bD\d+\b/gi) || []).length

      if (structuredPatterns.some(pattern => pattern.test(raw_itinerary))) {
        inputMode = 'structured'
        console.log('🔍 Auto-detected structured input from patterns in raw_itinerary')
      }

      // Extra safety: if there are 2+ day markers, force structured even if regex didn't match
      if (inputMode === 'creative' && (dayMarkerCount >= 2 || dMarkerCount >= 2)) {
        inputMode = 'structured'
        console.log(`🔍 Forced structured mode: found ${dayMarkerCount} Day markers and ${dMarkerCount} D markers`)
      }
    }

    // CRITICAL SAFETY: If parser flagged structured AND raw_itinerary exists, ALWAYS use structured
    // This prevents falling through to creative mode which ignores the provided itinerary
    if (is_structured_input && raw_itinerary && inputMode === 'creative') {
      inputMode = 'structured'
      console.log('🛡️ SAFETY: Parser detected structured input but mode was creative — forcing structured')
    }

    console.log('🤖 Input Mode:', inputMode, '| Override:', input_mode_override, '| is_structured_input:', is_structured_input)

    let duration_days = parseInt(raw_duration_days) || 1
    
    // For structured mode, calculate days from raw itinerary
    if (inputMode === 'structured' && raw_itinerary) {
      const calculatedDays = calculateExpectedDays(raw_itinerary, extracted_days)
      if (calculatedDays > duration_days) {
        duration_days = calculatedDays
        console.log(`📊 Adjusted duration to ${duration_days} days based on itinerary analysis`)
      }
    } else if (inputMode === 'structured' && extracted_days?.length) {
      duration_days = extracted_days.length
    }

    // ============================================
    // CRUISE DETECTION (for both modes now)
    // ============================================
    const cruiseDetection = detectCruiseRequest(
      finalTourName,
      interests,
      cities,
      special_requests,
      duration_days,
      raw_itinerary || '', // Pass raw itinerary for better detection
      requested_package_type // Pass parser's package type to prevent false overrides
    )

    // Adjust duration for cruise if needed:
    // - Apply when duration is 1 (undetected) OR when cruise detection found a more accurate duration
    if (cruiseDetection.isCruise) {
      const defaultCruiseDuration = cruiseDetection.cruiseType === 'lake-nasser' ? 4 : 5
      const bestDuration = cruiseDetection.detectedDuration || defaultCruiseDuration
      if (duration_days === 1 || (cruiseDetection.detectedDuration && cruiseDetection.detectedDuration > duration_days)) {
        duration_days = bestDuration
        console.log(`🚢 Adjusted cruise duration to ${duration_days} days`)
      }
    }

    // UPDATED: Determine effective package type
    const effectivePackageType = determinePackageType(requested_package_type, cruiseDetection)
    console.log(`📦 Package type: ${effectivePackageType}`)

    let effectiveCity = city
    if (cruiseDetection.isCruise && cruiseDetection.startCity) {
      effectiveCity = cruiseDetection.startCity
    } else if (cities.length > 0) {
      effectiveCity = cities[0]
    }

    console.log('🤖 Starting itinerary generation:', {
      client: client_name,
      inputMode,
      isCruise: cruiseDetection.isCruise,
      packageType: effectivePackageType,
      tier,
      duration: duration_days,
      startCity: effectiveCity
    })

    const totalPax = num_adults + num_children

    // Passport type
    let isEuroPassport = is_euro_passport
    if (isEuroPassport === null && nationality) {
      const euCountries = ['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden', 'norway', 'iceland', 'liechtenstein', 'switzerland']
      isEuroPassport = euCountries.some(c => nationality.toLowerCase().includes(c))
    }
    isEuroPassport = isEuroPassport ?? false

    // Auto-set currency to EUR for Euro passport holders
    let effectiveCurrency = currency
    if (isEuroPassport && effectiveCurrency !== 'EUR') {
      console.log(`💶 Euro passport detected (${nationality}) — setting currency to EUR (was ${effectiveCurrency})`)
      effectiveCurrency = 'EUR'
    }

    // Calculate dates
    const startDateObj = new Date(start_date)
    const endDate = new Date(startDateObj)
    endDate.setDate(startDateObj.getDate() + duration_days - 1)

    const year = new Date().getFullYear()
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const tierPrefix = tier.charAt(0).toUpperCase()
    const itinerary_code = `ITN-${tierPrefix}-${year}-${randomNum}`

    const marginMultiplier = 1 + (margin_percent / 100)
    const withMargin = (cost: number) => Math.round(cost * marginMultiplier * 100) / 100

    // ============================================
    // CRUISE PATH (creative mode ONLY, cruise-package or cruise-land)
    // CRITICAL: Structured mode ALWAYS takes priority over cruise content library.
    // If the user provided a day-by-day itinerary, we must follow it — not replace with a cruise template.
    // ============================================
    if (cruiseDetection.isCruise && inputMode === 'creative' && !is_structured_input && (effectivePackageType === 'cruise-package' || effectivePackageType === 'cruise-land')) {
      console.log(`🚢 Processing as ${effectivePackageType} itinerary (creative mode, no structured input)...`)
      
      const cruiseContent = await findCruiseContent(cruiseDetection, tier, duration_days)
      
      if (cruiseContent.found && cruiseContent.dayByDay.length > 0) {
        console.log(`📚 Using Content Library cruise: ${cruiseContent.content.name}`)
        
        // Use Content Library duration if available
        if (cruiseContent.content.duration_days) {
          duration_days = cruiseContent.content.duration_days
        }
        
        const nights = duration_days - 1
        const cruiseRate = await getCruiseRate({
          tier,
          recommendedSuppliers: cruiseContent.recommendedSuppliers,
          supabase,
          totalPax,
          nights,
          startDate: start_date,
          isEuroPassport
        })
        console.log(`💰 Cruise rate: ${cruiseRate.totalPerNight}/night total on ${cruiseRate.shipName} (${cruiseRate.season} season)`)
        if (cruiseRate.cabinAllocation.length > 0) {
          console.log(`🛏️ Cabins: ${cruiseRate.cabinAllocation.map(a => `${a.count}×${a.type}`).join(' + ')}`)
        }

        // Fetch cruise transport (bundled flat rate)
        const cruiseTransportRules = await fetchCruiseTransportPricingRules()
        const cruiseTransportRule = findCruiseTransportRule(cruiseTransportRules, duration_days)
        let cruiseTransportRate = 0
        let cruiseTransportVehicle = 'Minivan'
        if (cruiseTransportRule) {
          const transport = getCruiseTransportRate(cruiseTransportRule, totalPax)
          cruiseTransportRate = transport.rate
          cruiseTransportVehicle = transport.vehicleType
          console.log(`🚗 Cruise transport: ${cruiseTransportVehicle} = ${cruiseTransportRate} (flat rate for ${duration_days}D)`)
        }

        // Fetch guide rate
        const { data: cruiseGuides } = await supabase.from('guides').select('*').eq('is_active', true).eq('tier', tier).contains('languages', [finalLanguage]).limit(5)
        const cruiseGuide = cruiseGuides?.[0]
        const cruiseGuidePerDay = cruiseGuide ? toNumber(cruiseGuide.daily_rate_eur, 0) : 0
        if (!cruiseGuidePerDay) console.warn(`⚠️ No cruise guide rate found for ${finalLanguage}/${tier}`)

        // Fetch tipping rates
        const { data: cruiseTippingRates } = await supabase.from('tipping_rates').select('*').eq('is_active', true)
        let cruiseDailyTips = cruiseTippingRates?.reduce((sum: number, t: any) => t.rate_unit === 'per_day' ? sum + toNumber(t.rate_eur, 0) : sum, 0) || 0
        if (!cruiseDailyTips) console.warn('⚠️ No cruise tipping rates found')

        // Fetch entrance fees
        const { data: cruiseEntranceFees } = await supabase.from('entrance_fees').select('*').eq('is_active', true)

        // Create itinerary with cabin_allocation
        const { data: itinerary, error: itineraryError } = await supabase
          .from('itineraries')
          .insert({
            itinerary_code,
            client_name,
            client_email: client_email || null,
            client_phone: client_phone || null,
            trip_name: cruiseContent.variation.title || cruiseContent.content.name,
            start_date,
            end_date: endDate.toISOString().split('T')[0],
            total_days: duration_days,
            num_adults,
            num_children,
            currency: effectiveCurrency,
            total_cost: 0,
            total_revenue: 0,
            margin_percent,
            status: skip_pricing ? 'draft' : 'quoted',
            tier,
            package_type: effectivePackageType,
            cost_mode,
            notes: special_requests.length > 0 ? special_requests.join('; ') : null,
            client_id,
            cabin_allocation: cruiseRate.found ? cruiseRate.cabinAllocation : null,
            // B2B Partner fields
            partner_id: partner_id || null,
            partner_commission_percent: partner_commission_percent || 0,
            source: partner_id ? 'b2b_custom' : source
          })
          .select()
          .single()

        if (itineraryError) throw new Error(`Failed to create itinerary: ${itineraryError.message}`)

        console.log('✅ Created cruise itinerary:', itinerary.id)

        let totalSupplierCost = 0
        let totalClientPrice = 0
        const createdCruiseDays: { id: string; title: string; description: string; city: string; overnight_city: string }[] = []
        let transportAdded = false

        // Create days from Content Library
        for (const dayData of cruiseContent.dayByDay) {
          const dayDate = new Date(startDateObj)
          dayDate.setDate(startDateObj.getDate() + dayData.day_number - 1)

          const dayTitle = dayData.title
          const dayDescription = dayData.description
          const dayCity = dayData.city || effectiveCity
          const dayOvernight = dayData.overnight || `On board - ${dayData.city}`
          const isLastDay = dayData.day_number === duration_days
          const isSailingDay = dayData.is_sailing_day || false
          const dayNeedsGuide = !isSailingDay && (dayData.attractions?.length > 0 || dayData.guide_required !== false)

          const { data: day, error: dayError } = await supabase
            .from('itinerary_days')
            .insert({
              itinerary_id: itinerary.id,
              day_number: dayData.day_number,
              date: dayDate.toISOString().split('T')[0],
              title: dayTitle,
              description: dayDescription,
              city: dayCity,
              overnight_city: dayOvernight,
              attractions: dayData.attractions || [],
              guide_required: dayNeedsGuide,
              lunch_included: dayData.meals?.includes('lunch') ?? true,
              dinner_included: dayData.meals?.includes('dinner') ?? true,
              hotel_included: false,
              is_cruise_day: true
            })
            .select()
            .single()

          if (dayError) {
            console.error(`❌ Error creating day ${dayData.day_number}:`, dayError)
            continue
          }

          createdCruiseDays.push({ id: day.id, title: dayTitle, description: dayDescription, city: dayCity, overnight_city: dayOvernight })

          if (skip_pricing) continue

          // --- SERVICE 1: Cruise Accommodation (per night, not on last day) ---
          if (!isLastDay && cruiseRate.found) {
            const nightCost = cruiseRate.totalPerNight
            const cabinDesc = cruiseRate.cabinAllocation.map(a => `${a.count}×${a.type}`).join(' + ')

            await supabase.from('itinerary_services').insert({
              itinerary_day_id: day.id,
              service_type: 'cruise',
              service_code: cruiseRate.supplierId || 'CRUISE',
              service_name: `${cruiseRate.shipName} - Full Board (${cabinDesc})`,
              supplier_name: cruiseRate.shipName,
              quantity: totalPax,
              rate_eur: cruiseRate.totalPerNight / totalPax,
              rate_non_eur: cruiseRate.totalPerNight / totalPax,
              total_cost: nightCost,
              client_price: withMargin(nightCost),
              notes: `Night ${dayData.day_number}: ${dayOvernight} | ${cruiseRate.season} season | ${cabinDesc}`
            })

            totalSupplierCost += nightCost
            totalClientPrice += withMargin(nightCost)
          }

          // --- SERVICE 2: Bundled Cruise Transport (flat rate, added once on day 1) ---
          if (!transportAdded && cruiseTransportRate > 0) {
            await supabase.from('itinerary_services').insert({
              itinerary_day_id: day.id,
              service_type: 'transportation',
              service_code: cruiseTransportRule?.id || 'CRUISE-TRANSPORT',
              service_name: `Cruise Transport Package (${cruiseTransportVehicle})`,
              supplier_name: null,
              quantity: 1,
              rate_eur: cruiseTransportRate,
              rate_non_eur: cruiseTransportRate,
              total_cost: cruiseTransportRate,
              client_price: withMargin(cruiseTransportRate),
              notes: `Bundled transport for ${duration_days}D cruise: transfers + sightseeing (${cruiseTransportVehicle})`
            })

            totalSupplierCost += cruiseTransportRate
            totalClientPrice += withMargin(cruiseTransportRate)
            transportAdded = true
          }

          // --- SERVICE 3: Guide (on touring days, not sailing days) ---
          if (dayNeedsGuide) {
            await supabase.from('itinerary_services').insert({
              itinerary_day_id: day.id,
              service_type: 'guide',
              service_code: cruiseGuide?.id || 'GUIDE',
              service_name: `${finalLanguage} Speaking Guide`,
              supplier_name: cruiseGuide?.name || null,
              quantity: 1,
              rate_eur: cruiseGuidePerDay,
              rate_non_eur: cruiseGuidePerDay,
              total_cost: cruiseGuidePerDay,
              client_price: withMargin(cruiseGuidePerDay),
              notes: `Professional ${finalLanguage} guide`
            })

            totalSupplierCost += cruiseGuidePerDay
            totalClientPrice += withMargin(cruiseGuidePerDay)

            // --- SERVICE 4: Tips (when guide is present) ---
            await supabase.from('itinerary_services').insert({
              itinerary_day_id: day.id,
              service_type: 'tips',
              service_code: 'TIPS',
              service_name: 'Daily Tips',
              quantity: 1,
              rate_eur: cruiseDailyTips,
              rate_non_eur: cruiseDailyTips,
              total_cost: cruiseDailyTips,
              client_price: withMargin(cruiseDailyTips),
              notes: 'Driver and guide tips'
            })

            totalSupplierCost += cruiseDailyTips
            totalClientPrice += withMargin(cruiseDailyTips)
          }

          // --- SERVICE 5: Entrance Fees (all attractions get fees, except photo_stops) ---
          const cruisePhotoStops = dayData.photo_stops || []
          if (dayData.attractions?.length > 0) {
            let dayEntranceTotal = 0
            const matchedAttractions: string[] = []

            for (const attractionName of dayData.attractions) {
              // Skip if this attraction is a photo stop (outside viewing only, no fee)
              if (cruisePhotoStops.some((ps: string) => ps.toLowerCase() === attractionName.toLowerCase())) {
                continue
              }

              const fee = cruiseEntranceFees?.find((ef: any) =>
                ef.attraction_name.toLowerCase().includes(attractionName.toLowerCase()) ||
                attractionName.toLowerCase().includes(ef.attraction_name.toLowerCase())
              )

              if (fee) {
                if (fee.is_addon) continue
                const feePerPerson = isEuroPassport ? toNumber(fee.eur_rate, 0) : toNumber(fee.non_eur_rate, fee.eur_rate || 0)
                dayEntranceTotal += feePerPerson * totalPax
                matchedAttractions.push(fee.attraction_name)
              }
            }

            if (dayEntranceTotal > 0) {
              await supabase.from('itinerary_services').insert({
                itinerary_day_id: day.id,
                service_type: 'entrance',
                service_code: 'ENTRANCE',
                service_name: `Entrance Fees (${isEuroPassport ? 'EUR' : 'non-EUR'})`,
                quantity: totalPax,
                rate_eur: dayEntranceTotal / totalPax,
                rate_non_eur: dayEntranceTotal / totalPax,
                total_cost: dayEntranceTotal,
                client_price: withMargin(dayEntranceTotal),
                notes: `Sites: ${matchedAttractions.join(', ')}`
              })

              totalSupplierCost += dayEntranceTotal
              totalClientPrice += withMargin(dayEntranceTotal)
            }
          }

          // --- SERVICE 6: Water (on touring days) ---
          if (!isSailingDay) {
            const waterCost = 2 * totalPax
            await supabase.from('itinerary_services').insert({
              itinerary_day_id: day.id,
              service_type: 'supplies',
              service_code: 'WATER',
              service_name: 'Water Bottles',
              quantity: totalPax,
              rate_eur: 2,
              rate_non_eur: 2,
              total_cost: waterCost,
              client_price: withMargin(waterCost),
              notes: 'Bottled water'
            })

            totalSupplierCost += waterCost
            totalClientPrice += withMargin(waterCost)
          }
        }

        // Update totals
        if (!skip_pricing) {
          await supabase.from('itineraries').update({
            total_cost: totalClientPrice,
            total_revenue: totalClientPrice,
            supplier_cost: totalSupplierCost,
            profit: totalClientPrice - totalSupplierCost
          }).eq('id', itinerary.id)
        }

        console.log('🎉 Cruise itinerary complete!')

        // Auto-create language version
        const cruiseTripName = cruiseContent.variation.title || cruiseContent.content.name
        await createLanguageVersions(supabase, itinerary.id, cruiseTripName, finalLanguage, createdCruiseDays)

        return NextResponse.json({
          success: true,
          data: {
            id: itinerary.id,
            itinerary_id: itinerary.id,
            itinerary_code: itinerary.itinerary_code,
            trip_name: cruiseTripName,
            tier,
            package_type: effectivePackageType,
            is_cruise: true,
            cruise_ship: cruiseRate.shipName,
            generation_mode: 'creative',
            mode: skip_pricing ? 'draft' : 'quoted',
            redirect_to: skip_pricing ? `/itineraries/${itinerary.id}/edit` : `/itineraries/${itinerary.id}`,
            currency: effectiveCurrency,
            total_days: duration_days,
            ...(skip_pricing ? {} : {
              supplier_cost: totalSupplierCost,
              total_cost: totalClientPrice,
              margin: totalClientPrice - totalSupplierCost,
              per_person_cost: Math.round(totalClientPrice / totalPax * 100) / 100,
              content_library_used: true,
              cruise_content: cruiseContent.content.name
            })
          }
        })
      } else {
        console.log('⚠️ No cruise content in Content Library, falling back to AI generation')
        // Fall through to standard AI generation
      }
    }

    // ============================================
    // LAND TOUR / CRUISE+LAND PATH (STRUCTURED OR CREATIVE)
    // ============================================
    console.log(`🏛️ Processing as ${effectivePackageType} itinerary (${inputMode} mode)...`)

    // Fetch rates and content
    const searchCities = cities.length > 0 ? cities : [effectiveCity]
    const contentLibrary = await fetchContentLibrary(tier, searchCities, interests)
    const writingRules = await fetchWritingRules()
    const contentContext = buildContentContext(contentLibrary)
    const writingContext = buildWritingRulesContext(writingRules)
    const attractionNames = await fetchAttractionsList(supabase)

    // Determine inclusions based on package type
    let includeAccommodationFinal = include_accommodation
    if (effectivePackageType === 'day-trips' || effectivePackageType === 'tours-only') {
      includeAccommodationFinal = false
    }

    // Fetch rates — all from database, no hardcoded fallbacks
    // Transportation: query transportation_rates (tiered vehicle structure)
    const { data: transportRates } = await supabase
      .from('transportation_rates')
      .select('*')
      .eq('is_active', true)
      .eq('service_type', 'day_tour')
      .ilike('city', effectiveCity)
      .limit(1)

    const { getTransportRateForPax } = await import('@/lib/transport-rate-utils')
    const transportResult = transportRates?.length ? getTransportRateForPax(transportRates[0], totalPax, isEuroPassport) : null
    if (!transportResult) {
      console.warn(`⚠️ No transportation rate found for ${effectiveCity}, ${totalPax} pax — transport will be €0`)
    }
    const vehiclePerDay = transportResult ? (isEuroPassport ? transportResult.rateEur : transportResult.rateNonEur) : 0
    const vehicleTypeName = transportResult ? transportResult.vehicleType : 'Vehicle'
    const vehicleServiceCode = transportRates?.[0]?.id || 'TRANS'
    const vehicleSupplierName = transportRates?.[0]?.supplier_name || null

    // Transfer rate: query transportation_rates for airport_transfer service type
    const { data: transferRates } = await supabase
      .from('transportation_rates')
      .select('*')
      .eq('is_active', true)
      .eq('service_type', 'airport_transfer')
      .ilike('city', effectiveCity)
      .limit(1)
    const transferResult = transferRates?.length ? getTransportRateForPax(transferRates[0], totalPax, isEuroPassport) : null
    const transferRate = transferResult ? (isEuroPassport ? transferResult.rateEur : transferResult.rateNonEur) : 0
    if (!transferResult) {
      console.warn(`⚠️ No airport transfer rate found for ${effectiveCity}, ${totalPax} pax — transfer will be €0`)
    }

    // Guides
    const { data: guides } = await supabase.from('guides').select('*').eq('is_active', true).eq('tier', tier).contains('languages', [finalLanguage]).limit(5)
    let selectedGuide = guides?.[0]
    if (!selectedGuide) {
      // Fallback: any active guide for this language
      const { data: fallbackGuides } = await supabase.from('guides').select('*').eq('is_active', true).contains('languages', [finalLanguage]).limit(1)
      selectedGuide = fallbackGuides?.[0]
    }
    const guidePerDay = selectedGuide ? toNumber(selectedGuide.daily_rate_eur, 0) : 0
    if (!guidePerDay) console.warn(`⚠️ No guide rate found for ${finalLanguage}/${tier} — guide will be €0`)

    // Entrance fees
    const { data: allEntranceFees } = await supabase.from('entrance_fees').select('*').eq('is_active', true)

    // Meal rates
    const { data: mealRates } = await supabase.from('meal_rates').select('*').eq('is_active', true).limit(1)
    let lunchRate = toNumber(mealRates?.[0]?.lunch_rate_eur, 0)
    let dinnerRate = toNumber(mealRates?.[0]?.dinner_rate_eur, 0)
    if (!lunchRate) console.warn('⚠️ No lunch rate found in meal_rates — lunch will be €0')
    if (!dinnerRate) console.warn('⚠️ No dinner rate found in meal_rates — dinner will be €0')

    // Airport services
    const { data: airportServicesData } = await supabase.from('airport_services').select('*').eq('is_active', true)
    const airportServiceRate = airportServicesData?.reduce((sum: number, s: any) => sum + toNumber(s.rate_eur, 0), 0) || 0
    if (!airportServiceRate) console.warn('⚠️ No airport service rates found — airport service will be €0')

    // Hotel services
    const { data: hotelServicesData } = await supabase.from('hotel_services').select('*').eq('is_active', true)
    const hotelServiceRate = hotelServicesData?.reduce((sum: number, s: any) => sum + toNumber(s.rate_eur, 0), 0) || 0
    if (!hotelServiceRate) console.warn('⚠️ No hotel service rates found — hotel service will be €0')

    // Accommodation
    let hotelRate = 0
    let hotelName_final = hotel_name || null
    let selectedHotel: any = null

    if (includeAccommodationFinal) {
      // PRIORITY 1: Try to match the specific hotel name from the parsed input
      if (hotel_name) {
        const { data: namedHotels } = await supabase
          .from('accommodation_rates')
          .select('*')
          .eq('is_active', true)
          .ilike('property_name', `%${hotel_name}%`)
          .limit(3)

        if (namedHotels?.length) {
          selectedHotel = namedHotels[0]
          hotelRate = isEuroPassport
            ? toNumber(selectedHotel.pp_double_eur, 0)
            : toNumber(selectedHotel.pp_double_non_eur, 0)
          hotelName_final = selectedHotel.property_name
          console.log(`🏨 Matched parsed hotel name "${hotel_name}" → ${selectedHotel.property_name} (rate: ${hotelRate})`)
        } else {
          console.log(`⚠️ Parsed hotel "${hotel_name}" not found in accommodation_rates — falling back to tier search`)
        }
      }

      // PRIORITY 2: Fall back to city + tier search if no hotel matched by name
      if (!selectedHotel) {
        const { data: hotels } = await supabase
          .from('accommodation_rates')
          .select('*')
          .ilike('city', effectiveCity)
          .eq('is_active', true)
          .eq('tier', tier)
          .order('created_at', { ascending: false })
          .limit(5)

        if (hotels?.length) {
          selectedHotel = hotels[0]
          hotelRate = isEuroPassport
            ? toNumber(selectedHotel.pp_double_eur, 0)
            : toNumber(selectedHotel.pp_double_non_eur, 0)
          hotelName_final = selectedHotel.property_name
        }
      }

      if (!hotelRate) {
        console.warn(`⚠️ No hotel rate found for ${effectiveCity}/${tier} — accommodation will be €0`)
      }
    }

    // Tipping rates
    const { data: tippingRates } = await supabase.from('tipping_rates').select('*').eq('is_active', true)
    let dailyTips = tippingRates?.reduce((sum: number, t: any) => t.rate_unit === 'per_day' ? sum + toNumber(t.rate_eur, 0) : sum, 0) || 0
    if (!dailyTips) console.warn('⚠️ No tipping rates found — tips will be €0')


    // ============================================
    // GENERATE ITINERARY CONTENT
    // ============================================

    let itineraryData: any

    if (inputMode === 'structured' && raw_itinerary) {
      console.log('📋 Using STRUCTURED mode - following provided itinerary')
      
      itineraryData = await generateFromStructuredInput(
        extracted_days || [],
        raw_itinerary,
        {
          tier,
          totalPax,
          language: finalLanguage,
          attractionNames,
          writingRules,
          packageType: effectivePackageType
        }
      )
    } else {
      console.log('🎨 Using CREATIVE mode - AI generating itinerary')
      
      itineraryData = await generateCreativeItinerary({
        clientName: client_name,
        tourName: finalTourName,
        durationDays: duration_days,
        tier,
        totalPax,
        numAdults: num_adults,
        numChildren: num_children,
        language: finalLanguage,
        cities,
        interests,
        specialRequests: special_requests,
        startDate: start_date,
        effectiveCity,
        attractionNames,
        contentContext,
        writingContext,
        includeLunch: include_lunch,
        includeDinner: include_dinner,
        includeAccommodation: includeAccommodationFinal
      })
    }

    // Update duration from AI result
    if (itineraryData.total_days) {
      duration_days = itineraryData.total_days
    }

    // Recalculate end date
    const finalEndDate = new Date(startDateObj)
    finalEndDate.setDate(startDateObj.getDate() + duration_days - 1)

    // Create itinerary record - UPDATED: Use effectivePackageType + B2B partner fields
    const { data: itinerary, error: itineraryError } = await supabase
      .from('itineraries')
      .insert({
        itinerary_code,
        client_name,
        client_email: client_email || null,
        client_phone: client_phone || null,
        trip_name: itineraryData.trip_name || finalTourName,
        start_date,
        end_date: finalEndDate.toISOString().split('T')[0],
        total_days: duration_days,
        num_adults,
        num_children,
        currency: effectiveCurrency,
        total_cost: 0,
        total_revenue: 0,
        margin_percent,
        status: skip_pricing ? 'draft' : 'quoted',
        tier,
        package_type: effectivePackageType,
        cost_mode,
        notes: special_requests.length > 0 ? special_requests.join('; ') : null,
        client_id,
        // B2B Partner fields
        partner_id: partner_id || null,
        partner_commission_percent: partner_commission_percent || 0,
        source: partner_id ? 'b2b_custom' : source
      })
      .select()
      .single()

    if (itineraryError) {
      console.error('❌ Failed to create itinerary:', itineraryError)
      throw new Error(`Failed to create itinerary: ${itineraryError.message}`)
    }

    console.log(`✅ Created itinerary ${itinerary.id} with ${duration_days} days`)

    // Create days and services
    let totalSupplierCost = 0
    let totalClientPrice = 0
    let landCruiseTransportAdded = false
    const createdLandDays: { id: string; title: string; description: string; city: string; overnight_city: string }[] = []

    for (const dayData of itineraryData.days || []) {
      const dayNumber = dayData.day_number || 1
      const dayDate = new Date(startDateObj)
      dayDate.setDate(startDateObj.getDate() + dayNumber - 1)

      const isLastDay = dayNumber === duration_days
      const isTransferOnly = dayData.is_transfer_only || false
      const isSailingDay = dayData.is_sailing_day || false
      const isFreeDay = dayData.is_free_day || isSailingDay || false
      // Cruise day detection: trust AI output OR force based on package type
      // For cruise-package: ALL days except departure are cruise days
      // For cruise-land: trust AI's is_cruise_day flag or accommodation_type
      const isCruiseDay = dayData.is_cruise_day || dayData.accommodation_type === 'cruise'
        || (effectivePackageType === 'cruise-package' && !isLastDay && !isTransferOnly)
      const dayNeedsGuide = dayData.guide_required !== false && !isTransferOnly && !isFreeDay
      const dayIncludesLunch = isFreeDay ? false : (dayData.includes_lunch ?? include_lunch)
      const dayIncludesDinner = dayData.includes_dinner ?? include_dinner
      const includesHotelForDay = !isLastDay && includeAccommodationFinal && !isCruiseDay && (dayData.includes_hotel !== false)

      // Generate appropriate title for free/sailing days
      let dayTitle = dayData.title || `Day ${dayNumber}`
      if (isSailingDay && !dayTitle.toLowerCase().includes('sailing')) {
        dayTitle = `Day ${dayNumber}: Sailing Day on the Nile`
      } else if (isFreeDay && !isSailingDay && !dayTitle.toLowerCase().includes('free') && !dayTitle.toLowerCase().includes('leisure')) {
        dayTitle = `Day ${dayNumber}: Day at Leisure`
      }

      // Create day record - for tours-only/day-trips, no overnight city
      const overnightCityValue = (effectivePackageType === 'tours-only' || effectivePackageType === 'day-trips')
        ? null
        : (dayData.overnight_city || dayData.city || effectiveCity)

      const { data: day, error: dayError } = await supabase
        .from('itinerary_days')
        .insert({
          itinerary_id: itinerary.id,
          day_number: dayNumber,
          date: dayDate.toISOString().split('T')[0],
          title: dayTitle,
          description: dayData.description || '',
          city: dayData.city || effectiveCity,
          overnight_city: overnightCityValue,
          attractions: dayData.attractions || [],
          guide_required: dayNeedsGuide,
          lunch_included: dayIncludesLunch,
          dinner_included: dayIncludesDinner,
          hotel_included: includesHotelForDay,
          is_cruise_day: isCruiseDay
        })
        .select()
        .single()

      if (dayError) {
        console.error(`❌ Error creating day ${dayNumber}:`, dayError)
        continue
      }

      createdLandDays.push({
        id: day.id,
        title: dayTitle,
        description: dayData.description || '',
        city: dayData.city || effectiveCity,
        overnight_city: overnightCityValue
      })

      if (skip_pricing) continue

      // Handle departure day - transfer + airport/hotel services
      if (dayData.is_departure && isTransferOnly) {
        const departureServices: any[] = []

        // Airport service (international departure)
        departureServices.push({
          service_type: 'airport_service',
          service_code: 'AIRPORT',
          service_name: 'Airport Meet & Assist (International)',
          quantity: 1,
          rate_eur: airportServiceRate,
          rate_non_eur: airportServiceRate,
          total_cost: airportServiceRate,
          client_price: withMargin(airportServiceRate),
          notes: dayData.flight_info ? `Flight: ${dayData.flight_info}` : 'Airport assistance'
        })
        totalSupplierCost += airportServiceRate
        totalClientPrice += withMargin(airportServiceRate)

        // Hotel service (check-out assistance)
        const isCruiseCheckout = dayData.accommodation_type === 'cruise' || dayData.is_cruise_day
        departureServices.push({
          service_type: 'hotel_service',
          service_code: 'HOTEL-SVC',
          service_name: isCruiseCheckout ? 'Cruise Disembarkation Assistance' : 'Hotel Porterage & Assistance',
          quantity: 1,
          rate_eur: hotelServiceRate,
          rate_non_eur: hotelServiceRate,
          total_cost: hotelServiceRate,
          client_price: withMargin(hotelServiceRate),
          notes: isCruiseCheckout ? 'Cruise disembarkation assistance' : 'Hotel check-out assistance'
        })
        totalSupplierCost += hotelServiceRate
        totalClientPrice += withMargin(hotelServiceRate)

        // Transfer to airport (uses airport_transfer rate from transportation_rates)
        departureServices.push({
          service_type: 'transportation',
          service_code: transferRates?.[0]?.id || vehicleServiceCode,
          service_name: 'Airport Transfer',
          supplier_name: transferRates?.[0]?.supplier_name || vehicleSupplierName,
          quantity: 1,
          rate_eur: transferRate,
          rate_non_eur: transferRate,
          total_cost: transferRate,
          client_price: withMargin(transferRate),
          notes: 'Transfer to airport'
        })
        totalSupplierCost += transferRate
        totalClientPrice += withMargin(transferRate)

        // Insert all departure services
        for (const svc of departureServices) {
          await supabase.from('itinerary_services').insert({ itinerary_day_id: day.id, ...svc })
        }
        continue
      }

      // Services array
      const services: any[] = []

      // Airport Services (for arrivals/departures/domestic flights)
      if (dayData.needs_airport_service || dayData.is_arrival || dayData.is_departure || dayData.flight_info) {
        const isInternational = dayData.is_arrival || dayData.is_departure
        const serviceDesc = isInternational ? 'Airport Meet & Assist (International)' : 'Airport Meet & Assist (Domestic)'
        
        services.push({
          service_type: 'airport_service',
          service_code: 'AIRPORT',
          service_name: serviceDesc,
          quantity: 1,
          rate_eur: airportServiceRate,
          rate_non_eur: airportServiceRate,
          total_cost: airportServiceRate,
          client_price: withMargin(airportServiceRate),
          notes: dayData.flight_info ? `Flight: ${dayData.flight_info}` : 'Airport assistance'
        })
        totalSupplierCost += airportServiceRate
        totalClientPrice += withMargin(airportServiceRate)
      }

      // Hotel Services (for check-in/check-out — always on arrival/departure days regardless of accommodation type)
      if ((dayData.needs_hotel_service || dayData.is_arrival || dayData.is_departure) && !isFreeDay) {
        const isCruiseService = dayData.accommodation_type === 'cruise' || dayData.is_cruise_day
        services.push({
          service_type: 'hotel_service',
          service_code: 'HOTEL-SVC',
          service_name: isCruiseService ? 'Cruise Boarding Assistance' : 'Hotel Porterage & Assistance',
          quantity: 1,
          rate_eur: hotelServiceRate,
          rate_non_eur: hotelServiceRate,
          total_cost: hotelServiceRate,
          client_price: withMargin(hotelServiceRate),
          notes: isCruiseService ? 'Cruise embarkation/disembarkation assistance' : 'Hotel check-in/out assistance'
        })
        totalSupplierCost += hotelServiceRate
        totalClientPrice += withMargin(hotelServiceRate)
      }

      // Transportation (skip for cruise days — bundled transport added separately)
      if (!isFreeDay && !isCruiseDay) {
        const transportRate = isTransferOnly ? transferRate : vehiclePerDay
        services.push({
          service_type: 'transportation',
          service_code: vehicleServiceCode,
          service_name: isTransferOnly ? 'Airport/Hotel Transfer' : `${vehicleTypeName} Transportation`,
          supplier_name: vehicleSupplierName,
          quantity: 1,
          rate_eur: transportRate,
          rate_non_eur: transportRate,
          total_cost: transportRate,
          client_price: withMargin(transportRate),
          notes: `From ${dayData.city || effectiveCity}`
        })
        totalSupplierCost += transportRate
        totalClientPrice += withMargin(transportRate)
      }

      // Guide (only if required for this day)
      if (dayNeedsGuide) {
        services.push({
          service_type: 'guide',
          service_code: selectedGuide?.id || 'GUIDE',
          service_name: `${finalLanguage} Speaking Guide`,
          supplier_name: selectedGuide?.name || null,
          quantity: 1,
          rate_eur: guidePerDay,
          rate_non_eur: guidePerDay,
          total_cost: guidePerDay,
          client_price: withMargin(guidePerDay),
          notes: `Professional ${finalLanguage} guide`
        })
        totalSupplierCost += guidePerDay
        totalClientPrice += withMargin(guidePerDay)

       // Tips (only when guide is present)
       services.push({
        service_type: 'tips',
        service_code: 'TIPS',
        service_name: 'Daily Tips',
        quantity: 1,
        rate_eur: dailyTips,
        rate_non_eur: dailyTips,
        total_cost: dailyTips,
        client_price: withMargin(dailyTips),
        notes: 'Driver and guide tips'
      })
      totalSupplierCost += dailyTips
      totalClientPrice += withMargin(dailyTips)
      }

      // Entrance fees — all attractions get fees by default, except photo_stops (outside only)
      const entranceAttractions = dayData.attractions || []
      const photoStops = dayData.photo_stops || []
      
      if (entranceAttractions.length > 0 && !isTransferOnly && !isFreeDay) {
        let dayEntranceTotal = 0
        const matchedAttractions: string[] = []
        
        for (const attr of entranceAttractions) {
          // Skip if this attraction is in photo_stops (outside viewing only, no fee)
          if (photoStops.some((ps: string) => ps.toLowerCase() === attr.toLowerCase())) {
            continue
          }
          
          const fee = allEntranceFees?.find((ef: any) =>
            ef.attraction_name.toLowerCase().includes(attr.toLowerCase()) ||
            attr.toLowerCase().includes(ef.attraction_name.toLowerCase())
          )
          
          if (fee) {
            // Check if it's an add-on (should be excluded from automatic pricing)
            if (fee.is_addon) continue

            const feePerPerson = isEuroPassport
              ? toNumber(fee.eur_rate, 0)
              : toNumber(fee.non_eur_rate, fee.eur_rate || 0)
            dayEntranceTotal += feePerPerson * totalPax
            matchedAttractions.push(fee.attraction_name)
          } else {
            console.warn(`⚠️ Day ${dayNumber}: No entrance fee found for "${attr}" — skipping`)
          }
        }
        
        if (dayEntranceTotal > 0) {
          const notesText = photoStops.length > 0
            ? `Entrance: ${matchedAttractions.join(', ')} | Photo stops: ${photoStops.join(', ')}`
            : `Sites: ${matchedAttractions.join(', ')}`
          
          services.push({
            service_type: 'entrance',
            service_code: 'ENTRANCE',
            service_name: `Entrance Fees (${isEuroPassport ? 'EUR' : 'non-EUR'})`,
            quantity: totalPax,
            rate_eur: dayEntranceTotal / totalPax,
            rate_non_eur: dayEntranceTotal / totalPax,
            total_cost: dayEntranceTotal,
            client_price: withMargin(dayEntranceTotal),
            notes: notesText
          })
          totalSupplierCost += dayEntranceTotal
          totalClientPrice += withMargin(dayEntranceTotal)
        }
      }

      // Lunch (only if included for this day)
      if (dayIncludesLunch) {
        const lunchCost = lunchRate * totalPax
        services.push({
          service_type: 'meal',
          service_code: 'LUNCH',
          service_name: 'Lunch',
          quantity: totalPax,
          rate_eur: lunchRate,
          rate_non_eur: lunchRate,
          total_cost: lunchCost,
          client_price: withMargin(lunchCost),
          notes: 'Lunch at local restaurant'
        })
        totalSupplierCost += lunchCost
        totalClientPrice += withMargin(lunchCost)
      }

      // Dinner (only if included for this day)
      if (dayIncludesDinner) {
        const dinnerCost = dinnerRate * totalPax
        services.push({
          service_type: 'meal',
          service_code: 'DINNER',
          service_name: 'Dinner',
          quantity: totalPax,
          rate_eur: dinnerRate,
          rate_non_eur: dinnerRate,
          total_cost: dinnerCost,
          client_price: withMargin(dinnerCost),
          notes: 'Dinner'
        })
        totalSupplierCost += dinnerCost
        totalClientPrice += withMargin(dinnerCost)
      }

       // Water (for touring days only)
      if (!isTransferOnly && !isFreeDay) {
        const waterCost = 2 * totalPax
        services.push({
          service_type: 'supplies',
          service_code: 'WATER',
          service_name: 'Water Bottles',
          quantity: totalPax,
          rate_eur: 2,
          rate_non_eur: 2,
          total_cost: waterCost,
          client_price: withMargin(waterCost),
          notes: 'Bottled water'
        })
        totalSupplierCost += waterCost
        totalClientPrice += withMargin(waterCost)
      }

      // Hotel (only if included and not last day and not cruise day) — per-person pricing
      if (includesHotelForDay && hotelRate > 0) {
        const hotelCost = hotelRate * totalPax
        services.push({
          service_type: 'accommodation',
          service_code: selectedHotel?.id || 'HOTEL',
          service_name: `${hotelName_final} (${totalPax} ${totalPax > 1 ? 'persons' : 'person'})`,
          supplier_name: hotelName_final,
          quantity: totalPax,
          rate_eur: hotelRate,
          rate_non_eur: hotelRate,
          total_cost: hotelCost,
          client_price: withMargin(hotelCost),
          notes: `Overnight at ${hotelName_final}`
        })
        totalSupplierCost += hotelCost
        totalClientPrice += withMargin(hotelCost)
      }

      // Cruise accommodation + bundled transport (for cruise days in cruise-land packages)
      if (isCruiseDay && !isLastDay) {
        // Count cruise nights for this itinerary
        const cruiseNightsInPackage = (itineraryData.days || []).filter(
          (d: any) => (d.is_cruise_day || d.accommodation_type === 'cruise') && d.day_number !== duration_days
        ).length

        const landCruiseRate = await getCruiseRate({
          tier,
          recommendedSuppliers: [],
          supabase,
          totalPax,
          nights: cruiseNightsInPackage,
          startDate: start_date,
          isEuroPassport
        })

        if (landCruiseRate.found) {
          const nightCost = landCruiseRate.totalPerNight
          const cabinDesc = landCruiseRate.cabinAllocation.map((a: CabinAllocation) => `${a.count}×${a.type}`).join(' + ')

          services.push({
            service_type: 'cruise',
            service_code: landCruiseRate.supplierId || 'CRUISE',
            service_name: `${landCruiseRate.shipName} - Full Board (${cabinDesc})`,
            supplier_name: landCruiseRate.shipName,
            quantity: totalPax,
            rate_eur: landCruiseRate.totalPerNight / totalPax,
            rate_non_eur: landCruiseRate.totalPerNight / totalPax,
            total_cost: nightCost,
            client_price: withMargin(nightCost),
            notes: `Night ${dayNumber}: On board | ${landCruiseRate.season} season | ${cabinDesc}`
          })
          totalSupplierCost += nightCost
          totalClientPrice += withMargin(nightCost)

          // Store cabin allocation on itinerary (once)
          if (dayNumber === (itineraryData.days || []).find((d: any) => d.is_cruise_day || d.accommodation_type === 'cruise')?.day_number) {
            await supabase.from('itineraries').update({
              cabin_allocation: landCruiseRate.cabinAllocation
            }).eq('id', itinerary.id)
          }
        }
      }

      // Bundled cruise transport (added once on first cruise day)
      if (isCruiseDay && !landCruiseTransportAdded) {
        const cruiseDaysCount = (itineraryData.days || []).filter(
          (d: any) => d.is_cruise_day || d.accommodation_type === 'cruise'
        ).length

        const landCruiseTransportRules = await fetchCruiseTransportPricingRules()
        const landCruiseTransportRule = findCruiseTransportRule(landCruiseTransportRules, cruiseDaysCount)
        if (landCruiseTransportRule) {
          const transport = getCruiseTransportRate(landCruiseTransportRule, totalPax)
          services.push({
            service_type: 'transportation',
            service_code: landCruiseTransportRule.id || 'CRUISE-TRANSPORT',
            service_name: `Cruise Transport Package (${transport.vehicleType})`,
            supplier_name: null,
            quantity: 1,
            rate_eur: transport.rate,
            rate_non_eur: transport.rate,
            total_cost: transport.rate,
            client_price: withMargin(transport.rate),
            notes: `Bundled transport for ${cruiseDaysCount}D cruise: transfers + sightseeing (${transport.vehicleType})`
          })
          totalSupplierCost += transport.rate
          totalClientPrice += withMargin(transport.rate)
        }
        landCruiseTransportAdded = true
      }

      // Insert all services
      for (const svc of services) {
        await supabase.from('itinerary_services').insert({
          itinerary_day_id: day.id,
          ...svc
        })
      }
    }

    // Update totals
    if (!skip_pricing) {
      await supabase.from('itineraries').update({
        total_cost: totalClientPrice,
        total_revenue: totalClientPrice,
        supplier_cost: totalSupplierCost,
        profit: totalClientPrice - totalSupplierCost,
        status: 'quoted'
      }).eq('id', itinerary.id)
    }

    console.log('🎉 Land tour itinerary complete!', {
      id: itinerary.id,
      mode: inputMode,
      packageType: effectivePackageType,
      days: duration_days,
      supplierCost: totalSupplierCost,
      clientPrice: totalClientPrice
    })

    // Auto-create language version
    await createLanguageVersions(supabase, itinerary.id, itineraryData.trip_name, finalLanguage, createdLandDays)

    return NextResponse.json({
      success: true,
      data: {
        id: itinerary.id,
        itinerary_id: itinerary.id,
        itinerary_code: itinerary.itinerary_code,
        trip_name: itineraryData.trip_name,
        tier,
        package_type: effectivePackageType,
        is_cruise: cruiseDetection.isCruise,
        generation_mode: inputMode,
        mode: skip_pricing ? 'draft' : 'quoted',
        redirect_to: skip_pricing ? `/itineraries/${itinerary.id}/edit` : `/itineraries/${itinerary.id}`,
        currency: effectiveCurrency,
        total_days: duration_days,
        ...(skip_pricing ? {} : {
          supplier_cost: totalSupplierCost,
          total_cost: totalClientPrice,
          margin: totalClientPrice - totalSupplierCost,
          per_person_cost: Math.round(totalClientPrice / totalPax * 100) / 100
        })
      }
    })

  } catch (error: any) {
    console.error('❌ Error generating itinerary:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate itinerary' },
      { status: 500 }
    )
  }
}