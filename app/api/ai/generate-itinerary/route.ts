import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase'
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      client_name,
      client_email,
      client_phone,
      tour_requested,
      start_date,
      duration_days: raw_duration_days,
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
      include_accommodation = true,
      attractions = [],
      margin_percent = DEFAULT_MARGIN_PERCENT
    } = body

    // Validate date
    if (!isValidDate(start_date)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid start date before generating the itinerary' },
        { status: 400 }
      )
    }

    const duration_days = parseInt(raw_duration_days) || 1

    console.log('🤖 Starting AI itinerary generation for:', client_name)
    console.log(`📅 Start date: ${start_date}, Duration: ${duration_days} days`)
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

    // Calculate dates
    const startDateObj = new Date(start_date)
    const endDate = new Date(startDateObj)
    endDate.setDate(startDateObj.getDate() + duration_days - 1)

    const year = new Date().getFullYear()
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const itinerary_code = `EGYPT-${year}-${randomNum}`

    // ============================================
    // FETCH ALL AVAILABLE RATES
    // ============================================
    
    // 1. Transportation rates
    console.log('🚗 Fetching transportation rates...')
    const { data: vehicles } = await supabase
      .from('transportation_rates')
      .select('*')
      .eq('is_active', true)
      .eq('service_type', 'day_tour')
      .eq('city', city)
      .order('capacity_min')

    let selectedVehicle = null
    if (vehicles && vehicles.length > 0) {
      selectedVehicle = vehicles.find(v => 
        totalPax >= toNumber(v.capacity_min, 1) && 
        totalPax <= toNumber(v.capacity_max, 99)
      ) || vehicles[vehicles.length - 1]
      console.log(`✅ Selected vehicle: ${selectedVehicle.vehicle_type} @ €${selectedVehicle.base_rate_eur}/day`)
    }

    // 2. Guide rates
    console.log('🎯 Fetching guide rates...')
    const { data: guides } = await supabase
      .from('guide_rates')
      .select('*')
      .eq('is_active', true)
      .eq('guide_language', language)
      .limit(1)

    let selectedGuide = null
    if (guides && guides.length > 0) {
      selectedGuide = guides[0]
      console.log(`✅ Selected guide: ${language} @ €${selectedGuide.base_rate_eur}/day`)
    }

    // 3. ALL entrance fees (we'll match per day later)
    console.log('🏛️ Fetching all entrance fees...')
    const { data: allEntranceFees } = await supabase
      .from('entrance_fees')
      .select('*')
      .eq('is_active', true)

    console.log(`✅ Loaded ${allEntranceFees?.length || 0} entrance fees`)

    // 4. Meal rates
    console.log('🍽️ Fetching meal rates...')
    const { data: mealRates } = await supabase
      .from('meal_rates')
      .select('*')
      .eq('is_active', true)
      .limit(1)

    let lunchRate = 12 // Default
    let dinnerRate = 18 // Default
    if (mealRates && mealRates.length > 0) {
      lunchRate = toNumber(mealRates[0].lunch_rate_eur, 12)
      dinnerRate = toNumber(mealRates[0].dinner_rate_eur, 18)
    }

    // 5. Accommodation rates
    console.log('🏨 Fetching accommodation rates...')
    let hotelRate = 0
    let hotelName = hotel_name || 'Standard Hotel'
    
    if (include_accommodation) {
      const { data: hotels } = await supabase
        .from('accommodation_rates')
        .select('*')
        .eq('is_active', true)
        .limit(1)

      if (hotels && hotels.length > 0) {
        hotelRate = toNumber(hotels[0].rate_double_eur, 0)
        hotelName = hotels[0].hotel_name || hotelName
        console.log(`✅ Hotel rate: €${hotelRate}/night`)
      } else {
        // Fallback to hotel_contacts
        const { data: hotelContacts } = await supabase
          .from('hotel_contacts')
          .select('*')
          .eq('is_active', true)
          .eq('city', city)
          .limit(1)

        if (hotelContacts && hotelContacts.length > 0) {
          hotelRate = toNumber(hotelContacts[0].rate_double_eur, 80)
          hotelName = hotelContacts[0].name || hotelName
        }
      }
    }

    // 6. Tipping rates
    console.log('💰 Fetching tipping rates...')
    const { data: tippingRates } = await supabase
      .from('tipping_rates')
      .select('*')
      .eq('is_active', true)

    let dailyTips = 15 // Default
    if (tippingRates && tippingRates.length > 0) {
      dailyTips = tippingRates.reduce((sum, t) => {
        if (t.rate_unit === 'per_day') {
          return sum + toNumber(t.rate_eur, 0)
        }
        return sum
      }, 0)
    }

    // ============================================
    // GENERATE ITINERARY WITH AI
    // Include attractions for each day
    // ============================================
    
    const attractionNames = allEntranceFees?.map(a => a.attraction_name).join(', ') || ''

    const prompt = `You are an expert Egypt travel planner. Create a detailed ${duration_days}-day itinerary for ${city}.

CLIENT DETAILS:
- Name: ${client_name}
- Tour requested: ${tour_requested}
- Start date: ${start_date}
- Duration: ${duration_days} days
- Travelers: ${num_adults} adults${num_children > 0 ? `, ${num_children} children` : ''}
- Language: ${language}
- Budget level: ${budget_level}
${hotel_name ? `- Hotel: ${hotel_name}` : ''}
${interests.length > 0 ? `- Interests: ${interests.join(', ')}` : ''}
${special_requests.length > 0 ? `- Special requests: ${special_requests.join(', ')}` : ''}

AVAILABLE ATTRACTIONS IN DATABASE (use exact names for matching):
${attractionNames}

Create a day-by-day itinerary. For each day, specify EXACTLY which attractions will be visited.

Return JSON in this EXACT format:
{
  "trip_name": "descriptive trip name",
  "days": [
    {
      "day_number": 1,
      "title": "Day 1: Title describing main activities",
      "description": "Detailed description of the day's activities",
      "attractions": ["Exact Attraction Name 1", "Exact Attraction Name 2"],
      "city": "${city}",
      "includes_hotel": true
    }
  ]
}

IMPORTANT: 
- The "attractions" array must contain EXACT names from the available attractions list above
- Set "includes_hotel" to true for all nights except the last day
- Spread attractions logically across days (don't visit everything on day 1)
- Include 2-4 attractions per day maximum for a realistic pace`

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

    console.log('📊 Parsed itinerary:', {
      trip_name: itineraryData.trip_name,
      days_count: itineraryData.days?.length || 0
    })

    // ============================================
    // INSERT ITINERARY
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
        total_cost: 0, // Will update after calculating
        total_revenue: 0,
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

    // ============================================
    // INSERT DAYS WITH SERVICES
    // ============================================
    
    const marginMultiplier = 1 + (margin_percent / 100)
    const withMargin = (cost: number) => Math.round(cost * marginMultiplier * 100) / 100
    
    let totalSupplierCost = 0
    let totalClientPrice = 0

    // Per-day fixed costs
    const vehiclePerDay = selectedVehicle ? toNumber(selectedVehicle.base_rate_eur, 0) : 50
    const guidePerDay = selectedGuide ? toNumber(selectedGuide.base_rate_eur, 0) : 55
    const waterPerPersonPerDay = 2
    const roomsNeeded = Math.ceil(totalPax / 2)

    for (const dayData of itineraryData.days) {
      console.log(`📅 Creating day ${dayData.day_number}...`)

      const dayDate = new Date(startDateObj)
      dayDate.setDate(startDateObj.getDate() + dayData.day_number - 1)

      const { data: day, error: dayError } = await supabase
        .from('itinerary_days')
        .insert({
          itinerary_id: itinerary.id,
          day_number: dayData.day_number,
          date: dayDate.toISOString().split('T')[0],
          title: dayData.title,
          description: dayData.description,
          city: dayData.city || city,
          overnight_city: dayData.city || city
        })
        .select()
        .single()

      if (dayError) {
        console.error(`❌ Error inserting day ${dayData.day_number}:`, dayError)
        throw new Error(`Failed to create day: ${dayError.message}`)
      }

      const services = []

      // ============================================
      // 1. TRANSPORTATION (per day)
      // ============================================
      const vehicleCost = toNumber(vehiclePerDay, 0)
      services.push({
        service_type: 'transportation',
        service_code: selectedVehicle?.service_code || 'TRANS-001',
        service_name: `${selectedVehicle?.vehicle_type || 'Vehicle'} Transportation`,
        quantity: 1,
        rate_eur: vehicleCost,
        rate_non_eur: vehicleCost,
        total_cost: vehicleCost,
        client_price: withMargin(vehicleCost),
        notes: `${selectedVehicle?.vehicle_type || 'Vehicle'} from ${city}`
      })
      totalSupplierCost += vehicleCost
      totalClientPrice += withMargin(vehicleCost)

      // ============================================
      // 2. GUIDE (per day)
      // ============================================
      const guideCost = toNumber(guidePerDay, 0)
      services.push({
        service_type: 'guide',
        service_code: selectedGuide?.service_code || `GUIDE-${language.substring(0,2).toUpperCase()}`,
        service_name: `${language} Speaking Guide`,
        quantity: 1,
        rate_eur: guideCost,
        rate_non_eur: guideCost,
        total_cost: guideCost,
        client_price: withMargin(guideCost),
        notes: `Professional ${language} speaking guide`
      })
      totalSupplierCost += guideCost
      totalClientPrice += withMargin(guideCost)

      // ============================================
      // 3. TIPS (per day - no margin)
      // ============================================
      const tipsCost = toNumber(dailyTips, 15)
      services.push({
        service_type: 'tips',
        service_code: 'DAILY-TIPS',
        service_name: 'Daily Tips',
        quantity: 1,
        rate_eur: tipsCost,
        rate_non_eur: tipsCost,
        total_cost: tipsCost,
        client_price: tipsCost, // No margin on tips
        notes: 'Driver and guide tips'
      })
      totalSupplierCost += tipsCost
      totalClientPrice += tipsCost

      // ============================================
      // 4. ENTRANCE FEES (per day - SPECIFIC to this day's attractions!)
      // ============================================
      const dayAttractions = dayData.attractions || []
      let dayEntranceTotal = 0
      const matchedAttractions: string[] = []

      if (dayAttractions.length > 0 && allEntranceFees) {
        for (const attractionName of dayAttractions) {
          // Find matching entrance fee (case-insensitive partial match)
          const entranceFee = allEntranceFees.find(ef => 
            ef.attraction_name.toLowerCase().includes(attractionName.toLowerCase()) ||
            attractionName.toLowerCase().includes(ef.attraction_name.toLowerCase())
          )

          if (entranceFee) {
            const feePerPerson = isEuroPassport 
              ? toNumber(entranceFee.eur_rate, 0)
              : toNumber(entranceFee.non_eur_rate, entranceFee.eur_rate || 0)
            
            dayEntranceTotal += feePerPerson * totalPax
            matchedAttractions.push(entranceFee.attraction_name)
            console.log(`   🎫 ${entranceFee.attraction_name}: €${feePerPerson} x ${totalPax} = €${feePerPerson * totalPax}`)
          }
        }
      }

      if (dayEntranceTotal > 0) {
        services.push({
          service_type: 'entrance',
          service_code: 'ENTRANCE-FEES',
          service_name: `Entrance Fees (${isEuroPassport ? 'EUR' : 'non-EUR'} rates)`,
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

      // ============================================
      // 5. LUNCH (per day)
      // ============================================
      if (include_lunch) {
        const lunchCost = toNumber(lunchRate, 12) * totalPax
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

      // ============================================
      // 6. DINNER (per day if included)
      // ============================================
      if (include_dinner) {
        const dinnerCost = toNumber(dinnerRate, 18) * totalPax
        services.push({
          service_type: 'meal',
          service_code: 'DINNER',
          service_name: 'Dinner',
          quantity: totalPax,
          rate_eur: dinnerRate,
          rate_non_eur: dinnerRate,
          total_cost: dinnerCost,
          client_price: withMargin(dinnerCost),
          notes: 'Dinner at restaurant'
        })
        totalSupplierCost += dinnerCost
        totalClientPrice += withMargin(dinnerCost)
      }

      // ============================================
      // 7. WATER (per day - no margin)
      // ============================================
      const waterCost = waterPerPersonPerDay * totalPax
      services.push({
        service_type: 'supplies',
        service_code: 'WATER',
        service_name: 'Water Bottles',
        quantity: totalPax,
        rate_eur: waterPerPersonPerDay,
        rate_non_eur: waterPerPersonPerDay,
        total_cost: waterCost,
        client_price: waterCost, // No margin on water
        notes: 'Bottled water throughout the day'
      })
      totalSupplierCost += waterCost
      totalClientPrice += waterCost

      // ============================================
      // 8. HOTEL (per night - NOT on the last day)
      // ============================================
      const isLastDay = dayData.day_number === duration_days
      const includesHotel = dayData.includes_hotel !== false && !isLastDay && include_accommodation

      if (includesHotel && hotelRate > 0) {
        const hotelCost = hotelRate * roomsNeeded
        services.push({
          service_type: 'accommodation',
          service_code: 'HOTEL',
          service_name: `${hotelName} (${roomsNeeded} room${roomsNeeded > 1 ? 's' : ''})`,
          quantity: roomsNeeded,
          rate_eur: hotelRate,
          rate_non_eur: hotelRate,
          total_cost: hotelCost,
          client_price: withMargin(hotelCost),
          notes: `Overnight at ${hotelName}`
        })
        totalSupplierCost += hotelCost
        totalClientPrice += withMargin(hotelCost)
        console.log(`   🏨 Hotel: €${hotelRate} x ${roomsNeeded} rooms = €${hotelCost}`)
      }

      // ============================================
      // INSERT ALL SERVICES FOR THIS DAY
      // ============================================
      for (const serviceData of services) {
        const { error: serviceError } = await supabase
          .from('itinerary_services')
          .insert({
            itinerary_day_id: day.id,
            service_type: serviceData.service_type,
            service_code: serviceData.service_code,
            service_name: serviceData.service_name,
            quantity: serviceData.quantity,
            rate_eur: toNumber(serviceData.rate_eur, 0),
            rate_non_eur: toNumber(serviceData.rate_non_eur, 0),
            total_cost: toNumber(serviceData.total_cost, 0),
            client_price: toNumber(serviceData.client_price, 0),
            notes: serviceData.notes
          })

        if (serviceError) {
          console.error('❌ Error adding service:', serviceError)
        }
      }

      console.log(`✅ Added ${services.length} services to day ${dayData.day_number}`)
    }

    // ============================================
    // UPDATE ITINERARY TOTALS
    // ============================================
    const { error: updateError } = await supabase
      .from('itineraries')
      .update({
        total_cost: totalClientPrice,
        total_revenue: totalClientPrice
      })
      .eq('id', itinerary.id)

    if (updateError) {
      console.error('❌ Error updating totals:', updateError)
    }

    console.log('🎉 Itinerary generation completed!')
    console.log(`💰 Total Supplier Cost: €${totalSupplierCost.toFixed(2)}`)
    console.log(`💰 Total Client Price: €${totalClientPrice.toFixed(2)}`)
    console.log(`💰 Margin: €${(totalClientPrice - totalSupplierCost).toFixed(2)}`)

    return NextResponse.json({
      success: true,
      data: {
        id: itinerary.id,
        itinerary_id: itinerary.id,
        itinerary_code: itinerary.itinerary_code,
        trip_name: itineraryData.trip_name,
        supplier_cost: totalSupplierCost,
        total_cost: totalClientPrice,
        total_revenue: totalClientPrice,
        margin: totalClientPrice - totalSupplierCost,
        margin_percent: margin_percent,
        per_person_cost: Math.round(totalClientPrice / totalPax * 100) / 100,
        total_days: duration_days,
        passport_type: isEuroPassport ? 'EUR' : 'non-EUR'
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