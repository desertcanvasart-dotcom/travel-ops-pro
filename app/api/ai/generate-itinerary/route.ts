import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/app/supabase'
import { 
  calculatePricingFromRates, 
  getFallbackRates,
  PricingCalculation 
} from '@/lib/rate-lookup-service'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Default margin percentage
const DEFAULT_MARGIN_PERCENT = 25

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
      language = 'English',
      interests = [],
      special_requests = [],
      budget_level = 'standard',
      hotel_name,
      hotel_location,
      city = 'Cairo',
      transportation_service = 'day_tour',
      client_id = null,
      nationality = null,
      is_euro_passport = null,
      include_lunch = true,
      include_dinner = false,
      include_accommodation = false,
      attractions = [],
      margin_percent = DEFAULT_MARGIN_PERCENT
    } = body

    console.log('🤖 Starting AI itinerary generation for:', client_name)
    console.log(`💰 Margin: ${margin_percent}%`)

    const supabase = createClient()
    const totalPax = num_adults + num_children

    // Determine EUR vs non-EUR passport
    let isEuroPassport = is_euro_passport
    if (isEuroPassport === null && nationality) {
      const euCountries = [
        'austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech', 'denmark',
        'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland',
        'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands',
        'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden',
        'norway', 'iceland', 'liechtenstein', 'switzerland'
      ]
      isEuroPassport = euCountries.some(c => 
        nationality.toLowerCase().includes(c)
      )
    }
    if (isEuroPassport === null) {
      isEuroPassport = false
    }

    console.log(`🌍 Passport type: ${isEuroPassport ? 'EUR' : 'non-EUR'} (nationality: ${nationality || 'unknown'})`)

    const startDate = new Date(start_date)
    const endDate = new Date(startDate)
    endDate.setDate(startDate.getDate() + duration_days - 1)

    const year = new Date().getFullYear()
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const itinerary_code = `EGYPT-${year}-${randomNum}`

    console.log('📝 Generated itinerary code:', itinerary_code)

    // Calculate pricing from real rates
    console.log('💰 Looking up rates from database...')
    
    let pricingData: PricingCalculation

    try {
      pricingData = await calculatePricingFromRates(supabase, {
        city,
        pax: totalPax,
        language,
        is_euro_passport: isEuroPassport,
        duration_days,
        num_adults,
        num_children,
        include_lunch,
        include_dinner,
        include_accommodation,
        hotel_standard: budget_level as 'budget' | 'standard' | 'luxury',
        attractions: attractions.length > 0 ? attractions : undefined,
        include_tips: true,
        include_water: true
      })

      if (!pricingData.success || pricingData.total_cost === 0) {
        console.log('⚠️ No rates found in database, using fallback rates')
        pricingData = getFallbackRates({
          pax: totalPax,
          duration_days,
          language,
          is_euro_passport: isEuroPassport
        })
      }
    } catch (rateError) {
      console.error('⚠️ Rate lookup failed, using fallback:', rateError)
      pricingData = getFallbackRates({
        pax: totalPax,
        duration_days,
        language,
        is_euro_passport: isEuroPassport
      })
    }

    // Calculate margin
    const marginMultiplier = 1 + (margin_percent / 100)
    const total_cost = pricingData.total_cost
    const total_revenue = Math.round(total_cost * marginMultiplier * 100) / 100
    const total_margin = total_revenue - total_cost

    console.log('✅ Pricing calculated:', {
      cost: total_cost,
      revenue: total_revenue,
      margin: total_margin,
      margin_percent: margin_percent,
      vehicle: pricingData.breakdown.transportation.vehicle_type,
      passport_type: isEuroPassport ? 'EUR' : 'non-EUR',
      source: pricingData.rates_used.success ? 'DATABASE' : 'FALLBACK'
    })

    // Generate itinerary content with AI
    const attractionsList = pricingData.rates_used.attractions.length > 0
      ? pricingData.rates_used.attractions.map(a => a.name).join(', ')
      : tour_requested

    const prompt = `You are an expert Egypt travel planner. Create a detailed ${duration_days}-day itinerary for a client.

CLIENT DETAILS:
- Name: ${client_name}
- Tour requested: ${tour_requested}
- Start date: ${start_date}
- Duration: ${duration_days} days
- Travelers: ${num_adults} adults${num_children > 0 ? `, ${num_children} children` : ''}
- Language: ${language}
- City: ${city}
- Vehicle: ${pricingData.breakdown.transportation.vehicle_type}
- Budget level: ${budget_level}
${attractionsList ? `- Sites to visit: ${attractionsList}` : ''}
${hotel_name ? `- Hotel: ${hotel_name} in ${hotel_location}` : ''}
${interests.length > 0 ? `- Interests: ${interests.join(', ')}` : ''}
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
- Focus on creating engaging day descriptions and activities
- Include specific site names and realistic timing`

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

    // Insert itinerary
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
        total_cost: total_revenue,
        total_revenue: total_revenue,
        margin_percent: margin_percent,
        status: 'draft',
        notes: special_requests.length > 0 ? special_requests.join('; ') : null,
        user_id: null,
        client_id: client_id
      })
      .select()
      .single()

    if (itineraryError) {
      console.error('❌ Error inserting itinerary:', itineraryError)
      throw new Error(`Failed to create itinerary: ${itineraryError.message}`)
    }

    console.log('✅ Created itinerary:', itinerary.id)

    // Insert days with services
    const breakdown = pricingData.breakdown
    const ratesUsed = pricingData.rates_used

    const vehicle_per_day = breakdown.transportation.per_day
    const guide_per_day = breakdown.guide.per_day
    const tips_per_day = breakdown.tips.per_day
    const entrance_per_person_per_day = breakdown.entrances.per_person / duration_days
    const lunch_per_person_per_day = breakdown.meals.per_person_lunch / duration_days
    const water_per_person_per_day = breakdown.water.per_person / duration_days

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

      const services = []
      const withMargin = (cost: number) => Math.round(cost * marginMultiplier * 100) / 100

      // Transportation
      const vehicleCost = vehicle_per_day
      services.push({
        service_type: 'transportation',
        service_code: ratesUsed.vehicle?.id || 'TRANS-001',
        service_name: `${breakdown.transportation.vehicle_type} Transportation`,
        quantity: 1,
        rate_eur: vehicleCost,
        rate_non_eur: vehicleCost,
        total_cost: vehicleCost,
        client_price: withMargin(vehicleCost),
        notes: `${breakdown.transportation.vehicle_type} from ${city}`,
        resource_id: ratesUsed.vehicle?.id || null
      })

      // Guide
      const guideCost = guide_per_day
      services.push({
        service_type: 'guide',
        service_code: ratesUsed.guide?.id || `GUIDE-${language.substring(0,2).toUpperCase()}`,
        service_name: `${language} Speaking Guide`,
        quantity: 1,
        rate_eur: guideCost,
        rate_non_eur: guideCost,
        total_cost: guideCost,
        client_price: withMargin(guideCost),
        notes: ratesUsed.guide?.name || `Professional ${language} guide`,
        resource_id: ratesUsed.guide?.id || null
      })

      // Tips (no margin)
      const tipsCost = tips_per_day
      services.push({
        service_type: 'tips',
        service_code: 'DAILY-TIPS',
        service_name: 'Daily Tips',
        quantity: 1,
        rate_eur: tipsCost,
        rate_non_eur: tipsCost,
        total_cost: tipsCost,
        client_price: tipsCost,
        notes: 'Driver and guide tips'
      })

      // Entrance Fees
      const entranceCostPerPerson = entrance_per_person_per_day
      const entranceTotalCost = entranceCostPerPerson * totalPax
      services.push({
        service_type: 'entrance',
        service_code: 'ENTRANCE-FEES',
        service_name: `Entrance Fees (${isEuroPassport ? 'EUR' : 'non-EUR'} rates)`,
        quantity: totalPax,
        rate_eur: entranceCostPerPerson,
        rate_non_eur: entranceCostPerPerson,
        total_cost: entranceTotalCost,
        client_price: withMargin(entranceTotalCost),
        notes: ratesUsed.attractions.length > 0 
          ? `Sites: ${ratesUsed.attractions.map(a => a.name).join(', ')}`
          : 'Site entrance fees for all travelers'
      })

      // Lunch
      if (include_lunch && lunch_per_person_per_day > 0) {
        const lunchCostPerPerson = lunch_per_person_per_day
        const lunchTotalCost = lunchCostPerPerson * totalPax
        services.push({
          service_type: 'meal',
          service_code: ratesUsed.restaurant?.id || 'LUNCH',
          service_name: 'Lunch',
          quantity: totalPax,
          rate_eur: lunchCostPerPerson,
          rate_non_eur: lunchCostPerPerson,
          total_cost: lunchTotalCost,
          client_price: withMargin(lunchTotalCost),
          notes: ratesUsed.restaurant?.name || 'Lunch at local restaurant',
          resource_id: ratesUsed.restaurant?.id || null
        })
      }

      // Water (no margin)
      const waterCostPerPerson = water_per_person_per_day
      const waterTotalCost = waterCostPerPerson * totalPax
      services.push({
        service_type: 'supplies',
        service_code: 'WATER',
        service_name: 'Water Bottles',
        quantity: totalPax,
        rate_eur: waterCostPerPerson,
        rate_non_eur: waterCostPerPerson,
        total_cost: waterTotalCost,
        client_price: waterTotalCost,
        notes: 'Bottled water throughout the day'
      })

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
            rate_non_eur: serviceData.rate_non_eur || 0,
            total_cost: serviceData.total_cost,
            client_price: serviceData.client_price,
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

    return NextResponse.json({
      success: true,
      data: {
        id: itinerary.id,
        itinerary_id: itinerary.id,
        itinerary_code: itinerary.itinerary_code,
        trip_name: itinerary.trip_name,
        supplier_cost: total_cost,
        total_cost: total_revenue,
        total_revenue: total_revenue,
        margin: total_margin,
        margin_percent: margin_percent,
        per_person_cost: Math.round(total_revenue / totalPax * 100) / 100,
        total_days: itinerary.total_days,
        passport_type: isEuroPassport ? 'EUR' : 'non-EUR',
        pricing_source: pricingData.rates_used.success ? 'database' : 'fallback',
        pricing_breakdown: {
          transportation: {
            ...breakdown.transportation,
            client_price: Math.round(breakdown.transportation.total * marginMultiplier * 100) / 100
          },
          guide: {
            ...breakdown.guide,
            client_price: Math.round(breakdown.guide.total * marginMultiplier * 100) / 100
          },
          entrances: {
            ...breakdown.entrances,
            client_price: Math.round(breakdown.entrances.total * marginMultiplier * 100) / 100
          },
          meals: {
            ...breakdown.meals,
            client_price: Math.round((breakdown.meals.lunch_total + breakdown.meals.dinner_total) * marginMultiplier * 100) / 100
          },
          tips: breakdown.tips,
          water: breakdown.water
        },
        rates_used: {
          vehicle: ratesUsed.vehicle ? {
            type: ratesUsed.vehicle.vehicle_type,
            rate: ratesUsed.vehicle.rate_per_day
          } : null,
          guide: ratesUsed.guide ? {
            name: ratesUsed.guide.name,
            rate: ratesUsed.guide.daily_rate_eur
          } : null,
          attractions: ratesUsed.attractions.map(a => ({
            name: a.name,
            fee_eur: a.entrance_fee_eur,
            fee_non_eur: a.entrance_fee_non_eur
          })),
          restaurant: ratesUsed.restaurant ? {
            name: ratesUsed.restaurant.name,
            lunch_rate: ratesUsed.restaurant.lunch_rate_eur
          } : null
        }
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
