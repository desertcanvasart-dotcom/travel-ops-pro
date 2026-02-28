// ============================================
// FILE PARSER API
// File: app/api/ai/parse-file/route.ts
//
// Accepts PDF, image, or DOCX files (as base64),
// sends to Claude Vision to extract itinerary data,
// returns ExtractedDay[] for the generate-itinerary endpoint.
// ============================================

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createMessageWithRetry, getUserFriendlyError } from '@/lib/ai/anthropic-client'
import { PACKAGE_TYPE_SLUGS } from '@/lib/package-types'

// Allow longer execution for large PDFs
export const maxDuration = 120

// ============================================
// TYPES
// ============================================

interface FileInput {
  name: string
  type: string   // MIME type
  data: string   // base64-encoded content
  size: number   // bytes
}

interface ParseFileRequest {
  files: FileInput[]
  language?: string  // content language hint
}

// ============================================
// VALIDATION
// ============================================

const ACCEPTED_TYPES: Record<string, 'pdf' | 'image' | 'docx'> = {
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

const MAX_FILE_SIZES: Record<string, number> = {
  'application/pdf': 32 * 1024 * 1024,
  'image/png': 20 * 1024 * 1024,
  'image/jpeg': 20 * 1024 * 1024,
  'image/webp': 20 * 1024 * 1024,
  'image/gif': 20 * 1024 * 1024,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 10 * 1024 * 1024,
}

const MAX_FILES = 10
const MAX_TOTAL_SIZE = 50 * 1024 * 1024

function validateFiles(files: FileInput[]): { valid: boolean; error?: string } {
  if (!files || !Array.isArray(files) || files.length === 0) {
    return { valid: false, error: 'No files provided' }
  }
  if (files.length > MAX_FILES) {
    return { valid: false, error: `Maximum ${MAX_FILES} files allowed` }
  }

  let totalSize = 0
  for (const file of files) {
    if (!ACCEPTED_TYPES[file.type]) {
      return { valid: false, error: `Unsupported file type: ${file.name} (${file.type})` }
    }
    const maxSize = MAX_FILE_SIZES[file.type]
    if (file.size > maxSize) {
      const maxMB = Math.round(maxSize / (1024 * 1024))
      return { valid: false, error: `File "${file.name}" exceeds ${maxMB}MB limit` }
    }
    totalSize += file.size
  }

  if (totalSize > MAX_TOTAL_SIZE) {
    return { valid: false, error: 'Total file size exceeds 50MB limit' }
  }

  return { valid: true }
}

// ============================================
// EXTRACTION PROMPT
// ============================================

function buildFileExtractionPrompt(sourceType: string, languageHint?: string): string {
  const sourceDescription = sourceType === 'pdf'
    ? 'a PDF document'
    : sourceType === 'image'
      ? 'screenshot image(s)'
      : 'a document'

  return `You are an expert travel operations assistant specializing in EGYPTIAN TOURISM.

You are reading ${sourceDescription} that contains a travel itinerary.${languageHint ? ` The document may be in ${languageHint}.` : ''} Extract ALL itinerary data from it.

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
NTS / N / NT = Nights (e.g., "3NTS CAI" = 3 nights in Cairo)
CRZ = Nile Cruise (NOT a hotel!)
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
- Days mentioning Kom Ombo + Edfu + Aswan in sequence = Nile Cruise route

PACKAGE TYPE MAPPING:
- "cruise-package" = ONLY Nile Cruise (no hotels, no Cairo)
- "cruise-land" = Cruise + Hotels/Land tours (e.g., Cairo + Cruise)
- "land-package" = Hotels + Tours (no cruise)
- "full-package" = Hotels + Tours + Airport transfers
- "tours-only" = Client has own hotel, we provide tours only
- "day-trips" = Single day excursions
- "shore-excursions" = Port-based day tours

AIRLINE CODES:
MS = EgyptAir, TK = Turkish Airlines, BA = British Airways, QR = Qatar Airways
EK = Emirates, EY = Etihad, LH = Lufthansa, AF = Air France, KL = KLM
NP = Nile Air, SM = Air Cairo

MEAL PLANS:
RO = Room Only, BB = Bed & Breakfast, HB = Half Board, FB = Full Board, AI = All Inclusive

MEALS IN ITINERARY:
B = Breakfast, L = Lunch, D = Dinner

DAY MARKERS:
D1, D2, D3... = Day 1, Day 2, Day 3...

ENTRANCE MARKERS:
(INSIDE) = Entrance fee INCLUDED
(OUTSIDE) / (FROM OUTSIDE) = Photo stop only, NO entrance fee

TRANSPORT:
TRF = Transfer, A/C = Air Conditioned, DOM FLT = Domestic Flight, INT FLT = International Flight

CALCULATION:
Number of DAYS = Number of NIGHTS + 1

=================================================================
CRITICAL RULES
=================================================================

1. EXTRACT EXACTLY what is written - do NOT add or remove activities
2. If a day just shows "D5 CRZ" with nothing else = Free/Sailing day
3. Decode ALL abbreviations to full names
4. Mark attractions with (INSIDE) in entrance_included array
5. Mark attractions with (OUTSIDE) in photo_stops array
6. If flight code is mentioned (MS956@05:10), extract it
7. Count total days from NTS pattern: 2+3+3 = 8 nights = 9 days
8. OVERNIGHT CITY DETERMINATION (CRITICAL):
   - overnight_city = the city where the traveler SLEEPS that night
   - For day trips: overnight_city = the BASE CITY they return to
   - For city-to-city transfers: overnight_city = the DESTINATION city
   - For cruise days: overnight_city = the port city or "Nile Cruise"
9. Read ALL pages/images carefully - do not miss any days
10. If the document contains tables, read each row as a separate day

=================================================================
OUTPUT FORMAT
=================================================================

Return ONLY valid JSON:

{
  "trip_name": "Descriptive trip name based on itinerary",
  "package_type": "${PACKAGE_TYPE_SLUGS.join('|')}",
  "start_date": "YYYY-MM-DD format if mentioned, or null",
  "end_date": "YYYY-MM-DD format if mentioned, or null",
  "duration_days": number,
  "num_adults": number (default 2),
  "num_children": number (default 0),
  "nationality": "nationality if mentioned or empty string",
  "language": "guide language if mentioned or empty string",
  "cities": ["Cairo", "Luxor", ...],
  "budget_level": "budget|standard|deluxe|luxury",
  "hotel_name": "hotel if mentioned or null",
  "confidence_score": 0.95,

  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD or null",
      "date_display": "original date format or null",
      "title": "Day 1: Arrival in Cairo",
      "city": "Cairo",
      "cities_visited": ["Cairo"],
      "overnight_city": "Cairo",
      "is_arrival": true,
      "is_departure": false,
      "is_transfer_only": false,
      "is_free_day": false,
      "is_cruise_day": false,
      "activities": ["Arrive Cairo", "Transfer to hotel"],
      "attractions": ["Pyramids of Giza"],
      "entrance_included": ["Pyramids of Giza"],
      "photo_stops": [],
      "meals_included": {
        "breakfast": false,
        "lunch": true,
        "dinner": false
      },
      "guide_required": true,
      "transport_type": "car",
      "flight_info": null,
      "hotel_name": null,
      "notes": null
    }
  ]
}

IMPORTANT VALIDATIONS:
- Count your days array to ensure it matches duration_days
- Days with only a city and no activities = is_free_day: true
- Cruise days without activities = is_free_day: true, is_cruise_day: true`
}

// ============================================
// CONTENT BLOCK BUILDERS
// ============================================

function buildContentBlocks(
  files: FileInput[],
  extractedTexts: Map<string, string>,
  prompt: string
): Anthropic.MessageCreateParamsNonStreaming['messages'][0]['content'] {
  const blocks: any[] = []

  for (const file of files) {
    const fileCategory = ACCEPTED_TYPES[file.type]

    if (fileCategory === 'pdf') {
      blocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: file.data,
        }
      })
    } else if (fileCategory === 'image') {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: file.type,
          data: file.data,
        }
      })
    } else if (fileCategory === 'docx') {
      const text = extractedTexts.get(file.name)
      if (text) {
        blocks.push({
          type: 'text',
          text: `[Document: ${file.name}]\n\n${text}`,
        })
      }
    }
  }

  // Add the extraction prompt as the final text block
  blocks.push({
    type: 'text',
    text: prompt,
  })

  return blocks
}

// ============================================
// DOCX TEXT EXTRACTION
// ============================================

async function extractDocxText(base64Data: string): Promise<string> {
  const mammoth = await import('mammoth')
  const buffer = Buffer.from(base64Data, 'base64')
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

// ============================================
// POST HANDLER
// ============================================

export async function POST(request: Request) {
  try {
    const body: ParseFileRequest = await request.json()
    const { files, language } = body

    // Validate files
    const validation = validateFiles(files)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      )
    }

    // Determine the primary source type for prompt context
    const fileCategories = files.map(f => ACCEPTED_TYPES[f.type])
    const primaryType = fileCategories.includes('pdf') ? 'pdf'
      : fileCategories.includes('image') ? 'image'
        : 'docx'

    // Extract text from DOCX files first
    const extractedTexts = new Map<string, string>()
    for (const file of files) {
      if (ACCEPTED_TYPES[file.type] === 'docx') {
        try {
          const text = await extractDocxText(file.data)
          if (!text || text.trim().length === 0) {
            return NextResponse.json(
              { success: false, error: `Could not extract text from "${file.name}". The file may be empty or corrupted.` },
              { status: 422 }
            )
          }
          extractedTexts.set(file.name, text)
        } catch (err) {
          console.error(`DOCX extraction error for ${file.name}:`, err)
          return NextResponse.json(
            { success: false, error: `Failed to read "${file.name}". Please ensure it is a valid DOCX file.` },
            { status: 422 }
          )
        }
      }
    }

    // Get language name from code for the prompt
    const languageHint = language && language !== 'en' ? language : undefined

    // Build extraction prompt
    const prompt = buildFileExtractionPrompt(primaryType, languageHint)

    // Build content blocks for Claude
    const contentBlocks = buildContentBlocks(files, extractedTexts, prompt)

    // Call Claude
    console.log(`[parse-file] Calling Claude with ${files.length} file(s), primary type: ${primaryType}`)

    const message = await createMessageWithRetry({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: contentBlocks,
      }]
    })

    // Extract text from response
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('')

    // Parse JSON from response
    let extracted: any = {}
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      console.error('[parse-file] Failed to parse Claude response as JSON:', e)
      console.log('[parse-file] Raw response (first 500 chars):', responseText.substring(0, 500))
      return NextResponse.json({
        success: false,
        error: 'Could not extract structured itinerary data from the uploaded file. The document may not contain a recognizable itinerary format.'
      }, { status: 422 })
    }

    // Validate extracted data
    const days = extracted.days || []
    if (days.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No itinerary days could be extracted from the uploaded file. Please ensure the document contains a day-by-day itinerary.'
      }, { status: 422 })
    }

    // Normalize extracted days to match ExtractedDay interface
    const extractedDays = days.map((day: any, index: number) => ({
      day_number: day.day_number || index + 1,
      date: day.date || null,
      date_display: day.date_display || null,
      title: day.title || `Day ${index + 1}`,
      city: day.city || day.cities_visited?.[0] || null,
      overnight_city: day.overnight_city || day.city || '',
      is_arrival: day.is_arrival || false,
      is_departure: day.is_departure || false,
      is_transfer_only: day.is_transfer_only || false,
      is_free_day: day.is_free_day || false,
      is_cruise_day: day.is_cruise_day || false,
      activities: day.activities || [],
      attractions: day.attractions || [],
      entrance_included: day.entrance_included || [],
      photo_stops: day.photo_stops || [],
      meals_mentioned: [
        day.meals_included?.breakfast ? 'Breakfast' : null,
        day.meals_included?.lunch ? 'Lunch' : null,
        day.meals_included?.dinner ? 'Dinner' : null,
      ].filter(Boolean),
      guide_required: day.guide_required !== false,
      transport_type: day.transport_type || null,
      flight_info: day.flight_info || null,
      hotel_name: day.hotel_name || null,
      notes: day.notes || null,
    }))

    // Build raw itinerary text for generate-itinerary
    const rawItinerary = extractedDays.map((day: any) => {
      const parts = [`Day ${day.day_number}: ${day.title}`]
      if (day.activities?.length > 0) parts.push(`Activities: ${day.activities.join(', ')}`)
      if (day.attractions?.length > 0) parts.push(`Attractions: ${day.attractions.join(', ')}`)
      if (day.overnight_city) parts.push(`Overnight: ${day.overnight_city}`)
      return parts.join('\n')
    }).join('\n\n')

    // Also include any extracted DOCX text as supplementary raw text
    let fullRawText = rawItinerary
    for (const [, text] of extractedTexts) {
      fullRawText = text + '\n\n---\n\n' + fullRawText
    }

    return NextResponse.json({
      success: true,
      data: {
        trip_name: extracted.trip_name || 'Imported Itinerary',
        package_type: extracted.package_type || 'land-package',
        start_date: extracted.start_date || null,
        end_date: extracted.end_date || null,
        duration_days: extracted.duration_days || extractedDays.length,
        num_adults: extracted.num_adults || 2,
        num_children: extracted.num_children || 0,
        nationality: extracted.nationality || '',
        language: extracted.language || '',
        cities: extracted.cities || [...new Set(extractedDays.map((d: any) => d.city).filter(Boolean))],
        budget_level: extracted.budget_level || 'standard',
        hotel_name: extracted.hotel_name || null,
        is_structured_input: true,
        structure_confidence: extracted.confidence_score || 0.8,
        extracted_days: extractedDays,
        raw_itinerary: fullRawText,
        source_file_type: primaryType,
      }
    })
  } catch (error: any) {
    console.error('[parse-file] Error:', error)

    // Use shared error handler for Anthropic API errors
    const friendly = getUserFriendlyError(error)
    return NextResponse.json(
      { success: false, error: friendly.message },
      { status: friendly.status }
    )
  }
}
