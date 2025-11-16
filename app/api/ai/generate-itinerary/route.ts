import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/app/supabase'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Simple pricing calculator for WhatsApp parser
function calculateSimplePricing(params: {
  num_adults: number
  num_children: number
  duration_days: number
  city: string
  language: string
}) {
  const totalPax = params.num_adults + params.num_children
  
  // Base rates per person per day
  const vehiclePerDay = totalPax <= 3 ? 30 : totalPax <= 8 ? 50 : 80
  const guidePerDay = 40
  const entrancePerPerson = 15
  const lunchPerPerson = 10
  const waterPerPerson = 2
  const tipsPerDay = 10
  
  const totalPerDay = vehiclePerDay + guidePerDay + tipsPerDay + 
    (entrancePerPerson + lunchPerPerson + waterPerPerson) * totalPax
  
  const totalCost = totalPerDay * params.duration_days
  const perPersonCost = totalCost / totalPax
  
  return {
    success: true,
    pricing: {
      total_price: totalCost,
      price_per_person: perPersonCost,
      vehicle: {
        selected: {
          type: totalPax <= 3 ? 'Sedan' : totalPax <= 8 ? 'Minivan' : 'Bus',
          capacity: totalPax <= 3 ? '1-3 pax' : totalPax <= 8 ? '4-8 pax' : '9+ pax',
          service_code: 'TRANS-001'
        }
      },
      breakdown: {
        group_costs: {
          vehicle: vehiclePerDay * params.duration_days,
          guide: guidePerDay * params.duration_days,
          tips: tipsPerDay * params.duration_days
        },
        per_person_costs: {
          entrance_fees: entrancePerPerson * params.duration_days,
          lunch: lunchPerPerson * params.duration_days,
          water: waterPerPerson * params.duration_days
        }
      }
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      client_name,
      client_email,
      client_phone,
      tour_requested,
      start_date,
      duration_days,
      num_adults,
      num_children,
      language,
      interests,
      special_requests,
      budget_level,
      hotel_name,
      hotel_location,
      city = 'Cairo',
      transportation_service = 'day_tour',
      client_id = null  // ← ADDED: Accept client_id from WhatsApp parser
    } = body

    console.log('🤖 Starting AI itinerary generation for:', client_name)

    const startDate = new Date(start_date)
    const endDate = new Date(startDate)
    endDate.setDate(startDate.getDate() + duration_days - 1)

    const year = new Date().getFullYear()
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const itinerary_code = `EGYPT-${year}-${randomNum}`

    console.log('📝 Generated itinerary code:', itinerary_code)

    // ============================================
    // STEP 1: CALCULATE PRICING (Using simple calculator)
    // ============================================
    console.log('💰 Calculating pricing...')
    
    const pricingData = calculateSimplePricing({
      num_adults,
      num_children,
      duration_days,
      city,
      language: language || 'English'
    })

    console.log('✅ Pricing calculated:', {
      per_person: pricingData.pricing.price_per_person,
      total: pricingData.pricing.total_price,
      vehicle: pricingData.pricing.vehicle.selected.type
    })

    // ============================================
    // STEP 2: GENERATE ITINERARY CONTENT WITH AI
    // ============================================
    const prompt = `You are an expert Egypt travel planner. Create a detailed ${duration_days}-day itinerary for a client.

CLIENT DETAILS:
- Name: ${client_name}
- Tour requested: ${tour_requested}
- Start date: ${start_date}
- Duration: ${duration_days} days
- Travelers: ${num_adults} adults${num_children > 0 ? `, ${num_children} children` : ''}
- Language: ${language}
- City: ${city}
- Vehicle: ${pricingData.pricing.vehicle.selected.type}
${hotel_name ? `- Hotel: ${hotel_name} in ${hotel_location}` : ''}
${special_requests.length > 0 ? `- Special requests: ${special_requests.join(', ')}` : ''}

Create a day-by-day itinerary with realistic activities. Return JSON in this EXACT format:

{
  "trip_name": "descriptive trip name",
  "days": [
    {
      "day_number": 1,
      "title": "Day 1: Title",
      "description": "Detailed description of the day's activities and sites to visit"
    }
  ]
}

IMPORTANT: 
- Return ONLY the JSON object with trip_name and days
- Do NOT include services or pricing in the JSON
- Focus on creating engaging day descriptions and activities`

    console.log('🤖 Generating itinerary content with OpenAI...')

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert Egypt travel planner. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })

    console.log('✅ Received itinerary content from OpenAI')

    const responseText = completion.choices[0].message.content || '{}'
    let cleanedResponse = responseText.trim()
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```\n?/g, '')
    }

    const itineraryData = JSON.parse(cleanedResponse)

    console.log('📊 Parsed itinerary data:', {
      trip_name: itineraryData.trip_name,
      days_count: itineraryData.days.length
    })

    const supabase = createClient()

    const total_cost = pricingData.pricing.total_price

    console.log('💰 Total cost:', total_cost)

    // ============================================
    // STEP 3: INSERT ITINERARY
    // ============================================
    const { data: itinerary, error: itineraryError } = await supabase
      .from('itineraries')
      .insert({
        itinerary_code,
        client_name,
        client_email: client_email || null,
        client_phone: client_phone || null,
        trip_name: itineraryData.trip_name,
        start_date: start_date,
        end_date: endDate.toISOString().split('T')[0],
        total_days: duration_days,
        num_adults,
        num_children,
        currency: 'EUR',
        total_cost,
        status: 'draft',
        notes: special_requests.length > 0 ? special_requests.join('; ') : null,
        user_id: null,
        client_id: client_id  // ← ADDED: Link to client if provided
      })
      .select()
      .single()

    if (itineraryError) {
      console.error('❌ Error inserting itinerary:', itineraryError)
      throw new Error(`Failed to create itinerary: ${itineraryError.message}`)
    }

    console.log('✅ Created itinerary:', itinerary.id)

    // ============================================
    // STEP 4: INSERT DAYS WITH ACCURATE SERVICES
    // ============================================
    const breakdown = pricingData.pricing.breakdown
    const vehicle = pricingData.pricing.vehicle.selected

    // Calculate daily costs
    const vehicle_per_day = breakdown.group_costs.vehicle / duration_days
    const guide_per_day = breakdown.group_costs.guide / duration_days
    const tips_per_day = breakdown.group_costs.tips / duration_days
    const entrance_per_person = breakdown.per_person_costs.entrance_fees / duration_days
    const lunch_per_person = breakdown.per_person_costs.lunch / duration_days
    const water_per_person = breakdown.per_person_costs.water / duration_days

    for (const dayData of itineraryData.days) {
      console.log(`📅 Creating day ${dayData.day_number}...`)

      const dayDate = new Date(startDate)
      dayDate.setDate(startDate.getDate() + dayData.day_number - 1)

      const { data: day, error: dayError } = await supabase
        .from('itinerary_days')
        .insert({
          itinerary_id: itinerary.id,
          day_number: dayData.day_number,
          date: dayDate.toISOString().split('T')[0],
          title: dayData.title,
          description: dayData.description,
          city: city,
          overnight_city: city
        })
        .select()
        .single()

      if (dayError) {
        console.error(`❌ Error inserting day ${dayData.day_number}:`, dayError)
        throw new Error(`Failed to create day: ${dayError.message}`)
      }

      console.log(`✅ Created day ${dayData.day_number}`)

      // ============================================
      // INSERT ACCURATE SERVICES FOR THIS DAY
      // ============================================
      const services = [
        {
          service_type: 'transportation',
          service_code: vehicle.service_code,
          service_name: `${vehicle.type} Transportation`,
          quantity: 1,
          rate_eur: vehicle_per_day,
          total_cost: vehicle_per_day,
          notes: `${vehicle.type} (${vehicle.capacity})`
        },
        {
          service_type: 'guide',
          service_code: `GUIDE-${language.substring(0,2).toUpperCase()}`,
          service_name: `${language} Speaking Guide`,
          quantity: 1,
          rate_eur: guide_per_day,
          total_cost: guide_per_day,
          notes: `Professional ${language} guide`
        },
        {
          service_type: 'tips',
          service_code: 'DAILY-TIPS',
          service_name: 'Daily Tips',
          quantity: 1,
          rate_eur: tips_per_day,
          total_cost: tips_per_day,
          notes: 'Driver and guide tips'
        },
        {
          service_type: 'entrance',
          service_code: 'ENTRANCE-FEES',
          service_name: 'Entrance Fees',
          quantity: num_adults + num_children,
          rate_eur: entrance_per_person,
          total_cost: entrance_per_person * (num_adults + num_children),
          notes: 'Site entrance fees for all travelers'
        },
        {
          service_type: 'meal',
          service_code: 'LUNCH',
          service_name: 'Lunch',
          quantity: num_adults + num_children,
          rate_eur: lunch_per_person,
          total_cost: lunch_per_person * (num_adults + num_children),
          notes: 'Lunch at local restaurant'
        },
        {
          service_type: 'supplies',
          service_code: 'WATER',
          service_name: 'Water Bottles',
          quantity: num_adults + num_children,
          rate_eur: water_per_person,
          total_cost: water_per_person * (num_adults + num_children),
          notes: 'Bottled water throughout the day'
        }
      ]

      for (const serviceData of services) {
        const { error: serviceError } = await supabase
          .from('itinerary_services')
          .insert({
            itinerary_day_id: day.id,
            service_type: serviceData.service_type,
            service_code: serviceData.service_code,
            service_name: serviceData.service_name,
            quantity: serviceData.quantity,
            rate_eur: serviceData.rate_eur,
            rate_non_eur: 0,
            total_cost: serviceData.total_cost,
            notes: serviceData.notes
          })

        if (serviceError) {
          console.error('❌ Error adding service to day:', serviceError)
          throw new Error(`Failed to add service: ${serviceError.message}`)
        }
      }

      console.log(`✅ Added ${services.length} services to day ${dayData.day_number}`)
    }

    console.log('🎉 Itinerary generation completed successfully!')

    // ============================================
    // FIXED: Return both 'id' and 'itinerary_id'
    // ============================================
    return NextResponse.json({
      success: true,
      data: {
        id: itinerary.id,                      // ← FIXED: Frontend expects 'id'
        itinerary_id: itinerary.id,            // ← Keep for backward compatibility
        itinerary_code: itinerary.itinerary_code,
        trip_name: itinerary.trip_name,
        total_cost: itinerary.total_cost,
        total_days: itinerary.total_days,
        pricing_breakdown: pricingData.pricing.breakdown
      }
    })

  } catch (error: any) {
    console.error('❌ Error generating itinerary:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate itinerary'
      },
      { status: 500 }
    )
  }
}