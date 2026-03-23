import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { PACKAGE_TYPE_SLUGS } from '@/lib/package-types'
import { createMessageWithRetry, getUserFriendlyError } from '@/lib/ai/anthropic-client'

// ============================================
// EGYPTIAN TRAVEL ABBREVIATIONS
// ============================================

const EGYPT_CITY_CODES = [
  'CAI', 'ALX', 'ALY', 'ASW', 'LXR', 'HRG', 'SSH', 'RMF', 'ABS',
  'GZA', 'KOM', 'EDU', 'EDFU', 'ESN', 'ABY', 'DEN', 'SAQ', 'MEM', 'FAY', 'SIW'
]

const EGYPT_ACCOMMODATION_CODES = ['NTS', 'CRZ', 'HTL', 'OVN']

const AIRLINE_CODES = [
  'MS', 'BA', 'TK', 'QR', 'EK', 'EY', 'LH', 'AF', 'KL', 'FZ', 'G9', 'SV', 'RJ', 'NP', 'SM'
]

// ============================================
// STRUCTURED ITINERARY DETECTION
// ============================================

interface StructureDetectionResult {
  isStructured: boolean
  confidence: number
  detectedDays: number
  signals: string[]
  extractedDays: ExtractedDay[] | null
  rawDaySegments: string[]
}

interface ExtractedDay {
  date: string | null
  date_display: string | null
  day_number: number
  title: string
  activities: string[]
  city: string | null
  overnight_city: string
  is_transfer_only: boolean
  is_arrival: boolean
  is_departure: boolean
  is_free_day: boolean
  flight_info: string | null
  hotel_name: string | null
  meals_mentioned: string[]
  attractions: string[]
  guide_required: boolean
  transport_type: string | null
  notes: string | null
}

function detectStructuredItinerary(text: string): StructureDetectionResult {
  const signals: string[] = []
  let confidence = 0
  const rawDaySegments: string[] = []

  // ============================================
  // PATTERN 1: Egyptian day markers (D1, D2, D3...)
  // This is the PRIMARY pattern for Egyptian travel agents
  // ============================================
  const egyptDayPattern = /\bD(\d+)\b/gi
  const egyptDayMatches = text.match(egyptDayPattern)
  let maxDayNumber = 0
  
  if (egyptDayMatches && egyptDayMatches.length >= 1) {
    // Extract the highest day number
    egyptDayMatches.forEach(match => {
      const num = parseInt(match.replace(/\D/g, ''))
      if (num > maxDayNumber) maxDayNumber = num
    })
    
    signals.push(`Found ${egyptDayMatches.length} Egyptian day markers (D1, D2... up to D${maxDayNumber})`)
    confidence += Math.min(egyptDayMatches.length * 15, 40)
  }

  // ============================================
  // PATTERN 2: NTS (nights) patterns - 2NTS CAI, 3NTS CRZ
  // ============================================
  const ntsPattern = /(\d+)\s*NTS?\s*([A-Z]{2,4})/gi
  const ntsMatches = text.match(ntsPattern)
  
  if (ntsMatches && ntsMatches.length >= 1) {
    signals.push(`Found ${ntsMatches.length} night allocation patterns (e.g., "2NTS CAI")`)
    confidence += ntsMatches.length * 15
    
    // Calculate total nights from NTS pattern
    let totalNights = 0
    let match
    const ntsRegex = /(\d+)\s*NTS?/gi
    while ((match = ntsRegex.exec(text)) !== null) {
      totalNights += parseInt(match[1])
    }
    if (totalNights > 0) {
      signals.push(`Total nights from NTS pattern: ${totalNights} (= ${totalNights + 1} days)`)
    }
  }

  // ============================================
  // PATTERN 3: Egyptian city codes (CAI, ALX, ASW, LXR, HRG, CRZ)
  // ============================================
  const cityCodePattern = new RegExp(`\\b(${EGYPT_CITY_CODES.join('|')})\\b`, 'gi')
  const cityMatches = text.match(cityCodePattern)
  
  if (cityMatches && cityMatches.length >= 2) {
    const uniqueCities = [...new Set(cityMatches.map(c => c.toUpperCase()))]
    signals.push(`Found ${uniqueCities.length} Egyptian city codes: ${uniqueCities.join(', ')}`)
    confidence += Math.min(uniqueCities.length * 8, 25)
  }

  // ============================================
  // PATTERN 4: Nile Cruise mentions (CRITICAL)
  // ============================================
  const cruisePattern = /\b(CRZ|C\/IN|C\/OUT|check\s*in\s*crz|check\s*out\s*crz|nile\s*cruise|\d+\s*night[s]?\s*cruise|cruise\s*from|cruise\s*to)\b/gi
  const cruiseMatches = text.match(cruisePattern)

  if (cruiseMatches && cruiseMatches.length >= 1) {
    signals.push(`🚢 NILE CRUISE DETECTED: ${cruiseMatches.join(', ')}`)
    confidence += 20
  }

  // Also check for simple "cruise" mention
  const simpleCruisePattern = /\bcruise\b/gi
  const simpleCruiseMatches = text.match(simpleCruisePattern)
  if (simpleCruiseMatches && !cruiseMatches) {
    signals.push(`🚢 Cruise keyword found`)
    confidence += 15
  }

  // ============================================
  // PATTERN 5: Flight codes (MS956, BA155, etc.)
  // ============================================
  const flightPattern = new RegExp(`\\b(${AIRLINE_CODES.join('|')})(\\d{2,4})\\b`, 'gi')
  const flightMatches = text.match(flightPattern)
  
  if (flightMatches && flightMatches.length >= 1) {
    signals.push(`Found ${flightMatches.length} flight codes: ${flightMatches.join(', ')}`)
    confidence += 15
  }

  // ============================================
  // PATTERN 6: Time markers (@05:10, @23:20)
  // ============================================
  const timePattern = /@\s*\d{1,2}[:\.]?\d{2}/gi
  const timeMatches = text.match(timePattern)
  
  if (timeMatches && timeMatches.length >= 1) {
    signals.push(`Found ${timeMatches.length} time markers`)
    confidence += 10
  }

  // ============================================
  // PATTERN 7: INSIDE/OUTSIDE markers
  // ============================================
  const insideOutsidePattern = /\(\s*(INSIDE|OUTSIDE)\s*\)/gi
  const insideOutsideMatches = text.match(insideOutsidePattern)
  
  if (insideOutsideMatches && insideOutsideMatches.length >= 1) {
    signals.push(`Found ${insideOutsideMatches.length} entrance markers (INSIDE/OUTSIDE)`)
    confidence += 15
  }

  // ============================================
  // PATTERN 8: PROGRAM: header
  // ============================================
  const programPattern = /\bPROGRAM\s*:/i
  if (programPattern.test(text)) {
    signals.push('Found "PROGRAM:" header')
    confidence += 20
  }

  // ============================================
  // PATTERN 9: Standard "Day 1:", "Day 2:" markers
  // Handles: "Day 1:", "Day 1 -", "Day 1 –", "Day 1 —",
  //          "Day 1 Arrival...", "Day 1\n", "Day 1 (anything)"
  // ============================================
  const dayMarkerPattern = /\bDay\s*(\d+)\s*(?:[:\-–—]|\b)/gi
  const dayMarkers = text.match(dayMarkerPattern)
  if (dayMarkers && dayMarkers.length >= 2) {
    signals.push(`Found ${dayMarkers.length} standard day markers (Day 1, Day 2...)`)
    confidence += Math.min(dayMarkers.length * 12, 30)

    // Extract highest day number
    dayMarkers.forEach(match => {
      const num = parseInt(match.replace(/\D/g, ''))
      if (num > maxDayNumber) maxDayNumber = num
    })
  }

  // ============================================
  // PATTERN 10: Explicit date patterns
  // ============================================
  const datePatterns = [
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/gi,
    /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi,
    /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,
  ]
  
  let dateMatches = 0
  for (const pattern of datePatterns) {
    const matches = text.match(pattern)
    if (matches) dateMatches += matches.length
  }
  
  if (dateMatches >= 2) {
    signals.push(`Found ${dateMatches} date references`)
    confidence += Math.min(dateMatches * 8, 20)
  }

  // ============================================
  // PATTERN 11: Meal indicators (L, D, B, LUNCH, DINNER)
  // ============================================
  const mealPattern = /\b(LUNCH|DINNER|BREAKFAST)\b|\b,\s*[LD]\s*,|\b,\s*[LD]\s*$/gi
  const mealMatches = text.match(mealPattern)
  
  if (mealMatches && mealMatches.length >= 2) {
    signals.push(`Found ${mealMatches.length} meal indicators`)
    confidence += 10
  }

  // ============================================
  // PATTERN 12: Overnight indicators
  // ============================================
  const overnightPattern = /\bOVERNIGHT\s+(AT|IN)\b/gi
  const overnightMatches = text.match(overnightPattern)
  
  if (overnightMatches && overnightMatches.length >= 1) {
    signals.push(`Found ${overnightMatches.length} overnight indicators`)
    confidence += 10
  }

  // ============================================
  // PATTERN 13: Egyptian attractions
  // ============================================
  const attractionPatterns = [
    /\b(pyramids?|sphinx|giza|karnak|luxor\s*temple|valley\s*of\s*(the\s*)?kings|hatshepsut|abu\s*simbel|philae|phaila|edfu|kom\s*ombo|egyptian\s*museum|grand\s*(egyptian\s*)?museum|GEM|khan\s*el[- ]?khalili|citadel|high\s*dam|unfinished\s*obelisk|memnon|pompey|qaitbay|montazah|alexandria\s*library)\b/gi
  ]
  
  let attractionCount = 0
  for (const pattern of attractionPatterns) {
    const matches = text.match(pattern)
    if (matches) attractionCount += matches.length
  }
  
  if (attractionCount >= 3) {
    signals.push(`Found ${attractionCount} Egyptian attractions`)
    confidence += Math.min(attractionCount * 3, 15)
  }

  // ============================================
  // PATTERN 14: City transitions (CAI/ALX/CAI, LXR/HRG)
  // ============================================
  const transitionPattern = /[A-Z]{2,4}\s*\/\s*[A-Z]{2,4}/gi
  const transitionMatches = text.match(transitionPattern)
  
  if (transitionMatches && transitionMatches.length >= 1) {
    signals.push(`Found ${transitionMatches.length} city transitions (e.g., CAI/ALX)`)
    confidence += transitionMatches.length * 10
  }

  // ============================================
  // EXTRACT DAY SEGMENTS for passing to AI
  // ============================================

  // Method 1: Split by D1, D2, D3... pattern (Egyptian shorthand)
  const daySegmentPattern = /\bD(\d+)\b/gi
  let lastIndex = 0
  let match
  const segments: { dayNum: number; content: string; startIndex: number }[] = []

  while ((match = daySegmentPattern.exec(text)) !== null) {
    if (segments.length > 0) {
      segments[segments.length - 1].content = text.substring(segments[segments.length - 1].startIndex, match.index).trim()
    }
    segments.push({
      dayNum: parseInt(match[1]),
      content: '',
      startIndex: match.index
    })
  }

  // Complete the last segment
  if (segments.length > 0) {
    segments[segments.length - 1].content = text.substring(segments[segments.length - 1].startIndex).trim()
  }

  // Method 2: If no D1/D2 segments found, try "Day 1", "Day 2" prose-style patterns
  if (segments.length === 0) {
    const prosePattern = /\bDay\s*(\d+)\b/gi
    while ((match = prosePattern.exec(text)) !== null) {
      if (segments.length > 0) {
        segments[segments.length - 1].content = text.substring(segments[segments.length - 1].startIndex, match.index).trim()
      }
      segments.push({
        dayNum: parseInt(match[1]),
        content: '',
        startIndex: match.index
      })
    }

    if (segments.length > 0) {
      segments[segments.length - 1].content = text.substring(segments[segments.length - 1].startIndex).trim()
    }
  }

  // Sort by day number and extract content
  segments.sort((a, b) => a.dayNum - b.dayNum)
  segments.forEach(seg => {
    if (seg.content) {
      rawDaySegments.push(seg.content)
    }
  })

  // ============================================
  // CALCULATE DETECTED DAYS
  // ============================================
  let detectedDays = maxDayNumber

  // If no day markers found, try to calculate from NTS pattern
  if (detectedDays === 0 && ntsMatches) {
    let totalNights = 0
    const ntsRegex = /(\d+)\s*NTS?/gi
    let m
    while ((m = ntsRegex.exec(text)) !== null) {
      totalNights += parseInt(m[1])
    }
    if (totalNights > 0) {
      detectedDays = totalNights + 1
    }
  }

  // Fallback to segment count
  if (detectedDays === 0 && rawDaySegments.length > 0) {
    detectedDays = rawDaySegments.length
  }

  // ============================================
  // DETERMINE IF STRUCTURED
  // ============================================
  
  // Lower threshold if we have strong Egyptian patterns
  const hasEgyptianPatterns = egyptDayMatches && egyptDayMatches.length >= 2
  const hasNtsPattern = ntsMatches && ntsMatches.length >= 1
  const hasCityCodes = cityMatches && cityMatches.length >= 2
  
  // If we have D1, D2 patterns OR NTS patterns, it's definitely structured
  const definitelyStructured = hasEgyptianPatterns || (hasNtsPattern && hasCityCodes)
  
  const isStructured = definitelyStructured || (confidence >= 35 && detectedDays >= 2)

  // Boost confidence if definitely structured
  if (definitelyStructured && confidence < 70) {
    confidence = Math.max(confidence, 70)
  }

  console.log('🔍 Structure Detection Debug:', {
    egyptDayMatches: egyptDayMatches?.length || 0,
    ntsMatches: ntsMatches?.length || 0,
    cityMatches: cityMatches?.length || 0,
    maxDayNumber,
    detectedDays,
    confidence,
    definitelyStructured,
    isStructured,
    signals
  })

  return {
    isStructured,
    confidence: Math.min(confidence, 100),
    detectedDays,
    signals,
    extractedDays: null,
    rawDaySegments
  }
}

// Helper function to extract email using regex
function extractEmailFromText(text: string): string {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const matches = text.match(emailRegex)
  return matches ? matches[0] : ''
}

// Helper function to extract phone using regex
function extractPhoneFromText(text: string): string {
  const telPatterns = [
    /TEL[：:]\s*([0-9\-\+\(\)\s]{8,20})/i,
    /Tel[：:]\s*([0-9\-\+\(\)\s]{8,20})/i,
    /Phone[：:]\s*([0-9\-\+\(\)\s]{8,20})/i,
    /Mobile[：:]\s*([0-9\-\+\(\)\s]{8,20})/i,
    /携帯[：:]\s*([0-9\-\+\(\)\s]{8,20})/,
    /電話[：:]\s*([0-9\-\+\(\)\s]{8,20})/,
  ]
  
  for (const pattern of telPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  const phonePatterns = [
    /\+\d{1,3}[\s\-]?\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,4}/,
    /\d{2,4}-\d{3,4}-\d{3,4}/,
    /\(\d{2,4}\)\s?\d{3,4}[\s\-]?\d{3,4}/,
  ]
  
  for (const pattern of phonePatterns) {
    const match = text.match(pattern)
    if (match) {
      return match[0].trim()
    }
  }
  
  return ''
}

export async function POST(request: Request) {
  try {
    const { conversation } = await request.json()

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'No conversation provided' },
        { status: 400 }
      )
    }

    // Pre-detect if this is a structured itinerary
    const structureDetection = detectStructuredItinerary(conversation)
    
    console.log('📊 Structure Detection Result:', {
      isStructured: structureDetection.isStructured,
      confidence: structureDetection.confidence,
      detectedDays: structureDetection.detectedDays,
      signals: structureDetection.signals,
      rawDaySegments: structureDetection.rawDaySegments.length
    })

    // Pre-extract email and phone using regex as fallback
    const regexEmail = extractEmailFromText(conversation)
    const regexPhone = extractPhoneFromText(conversation)

    // Build the appropriate prompt based on detection
    const systemPrompt = structureDetection.isStructured
      ? buildStructuredExtractionPrompt(structureDetection.rawDaySegments)
      : buildGeneralExtractionPrompt()

    // Call Claude to analyze the conversation (with retry on 429/529)
    const message = await createMessageWithRetry({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\n---\n\nINPUT TEXT:\n${conversation}`
        }
      ]
    })

    // Extract text content from Claude's response
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('')

    // Parse JSON from response
    let extracted: any = {}
    try {
      // Find JSON in the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      console.error('Failed to parse Claude response:', e)
      console.log('Raw response:', responseText.substring(0, 500))
    }

    // Helper to validate date
    const isValidDate = (dateStr: string): boolean => {
      if (!dateStr) return false
      const date = new Date(dateStr)
      return !isNaN(date.getTime())
    }

    // Detect Nile Cruise and determine package type
    const hasCruise = /\b(CRZ|cruise|nile\s*cruise|\d+\s*night\s*cruise)\b/i.test(conversation)
    const hasHotelsOrCairo = /\b(CAI|Cairo|hotel|HTL|\d+\s*NTS?\s*CAI|\d+\s*NTS?\s*HRG)\b/i.test(conversation)

    // Determine package_type based on content
    let detectedPackageType = extracted.package_type
    if (!detectedPackageType) {
      if (hasCruise && hasHotelsOrCairo) {
        detectedPackageType = 'cruise-land'  // Cruise + Hotels
      } else if (hasCruise) {
        detectedPackageType = 'cruise-package'  // Cruise only
      } else {
        detectedPackageType = 'land-package'  // Default: Hotels + Tours
      }
    }

    // Determine Euro passport from nationality — match country names AND demonyms
    const detectedNationality = extracted.nationality || ''
    const euTerms = [
      'austria', 'belgian', 'belgium', 'bulgarian', 'bulgaria', 'croatian', 'croatia',
      'cypriot', 'cyprus', 'czech', 'danish', 'denmark', 'estonian', 'estonia',
      'finnish', 'finland', 'french', 'france', 'german', 'germany', 'greek', 'greece',
      'hungarian', 'hungary', 'irish', 'ireland', 'italian', 'italy', 'latvian', 'latvia',
      'lithuanian', 'lithuania', 'luxembourgish', 'luxembourg', 'maltese', 'malta',
      'dutch', 'netherlands', 'polish', 'poland', 'portuguese', 'portugal',
      'romanian', 'romania', 'slovak', 'slovakia', 'slovenian', 'slovenia',
      'spanish', 'spain', 'swedish', 'sweden', 'norwegian', 'norway',
      'icelandic', 'iceland', 'swiss', 'switzerland', 'liechtenstein',
      'austrian', 'eu', 'eur', 'euro', 'european', 'schengen',
    ]
    const isEuroPassport = detectedNationality
      ? euTerms.some(t => detectedNationality.toLowerCase().includes(t))
      : null

    // ============================================
    // GUIDE LANGUAGE: nationality → language mapping
    // If the AI extracted an explicit guide language, use it.
    // Otherwise, infer from nationality. Otherwise, default to English.
    // ============================================
    const nationalityToGuideLanguage = (nationality: string): string | null => {
      if (!nationality) return null
      const n = nationality.toLowerCase().trim()
      const map: Record<string, string> = {
        // Spanish-speaking
        'spanish': 'Spanish', 'spain': 'Spanish', 'mexican': 'Spanish', 'mexico': 'Spanish',
        'colombian': 'Spanish', 'colombia': 'Spanish', 'argentinian': 'Spanish', 'argentina': 'Spanish',
        'peruvian': 'Spanish', 'peru': 'Spanish', 'chilean': 'Spanish', 'chile': 'Spanish',
        'venezuelan': 'Spanish', 'venezuela': 'Spanish', 'ecuadorian': 'Spanish', 'ecuador': 'Spanish',
        'cuban': 'Spanish', 'cuba': 'Spanish', 'dominican': 'Spanish',
        'guatemalan': 'Spanish', 'honduran': 'Spanish', 'salvadoran': 'Spanish',
        'nicaraguan': 'Spanish', 'costa rican': 'Spanish', 'panamanian': 'Spanish',
        'uruguayan': 'Spanish', 'paraguayan': 'Spanish', 'bolivian': 'Spanish',
        // Portuguese-speaking
        'portuguese': 'Portuguese', 'portugal': 'Portuguese',
        'brazilian': 'Portuguese', 'brazil': 'Portuguese',
        // French-speaking
        'french': 'French', 'france': 'French',
        'belgian': 'French', 'belgium': 'French',
        'swiss': 'French', 'switzerland': 'French',
        'canadian': 'French', // Many Canadian tourists prefer French
        // German-speaking
        'german': 'German', 'germany': 'German',
        'austrian': 'German', 'austria': 'German',
        // Italian-speaking
        'italian': 'Italian', 'italy': 'Italian',
        // Japanese-speaking
        'japanese': 'Japanese', 'japan': 'Japanese',
        // Chinese-speaking
        'chinese': 'Chinese', 'china': 'Chinese',
        // Russian-speaking
        'russian': 'Russian', 'russia': 'Russian',
        // Korean-speaking
        'korean': 'Korean', 'south korean': 'Korean', 'korea': 'Korean',
        // Arabic-speaking (still useful for Arabic-speaking guides)
        'saudi': 'Arabic', 'saudi arabian': 'Arabic', 'saudi arabia': 'Arabic',
        'emirati': 'Arabic', 'uae': 'Arabic', 'kuwaiti': 'Arabic', 'kuwait': 'Arabic',
        'qatari': 'Arabic', 'qatar': 'Arabic', 'bahraini': 'Arabic', 'bahrain': 'Arabic',
        'omani': 'Arabic', 'oman': 'Arabic', 'iraqi': 'Arabic', 'iraq': 'Arabic',
        'jordanian': 'Arabic', 'jordan': 'Arabic', 'lebanese': 'Arabic', 'lebanon': 'Arabic',
        'libyan': 'Arabic', 'libya': 'Arabic', 'tunisian': 'Arabic', 'tunisia': 'Arabic',
        'algerian': 'Arabic', 'algeria': 'Arabic', 'moroccan': 'Arabic', 'morocco': 'Arabic',
        'sudanese': 'Arabic', 'sudan': 'Arabic', 'syrian': 'Arabic', 'syria': 'Arabic',
        'palestinian': 'Arabic', 'palestine': 'Arabic', 'yemeni': 'Arabic', 'yemen': 'Arabic',
        // Dutch-speaking
        'dutch': 'Dutch', 'netherlands': 'Dutch', 'holland': 'Dutch',
        // Polish-speaking
        'polish': 'Polish', 'poland': 'Polish',
        // Turkish-speaking
        'turkish': 'Turkish', 'turkey': 'Turkish',
        // Greek-speaking
        'greek': 'Greek', 'greece': 'Greek',
        // Hindi-speaking
        'indian': 'Hindi', 'india': 'Hindi',
      }
      return map[n] || null
    }

    // Determine guide language: explicit request > nationality > English
    const explicitGuideLanguage = extracted.language && extracted.language !== 'English' ? extracted.language : null
    const nationalityLanguage = nationalityToGuideLanguage(detectedNationality)
    const guideLanguage = explicitGuideLanguage || nationalityLanguage || 'English'

    // Build final response with fallbacks
    const data = {
      // Client info
      client_name: extracted.client_name || '',
      client_email: extracted.client_email || regexEmail || '',
      client_phone: extracted.client_phone || regexPhone || '',
      company_name: extracted.company_name || '',
      nationality: detectedNationality,
      is_euro_passport: isEuroPassport,

      // Trip info
      trip_name: extracted.trip_name || extracted.tour_requested || 'Egypt Tour',
      tour_requested: extracted.tour_requested || '',
      tour_name: extracted.tour_name || extracted.trip_name || 'Egypt Tour',
      package_type: detectedPackageType,
      start_date: isValidDate(extracted.start_date) ? extracted.start_date : '',
      end_date: isValidDate(extracted.end_date) ? extracted.end_date : '',
      duration_days: parseInt(extracted.duration_days) || structureDetection.detectedDays || 1,
      num_adults: parseInt(extracted.num_adults) || 2,
      num_children: parseInt(extracted.num_children) || 0,

      // Preferences
      // Guide language: explicit request > nationality-based > English
      language: guideLanguage,
      interests: Array.isArray(extracted.interests) ? extracted.interests : [],
      cities: Array.isArray(extracted.cities) ? extracted.cities : [],
      special_requests: Array.isArray(extracted.special_requests) ? extracted.special_requests : [],
      budget_level: extracted.budget_level || 'standard',
      meal_plan: extracted.meal_plan || '',

      // Accommodation
      hotel_name: extracted.hotel_name || '',
      hotel_location: extracted.hotel_location || '',
      
      // Metadata
      conversation_language: extracted.conversation_language || 'English',
      confidence_score: parseFloat(extracted.confidence_score) || 0.8,
      
      // STRUCTURE DETECTION RESULTS
      is_structured_input: structureDetection.isStructured,
      structure_confidence: structureDetection.confidence,
      structure_signals: structureDetection.signals,
      
      // EXTRACTED DAY-BY-DAY (only if structured)
      extracted_days: structureDetection.isStructured && extracted.days
        ? extracted.days
        : null,

      // Raw itinerary text for generator
      // ALWAYS pass the raw text so the generator can do its own structure detection
      // even if the parser's confidence was too low to flag it as structured.
      // This prevents losing the original itinerary content.
      raw_itinerary: conversation
    }

    console.log('✅ Parsed result:', {
      client: data.client_name,
      nationality: data.nationality,
      isEuroPassport: data.is_euro_passport,
      guideLanguage: data.language,
      guideLanguageSource: explicitGuideLanguage ? 'explicit_request' : nationalityLanguage ? 'nationality' : 'default',
      packageType: data.package_type,
      mealPlan: data.meal_plan,
      isStructured: data.is_structured_input,
      structureConfidence: data.structure_confidence,
      days: data.extracted_days?.length || 0,
      durationDays: data.duration_days,
      signals: data.structure_signals
    })

    return NextResponse.json({
      success: true,
      data
    })

  } catch (error) {
    console.error('Error parsing conversation:', error)
    const { message, status } = getUserFriendlyError(error)
    return NextResponse.json(
      { success: false, error: message },
      { status }
    )
  }
}

// ============================================
// PROMPT FOR STRUCTURED ITINERARY EXTRACTION
// ============================================

function buildStructuredExtractionPrompt(rawDaySegments: string[]): string {
  return `You are an expert travel operations assistant specializing in EGYPTIAN TOURISM.

The user has provided a STRUCTURED ITINERARY using Egyptian travel industry abbreviations.

=================================================================
EGYPTIAN TRAVEL ABBREVIATIONS - YOU MUST DECODE THESE
=================================================================

CITY CODES (IATA):
CAI = Cairo
ALX / ALY = Alexandria
ASW = Aswan
LXR = Luxor
HRG = Hurghada (Red Sea)
SSH = Sharm El Sheikh (Red Sea)
RMF = Marsa Alam (Red Sea)
ABS = Abu Simbel
GZA = Giza
KOM = Kom Ombo
EDU / EDFU = Edfu
ESN = Esna
DEN = Dendera
ABY = Abydos
SAQ = Saqqara
MEM = Memphis
FAY = Fayoum
SIW = Siwa Oasis
DHB = Dahab
NWB = Nuweiba
EL-G = El Gouna

ACCOMMODATION TYPES:
NTS / N / NT = Nights (e.g., "3NTS CAI" = 3 nights in Cairo, "4N LXR" = 4 nights Luxor)
CRZ = Nile Cruise (THIS IS CRITICAL - NOT a hotel!)
HTL = Hotel
OVN = Overnight
C/IN = Check-in
C/OUT = Check-out

=================================================================
NILE CRUISE DETECTION & PACKAGE TYPE (CRITICAL!)
=================================================================
When you see ANY of these, it's a NILE CRUISE itinerary (NOT hotels):
- "CRZ" = Nile Cruise
- "cruise" (case insensitive) = Nile Cruise
- "Nile cruise" = Nile Cruise
- "4 night cruise" / "3 night cruise" = Nile Cruise
- "cruise from Luxor" / "cruise from Aswan" = Nile Cruise
- "3NTS CRZ" / "4N CRZ" = 3 or 4 nights on Nile Cruise
- Days mentioning Kom Ombo + Edfu + Aswan in sequence = Nile Cruise route

PACKAGE TYPE MAPPING:
- "cruise-package" = ONLY Nile Cruise (no hotels, no Cairo)
- "cruise-land" = Cruise + Hotels/Land tours (e.g., Cairo + Cruise)
- "land-package" = Hotels + Tours (no cruise)
- "tours-only" = Client has own hotel, we provide tours only
- "day-trips" = Single day excursions

IMPORTANT: Nile Cruise is a BOAT, not a hotel. When cruise is mentioned:
- If ONLY cruise nights = package_type: "cruise-package"
- If cruise + Cairo/hotels = package_type: "cruise-land"
- Do NOT suggest hotels for cruise nights
- Cruise typically sails between Luxor and Aswan

AIRLINE CODES:
MS = EgyptAir (Egypt's national carrier)
TK = Turkish Airlines
BA = British Airways
QR = Qatar Airways
EK = Emirates
EY = Etihad Airways
LH = Lufthansa
AF = Air France
KL = KLM
FZ = Flydubai
G9 = Air Arabia
SV = Saudia
RJ = Royal Jordanian
NP = Nile Air (domestic Egypt)
SM = Air Cairo (domestic Egypt)

MEAL PLANS (Hotel Abbreviations):
RO / ROB = Room Only (no meals)
BB / B&B = Bed & Breakfast
HB = Half Board (breakfast + dinner)
FB = Full Board (breakfast + lunch + dinner)
AI / ALL = All Inclusive
UAI = Ultra All Inclusive
SC = Self Catering

MEALS IN ITINERARY:
B = Breakfast
L = Lunch
D = Dinner
L/R = Lunch at Local Restaurant
LR = Local Restaurant
"Chinese Dinner" = Dinner at Chinese restaurant
"Seafood Lunch" = Lunch at seafood restaurant

DAY MARKERS:
D1, D2, D3... = Day 1, Day 2, Day 3...
"D1 CAI/ALX/CAI" = Day 1: Cairo to Alexandria and back to Cairo
"D3 CRZ" = Day 3: On Nile Cruise (sailing day)

ENTRANCE MARKERS (CRITICAL FOR PRICING):
(INSIDE) = Entrance fee INCLUDED, guests go inside
(OUTSIDE) / (FROM OUTSIDE) = Photo stop only, NO entrance fee
"from outside" = Same as (OUTSIDE) - no entrance included
"photo stop" = Same as (OUTSIDE) - no entrance included

TRANSPORT:
TRF = Transfer
A/C = Air Conditioned vehicle
VIP = VIP/Luxury vehicle
DOM FLT = Domestic Flight
INT FLT = International Flight

CALCULATION:
Number of DAYS = Number of NIGHTS + 1
Example: "2NTS CAI + 3NTS CRZ + 3NTS HRG" = 8 nights = 9 days
Example: "4 night cruise from Luxor" = 5 days on the Nile

=================================================================
CRITICAL RULES
=================================================================

1. EXTRACT EXACTLY what is written - do NOT add or remove activities
2. If a day just shows "D5 CRZ" with nothing else = Free/Sailing day
3. If a day shows "D8 HRG" with nothing else = Free day in Hurghada
4. Decode ALL abbreviations to full names
5. Mark attractions with (INSIDE) in entrance_included array
6. Mark attractions with (OUTSIDE) in photo_stops array
7. If flight code is mentioned (MS956@05:10), extract it
8. Count total days from NTS pattern: 2+3+3 = 8 nights = 9 days
9. OVERNIGHT CITY DETERMINATION (CRITICAL):
   - overnight_city = the city where the traveler SLEEPS that night, NOT where they visit during the day
   - For day trips (e.g., "CAI/ALX/CAI", "visit X and return to Y", "back to Y"):
     * overnight_city = the BASE CITY they return to sleep in
     * Example: Day trip to Alexandria from Cairo → city: "Alexandria", overnight_city: "Cairo"
   - For city-to-city transfers (e.g., "CAI/ASW"):
     * overnight_city = the DESTINATION city (where they arrive and sleep)
   - For NTS patterns (e.g., "3NTS HRG"):
     * overnight_city = the city in the NTS notation for all those nights
   - For cruise days: overnight_city = the port city or "Nile Cruise"
   - Look for clues: "return to", "back to", "night at", "overnight in", "stay at [Hotel] in [City]"
   - If unsure, overnight_city = the LAST city mentioned in the day's route

=================================================================
EMAIL FORMAT DETECTION (CRITICAL)
=================================================================

If the input contains email headers like "From:", "Subject:", "Date:":
1. **[Sender Email: xxx]** at the start = THIS IS THE CLIENT'S EMAIL (from headers). Use directly as client_email.
2. "From: X" = X is the RECIPIENT (travel agent), NOT the client
3. "Dear Mr. X" = X is the RECIPIENT, NOT the sender
4. The CLIENT is the person MAKING THE REQUEST:
   - Look for names with phone numbers at the END of the message
   - Look for signatures like "Name + Company + Phone"
   - Look for company names (B2B partners)
5. Extract sender's email from (priority): [Sender Email] tag > signatures > message body

=================================================================
DAY SEGMENTS DETECTED
=================================================================
${rawDaySegments.length > 0 ? rawDaySegments.map((seg, i) => `Segment ${i + 1}: ${seg}`).join('\n') : 'Parse from raw input'}

=================================================================
OUTPUT FORMAT
=================================================================

Return ONLY valid JSON:

{
  "client_name": "name of SENDER/REQUESTER (NOT the 'Dear X' recipient) or empty string",
  "client_email": "sender's email from signature or body, or empty string",
  "client_phone": "sender's phone from signature or body, or empty string",
  "company_name": "sender's company (B2B partner) or empty string",
  "nationality": "nationality of TRAVELERS (not sender) if mentioned or empty string",

  "trip_name": "Descriptive trip name based on itinerary",
  "tour_requested": "original request summary",
  "tour_name": "Descriptive tour name",
  "package_type": "${PACKAGE_TYPE_SLUGS.join('|')} - CRITICAL: Use 'cruise-package' for Nile Cruise only, 'cruise-land' if cruise + hotels!",
  "start_date": "YYYY-MM-DD format if mentioned",
  "end_date": "YYYY-MM-DD format if mentioned",
  "duration_days": number (calculate from NTS if not explicit),
  "num_adults": number (default 2),
  "num_children": number (default 0),

  "language": "guide language - set if explicitly requested (e.g. 'Spanish guide'). If not explicitly stated, leave as empty string and the system will infer from nationality.",
  "interests": ["decoded interests/attractions"],
  "cities": ["Cairo", "Alexandria", "Aswan", "Luxor", "Hurghada"],
  "special_requests": ["any special requests"],
  "budget_level": "budget|standard|deluxe|luxury",
  "meal_plan": "RO|BB|HB|FB|AI if mentioned",

  "hotel_name": "hotel if mentioned (NOT for cruise nights!)",
  "hotel_location": "location if mentioned",
  
  "conversation_language": "English",
  "confidence_score": 0.95,
  
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD or null",
      "date_display": "original date format or null",
      "title": "Day 1: Arrival & Alexandria Day Trip",
      "city": "Cairo",
      "cities_visited": ["Cairo", "Alexandria"],
      "overnight_city": "Cairo (WHERE THEY SLEEP - not Alexandria despite visiting it! They RETURN to Cairo)",
      "is_arrival": true,
      "is_departure": false,
      "is_transfer_only": false,
      "is_free_day": false,
      "is_cruise_day": false,
      "activities": ["Arrive Cairo", "Transfer to Alexandria", "Visit Pompey's Pillar", "Visit Qaitbay Citadel", "Photo stop at Alexandria Library", "Visit Montazah Park", "Return to Cairo"],
      "attractions": ["Pompey's Pillar", "Qaitbay Citadel", "Alexandria Library", "Montazah Park"],
      "entrance_included": ["Pompey's Pillar", "Qaitbay Citadel", "Montazah Park"],
      "photo_stops": ["Alexandria Library"],
      "meals_included": {
        "breakfast": false,
        "lunch": true,
        "dinner": true
      },
      "guide_required": true,
      "transport_type": "flight",
      "flight_info": "MS956 arriving 05:10",
      "hotel_name": null,
      "notes": null
    }
  ]
}

IMPORTANT VALIDATIONS:
- Count your days array to ensure it matches duration_days
- Every D1, D2, D3... in input must have a corresponding day object
- Days with only city code and nothing else = is_free_day: true
- Cruise days (CRZ) without activities = is_free_day: true, is_cruise_day: true`
}

// ============================================
// PROMPT FOR GENERAL REQUEST EXTRACTION
// ============================================

function buildGeneralExtractionPrompt(): string {
  return `You are an expert travel agent assistant that analyzes WhatsApp conversations and emails to extract booking information.

This appears to be a GENERAL REQUEST (not a structured day-by-day itinerary). Extract the key information to help create a custom itinerary.

=================================================================
EGYPTIAN TRAVEL ABBREVIATIONS
=================================================================

CITY CODES:
CAI = Cairo, ALX/ALY = Alexandria, ASW = Aswan, LXR = Luxor
HRG = Hurghada, SSH = Sharm El Sheikh, ABS = Abu Simbel
KOM = Kom Ombo, EDU/EDFU = Edfu, DEN = Dendera

ACCOMMODATION:
NTS/N/NT = Nights (e.g., "3NTS CAI" = 3 nights in Cairo)
CRZ = Nile Cruise (THIS IS A BOAT, NOT A HOTEL!)
BB = Bed & Breakfast, HB = Half Board, FB = Full Board, AI = All Inclusive

NILE CRUISE DETECTION & PACKAGE TYPE (CRITICAL!):
When you see ANY of these, it's a Nile Cruise:
- "CRZ" or "cruise" = Nile Cruise
- "4 night cruise" / "3 night cruise" = Nile Cruise
- "cruise from Luxor/Aswan" = Nile Cruise
- Itinerary with Luxor + Kom Ombo + Edfu + Aswan = Classic Nile Cruise route

PACKAGE TYPE:
- "cruise-package" = ONLY cruise (no hotels)
- "cruise-land" = Cruise + Hotels (e.g., Cairo + Cruise)
- "land-package" = Hotels + Tours (no cruise)
- "tours-only" = Tours only, client has own hotel

AIRLINE CODES:
MS = EgyptAir, TK = Turkish Airlines, BA = British Airways
QR = Qatar Airways, EK = Emirates

MEALS:
L = Lunch, D = Dinner, B = Breakfast, L/R or LR = Local Restaurant

DAY MARKERS:
D1, D2, D3... = Day 1, Day 2, Day 3...

ENTRANCE MARKERS:
(INSIDE) = Entrance included, (OUTSIDE)/(from outside) = Photo stop only, no entrance

=================================================================
CRITICAL: EMAIL FORMAT DETECTION
=================================================================

If the input contains email-style headers like "From:", "Subject:", "Date:", treat this as an EMAIL:

EMAIL PARSING RULES (VERY IMPORTANT):
1. **[Sender Email: xxx]** at the start = THIS IS THE CLIENT'S EMAIL ADDRESS (from email headers). Use this directly as client_email.
2. "From: X" or "From Islam Mohamed" in the header = This is who RECEIVED the email (the travel agent), NOT the client
3. "Dear Mr. X" or "Dear X" = X is the RECIPIENT, NOT the sender
4. The CLIENT/SENDER is the person MAKING THE REQUEST:
   - Look for signatures at the END of the message
   - Look for names followed by phone numbers or company names
   - Look for patterns like "Best regards, [Name]" or "[Name] + phone"
   - Look for company names (e.g., "Green Tours", "Travel Agency", etc.)
5. The sender's email should be found in (priority order):
   - [Sender Email: xxx] tag at the top (HIGHEST PRIORITY)
   - Email signatures at the bottom
   - Reply-to addresses
   - Embedded in the message body

EXAMPLE EMAIL:
"From: Islam Mohamed
Subject: Tour request
Dear Mr. Islam, Please advise... Best regards, John Smith, ABC Tours, john@abctours.com, +1234567890"

In this example:
- client_name = "John Smith" (the person making the request at the end)
- company_name = "ABC Tours" (B2B partner)
- client_email = "john@abctours.com"
- client_phone = "+1234567890"
- "Islam Mohamed" is the RECIPIENT, not the client!

=================================================================
WHATSAPP PARSING RULES
=================================================================

For WhatsApp messages:
1. Messages labeled "Agent" = messages from OUR travel agent
2. Messages labeled "Client" = messages from the customer
3. The CLIENT is the person asking for travel services

=================================================================
OUTPUT FORMAT
=================================================================

Extract the following and return as JSON:

{
  "client_name": "Full name of the SENDER/REQUESTER (NOT the recipient)",
  "client_email": "Email address of the sender",
  "client_phone": "Phone number of the sender",
  "company_name": "Company/agency name if B2B request",
  "nationality": "Nationality of travelers if mentioned",

  "trip_name": "Descriptive trip name",
  "tour_requested": "What they're asking for",
  "tour_name": "Tour name",
  "tour_type": "classic_tour|nile_cruise|beach_holiday|combined - USE 'nile_cruise' if cruise/CRZ mentioned!",
  "package_type": "cruise-package|cruise-land|land-package|tours-only - USE 'cruise-package' for cruise only, 'cruise-land' for cruise+hotels, 'land-package' for hotels+tours",
  "start_date": "YYYY-MM-DD format",
  "end_date": "YYYY-MM-DD format if mentioned",
  "duration_days": "number - IMPORTANT: If NIGHTS are mentioned (e.g. '4 night cruise'), duration_days = nights + 1 (so '4 night' = 5 days). If DAYS are mentioned, use as-is.",
  "num_adults": number,
  "num_children": number,

  "language": "Preferred guide language - set if explicitly requested in the conversation (e.g. 'we need a Spanish guide' or 'Japanese speaking guide'). If not explicitly stated, leave as empty string and the system will infer from nationality.",
  "interests": ["places they want to visit", "activities"],
  "cities": ["cities mentioned"],
  "special_requests": ["any special requests"],
  "budget_level": "budget|standard|deluxe|luxury",
  "meal_plan": "RO|BB|HB|FB|AI - if mentioned",

  "hotel_name": "Hotel if mentioned (NOT for cruise itineraries)",
  "hotel_location": "Location if mentioned",

  "conversation_language": "Language of the conversation",
  "confidence_score": 0.0 to 1.0
}

EXTRACTION RULES:
1. EMAIL: Search for pattern xxx@xxx.xxx in signatures and body
2. PHONE: Look for phone numbers at end of messages, signatures, or after names
3. For signatures, look for: name, company, email, phone (in that order)
4. If "Dear Mr/Mrs X" appears, X is NOT the client - look elsewhere for client name
5. Use empty string "" for missing text
6. Use 0 for missing numbers
7. Use [] for missing arrays
8. Default num_adults to 2 if not specified
9. Default duration_days to 1 if not clear
10. ALWAYS prioritize sender info from message body/signature over email headers`
}