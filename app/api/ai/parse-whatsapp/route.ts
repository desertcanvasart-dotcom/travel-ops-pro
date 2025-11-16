import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(request: Request) {
  try {
    const { conversation } = await request.json()

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'No conversation provided' },
        { status: 400 }
      )
    }

    // Call OpenAI to analyze the conversation
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert travel agent assistant that analyzes WhatsApp conversations between sales agents and clients to extract booking information.

Extract the following information from the conversation and return it as JSON:

{
  "client_name": "Full name of the client",
  "client_email": "Email address",
  "client_phone": "Phone number if mentioned",
  "trip_name": "A descriptive name for the trip",
  "tour_requested": "Specific tour or itinerary requested",
  "start_date": "Trip start date in YYYY-MM-DD format",
  "duration_days": number of days (integer),
  "num_adults": number of adult travelers (integer),
  "num_children": number of children (integer),
  "language": "Preferred guide language (Spanish, English, French, Italian, German)",
  "interests": ["Array", "of", "places", "or", "activities", "mentioned"],
  "special_requests": ["Array", "of", "special", "requests"],
  "budget_level": "budget|moderate|luxury",
  "hotel_name": "Hotel name if mentioned",
  "hotel_location": "Hotel location/address if mentioned",
  "conversation_language": "Language of the conversation (Spanish, English, etc)",
  "confidence_score": 0.0 to 1.0 (how confident you are in the extraction)
}

Important rules:
- If information is not found, use empty string "" for text fields, 0 for numbers, or [] for arrays
- For dates, try to parse any date format mentioned (dd/mm/yyyy, etc.) and convert to YYYY-MM-DD
- If duration is not explicitly mentioned, infer from context (day trip = 1, etc.)
- Detect the conversation language automatically
- Be smart about inferring information from context
- If only a tour name is mentioned, use that as trip_name and tour_requested
- Budget level: budget (<€50/person/day), moderate (€50-150), luxury (>€150)
`
        },
        {
          role: "user",
          content: `Analyze this WhatsApp conversation and extract all booking information:\n\n${conversation}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    })

    const extracted = JSON.parse(completion.choices[0].message.content || '{}')

    // Validate and set defaults
    const data = {
      client_name: extracted.client_name || '',
      client_email: extracted.client_email || '',
      client_phone: extracted.client_phone || '',
      trip_name: extracted.trip_name || extracted.tour_requested || 'Egypt Tour',
      tour_requested: extracted.tour_requested || '',
      start_date: extracted.start_date || '',
      duration_days: parseInt(extracted.duration_days) || 1,
      num_adults: parseInt(extracted.num_adults) || 2,
      num_children: parseInt(extracted.num_children) || 0,
      language: extracted.language || 'English',
      interests: Array.isArray(extracted.interests) ? extracted.interests : [],
      special_requests: Array.isArray(extracted.special_requests) ? extracted.special_requests : [],
      budget_level: extracted.budget_level || 'moderate',
      hotel_name: extracted.hotel_name || '',
      hotel_location: extracted.hotel_location || '',
      conversation_language: extracted.conversation_language || 'English',
      confidence_score: parseFloat(extracted.confidence_score) || 0.8
    }

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