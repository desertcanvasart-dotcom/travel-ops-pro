import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

// ============================================
// TOUR PRICING CALCULATOR
// File: app/api/tours/pricing/calculate/route.ts
// 
// Calculates tour pricing based on:
// - Tour days and activities (from tour_days, tour_day_activities)
// - Real rates from: attractions, transportation_rates, guides, 
//   restaurant_contacts, hotel_contacts
// ============================================

interface PricingBreakdown {
  pax: number
  is_euro_passport: boolean
  total_accommodation: number
  total_meals: number
  total_guides: number
  total_transportation: number
  total_entrances: number
  grand_total: number
  per_person_total: number
  details: {
    accommodation: any[]
    meals: any[]
    guides: any[]
    transportation: any[]
    entrances: any[]
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()

    const { tour_id, pax_counts = [1, 2, 3, 4, 5, 6, 7, 8], save_results = false } = body

    if (!tour_id) {
      return NextResponse.json(
        { success: false, error: 'Tour ID is required' },
        { status: 400 }
      )
    }

    // 1. Get tour days with all linked resources
    const { data: tourDays, error: daysError } = await supabase
      .from('tour_days')
      .select(`
        *,
        accommodation:hotel_contacts(id, name, city, rate_single_eur, rate_double_eur, rate_triple_eur),
        lunch_meal:restaurant_contacts!lunch_meal_id(id, name, city, lunch_rate_eur),
        dinner_meal:restaurant_contacts!dinner_meal_id(id, name, city, dinner_rate_eur),
        guide:guides(id, name, languages, daily_rate_eur),
        activities:tour_day_activities(
          *,
          entrance:attractions(id, name, city, entrance_fee_eur, entrance_fee_non_eur),
          transportation:transportation_rates(id, vehicle_type, city, rate_per_day)
        )
      `)
      .eq('tour_id', tour_id)
      .order('day_number', { ascending: true })

    if (daysError) {
      console.error('Error fetching tour days:', daysError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch tour days' },
        { status: 500 }
      )
    }

    if (!tourDays || tourDays.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No days found for this tour' },
        { status: 404 }
      )
    }

    // 2. Calculate pricing for each pax count (EUR and non-EUR)
    const allPricing: PricingBreakdown[] = []

    for (const pax of pax_counts) {
      // Calculate for EUR passport holders
      const eurPricing = calculatePricingForPax(tourDays, pax, true)
      allPricing.push(eurPricing)

      // Calculate for non-EUR passport holders
      const nonEurPricing = calculatePricingForPax(tourDays, pax, false)
      allPricing.push(nonEurPricing)
    }

    // 3. Optionally save results to tour_pricing table
    if (save_results) {
      // Delete existing pricing
      await supabase
        .from('tour_pricing')
        .delete()
        .eq('tour_id', tour_id)

      // Insert new pricing records
      const pricingRecords = allPricing.map(p => ({
        tour_id: tour_id,
        pax: p.pax,
        is_euro_passport: p.is_euro_passport,
        total_accommodation: p.total_accommodation,
        total_meals: p.total_meals,
        total_guides: p.total_guides,
        total_transportation: p.total_transportation,
        total_entrances: p.total_entrances,
        grand_total: p.grand_total,
        per_person_total: p.per_person_total,
        calculated_at: new Date().toISOString()
      }))

      await supabase
        .from('tour_pricing')
        .insert(pricingRecords)
    }

    return NextResponse.json({
      success: true,
      data: {
        tour_id: tour_id,
        days_count: tourDays.length,
        pricing: allPricing
      },
      message: save_results ? 'Pricing calculated and saved' : 'Pricing calculated'
    })

  } catch (error) {
    console.error('Error calculating pricing:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function calculatePricingForPax(
  tourDays: any[], 
  pax: number, 
  isEuroPassport: boolean
): PricingBreakdown {
  
  const details = {
    accommodation: [] as any[],
    meals: [] as any[],
    guides: [] as any[],
    transportation: [] as any[],
    entrances: [] as any[]
  }

  let totalAccommodation = 0
  let totalMeals = 0
  let totalGuides = 0
  let totalTransportation = 0
  let totalEntrances = 0

  for (const day of tourDays) {
    // ============================================
    // ACCOMMODATION
    // ============================================
    if (day.accommodation) {
      // Calculate rooms needed based on pax
      // Simple logic: 2 people per double room
      const roomsNeeded = Math.ceil(pax / 2)
      const ratePerRoom = day.accommodation.rate_double_eur || 0
      const dayAccomCost = roomsNeeded * ratePerRoom

      totalAccommodation += dayAccomCost
      details.accommodation.push({
        day: day.day_number,
        hotel: day.accommodation.name,
        rooms: roomsNeeded,
        rate_per_room: ratePerRoom,
        total: dayAccomCost
      })
    }

    // ============================================
    // MEALS - Breakfast
    // ============================================
    if (day.breakfast_included) {
      // Usually included with hotel, but if separate:
      const breakfastCost = 0 // Typically included in accommodation
      totalMeals += breakfastCost
    }

    // ============================================
    // MEALS - Lunch
    // ============================================
    if (day.lunch_meal) {
      const lunchRatePerPerson = day.lunch_meal.lunch_rate_eur || 0
      const dayLunchCost = lunchRatePerPerson * pax

      totalMeals += dayLunchCost
      details.meals.push({
        day: day.day_number,
        meal_type: 'lunch',
        restaurant: day.lunch_meal.name,
        rate_per_person: lunchRatePerPerson,
        pax: pax,
        total: dayLunchCost
      })
    }

    // ============================================
    // MEALS - Dinner
    // ============================================
    if (day.dinner_meal) {
      const dinnerRatePerPerson = day.dinner_meal.dinner_rate_eur || 0
      const dayDinnerCost = dinnerRatePerPerson * pax

      totalMeals += dayDinnerCost
      details.meals.push({
        day: day.day_number,
        meal_type: 'dinner',
        restaurant: day.dinner_meal.name,
        rate_per_person: dinnerRatePerPerson,
        pax: pax,
        total: dayDinnerCost
      })
    }

    // ============================================
    // GUIDE
    // ============================================
    if (day.guide_required && day.guide) {
      const guideDailyRate = day.guide.daily_rate_eur || 0
      
      totalGuides += guideDailyRate
      details.guides.push({
        day: day.day_number,
        guide: day.guide.name,
        daily_rate: guideDailyRate
      })
    }

    // ============================================
    // ACTIVITIES - Entrances & Transportation
    // ============================================
    if (day.activities && day.activities.length > 0) {
      for (const activity of day.activities) {
        
        // ENTRANCE FEES
        if (activity.entrance) {
          const entranceFee = isEuroPassport 
            ? (activity.entrance.entrance_fee_eur || 0)
            : (activity.entrance.entrance_fee_non_eur || 0)
          
          const activityEntranceCost = entranceFee * pax

          totalEntrances += activityEntranceCost
          details.entrances.push({
            day: day.day_number,
            attraction: activity.entrance.name,
            fee_per_person: entranceFee,
            passport_type: isEuroPassport ? 'EUR' : 'non-EUR',
            pax: pax,
            total: activityEntranceCost
          })
        }

        // TRANSPORTATION
        if (activity.transportation) {
          // Transportation is per vehicle, not per person
          // Select appropriate vehicle based on pax
          const transportRate = activity.transportation.rate_per_day || 0

          totalTransportation += transportRate
          details.transportation.push({
            day: day.day_number,
            activity_order: activity.activity_order,
            vehicle: activity.transportation.vehicle_type,
            rate: transportRate
          })
        }
      }
    }
  }

  const grandTotal = totalAccommodation + totalMeals + totalGuides + totalTransportation + totalEntrances
  const perPersonTotal = pax > 0 ? grandTotal / pax : 0

  return {
    pax,
    is_euro_passport: isEuroPassport,
    total_accommodation: Math.round(totalAccommodation * 100) / 100,
    total_meals: Math.round(totalMeals * 100) / 100,
    total_guides: Math.round(totalGuides * 100) / 100,
    total_transportation: Math.round(totalTransportation * 100) / 100,
    total_entrances: Math.round(totalEntrances * 100) / 100,
    grand_total: Math.round(grandTotal * 100) / 100,
    per_person_total: Math.round(perPersonTotal * 100) / 100,
    details
  }
}