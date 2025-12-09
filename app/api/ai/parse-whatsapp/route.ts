import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Helper function to extract email using regex
function extractEmailFromText(text: string): string {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const matches = text.match(emailRegex)
  return matches ? matches[0] : ''
}

// Helper function to extract phone using regex
function extractPhoneFromText(text: string): string {
  // Look for phone patterns with TEL:, Phone:, etc.
  const telPatterns = [
    /TEL[：:]\s*([0-9\-\+\(\)\s]{8,20})/i,
    /Tel[：:]\s*([0-9\-\+\(\)\s]{8,20})/i,
    /Phone[：:]\s*([0-9\-\+\(\)\s]{8,20})/i,
    /携帯[：:]\s*([0-9\-\+\(\)\s]{8,20})/,
    /電話[：:]\s*([0-9\-\+\(\)\s]{8,20})/,
    /Mobile[：:]\s*([0-9\-\+\(\)\s]{8,20})/i,
  ]
  
  for (const pattern of telPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  // Fallback: look for standalone phone number patterns
  const phonePatterns = [
    /\+\d{1,3}[\s\-]?\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,4}/,  // +20 115 801 1600
    /\d{2,4}-\d{3,4}-\d{3,4}/,  // 03-6824-1199
    /\(\d{2,4}\)\s?\d{3,4}[\s\-]?\d{3,4}/,  // (03) 6824-1199
  ]
  
  for (const pattern of phonePatterns) {
    const match = text.match(pattern)
    if (match) {
      return match[0].trim()
    }
  }
  
  return ''
}

// Helper function to extract name from Japanese signature
function extractNameFromJapanese(text: string): string {
  // Look for 担当: pattern (contact person)
  const patterns = [
    /担当[：:]\s*([^\s\(（]+)/,
    /担当者[：:]\s*([^\s\(（]+)/,
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
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

    // Pre-extract email and phone using regex as fallback
    const regexEmail = extractEmailFromText(conversation)
    const regexPhone = extractPhoneFromText(conversation)
    const regexName = extractNameFromJapanese(conversation)

    // Call OpenAI to analyze the conversation
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert travel agent assistant that analyzes WhatsApp conversations and emails to extract booking information.

IMPORTANT: Carefully scan the ENTIRE message including email signatures at the bottom.

Extract the following information and return as JSON:

{
  "client_name": "Full name of the client/sender - check signature blocks for names",
  "client_email": "Email address - MUST extract if present anywhere in text",
  "client_phone": "Phone number - look for TEL:, Phone:, or number patterns",
  "company_name": "Company name if B2B inquiry",
  "trip_name": "Descriptive trip name",
  "tour_requested": "Specific tour requested",
  "start_date": "YYYY-MM-DD format",
  "end_date": "YYYY-MM-DD format if mentioned",
  "duration_days": number,
  "num_adults": number,
  "num_children": number,
  "language": "Preferred guide language",
  "nationality": "Client nationality",
  "interests": ["places", "activities"],
  "special_requests": ["requests"],
  "budget_level": "budget|moderate|luxury",
  "hotel_name": "Hotel if mentioned",
  "hotel_location": "Location if mentioned",
  "conversation_language": "Language of conversation",
  "confidence_score": 0.0 to 1.0
}

CRITICAL EXTRACTION RULES:
1. EMAIL: Search for pattern like xxx@xxx.xxx anywhere in the text
2. PHONE: Search for "TEL:", "Tel:", "Phone:", "携帯:", followed by numbers
3. For Japanese emails, the signature block often appears at the bottom with:
   - Company name
   - Address (〒xxx-xxxx)
   - 担当: Name (contact person)
   - TEL: phone
   - FAX: fax
   - Email: email
4. If you see "Email：m.yamamoto@sakuratravel.jp", extract "m.yamamoto@sakuratravel.jp"
5. If you see "TEL：03-6824-1199", extract "03-6824-1199"

Use empty string "" for missing text, 0 for missing numbers, [] for missing arrays.`
        },
        {
          role: "user",
          content: `Extract ALL information from this message. Pay special attention to contact details in signatures:\n\n${conversation}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    })

    const extracted = JSON.parse(completion.choices[0].message.content || '{}')

    // Helper to validate date
    const isValidDate = (dateStr: string): boolean => {
      if (!dateStr) return false
      const date = new Date(dateStr)
      return !isNaN(date.getTime())
    }

    // Use regex-extracted values as fallback if AI missed them
    const data = {
      client_name: extracted.client_name || regexName || '',
      client_email: extracted.client_email || regexEmail || '',
      client_phone: extracted.client_phone || regexPhone || '',
      company_name: extracted.company_name || '',
      trip_name: extracted.trip_name || extracted.tour_requested || 'Egypt Tour',
      tour_requested: extracted.tour_requested || '',
      start_date: isValidDate(extracted.start_date) ? extracted.start_date : '',
      end_date: isValidDate(extracted.end_date) ? extracted.end_date : '',
      duration_days: parseInt(extracted.duration_days) || 1,
      num_adults: parseInt(extracted.num_adults) || 2,
      num_children: parseInt(extracted.num_children) || 0,
      language: extracted.language || 'English',
      nationality: extracted.nationality || '',
      interests: Array.isArray(extracted.interests) ? extracted.interests : [],
      special_requests: Array.isArray(extracted.special_requests) ? extracted.special_requests : [],
      budget_level: extracted.budget_level || 'moderate',
      hotel_name: extracted.hotel_name || '',
      hotel_location: extracted.hotel_location || '',
      conversation_language: extracted.conversation_language || 'English',
      confidence_score: parseFloat(extracted.confidence_score) || 0.8
    }

    // Log for debugging
    console.log('Regex extracted:', { regexEmail, regexPhone, regexName })
    console.log('AI extracted:', { 
      email: extracted.client_email, 
      phone: extracted.client_phone,
      name: extracted.client_name 
    })
    console.log('Final data:', { 
      email: data.client_email, 
      phone: data.client_phone,
      name: data.client_name 
    })

    return NextResponse.json({
      success: true,
      data
    })

  } catch (error) {
    console.error('Error parsing conversation:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to analyze conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}