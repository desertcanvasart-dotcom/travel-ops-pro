import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// AVAILABLE RATES API
// File: app/api/rates/available/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface AvailableRate {
  rate_type: string
  rate_id: string
  rate_name: string
  rate_eur: number | null
  rate_non_eur: number | null
  city: string | null
  default_quantity_mode: string
  supplier_id: string | null
  supplier_name?: string
  details?: string
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rate_type = searchParams.get('type')
    const city = searchParams.get('city')
    const search = searchParams.get('search')

    const rates: AvailableRate[] = []

    // Transportation rates (one row per service with tiered vehicle rates)
    if (!rate_type || rate_type === 'transportation') {
      const { data } = await supabaseAdmin
        .from('transportation_rates')
        .select('id, service_code, service_type, route_name, city, origin_city, destination_city, sedan_rate_eur, minivan_rate_eur, van_rate_eur, minibus_rate_eur, bus_rate_eur, supplier_id, suppliers (name)')
        .eq('is_active', true)
        .order('city')
        .order('service_type')

      if (data) {
        for (const r of data) {
          // Find the cheapest available tier rate for display
          const tierRates = [r.sedan_rate_eur, r.minivan_rate_eur, r.van_rate_eur, r.minibus_rate_eur, r.bus_rate_eur].filter(Boolean) as number[]
          const minRate = tierRates.length > 0 ? Math.min(...tierRates) : 0
          const tierCount = tierRates.length

          rates.push({
            rate_type: 'transportation',
            rate_id: r.id,
            rate_name: r.route_name || r.service_type || `${r.origin_city} to ${r.destination_city}`,
            rate_eur: minRate,
            rate_non_eur: minRate,
            city: r.city || r.origin_city,
            default_quantity_mode: 'per_group',
            supplier_id: r.supplier_id,
            supplier_name: (r.suppliers as any)?.name,
            details: `${tierCount} vehicle tier${tierCount !== 1 ? 's' : ''} | from €${minRate}`
          })
        }
      }
    }

    // Guide rates
    if (!rate_type || rate_type === 'guide') {
      const { data } = await supabaseAdmin
        .from('guide_rates')
        .select('id, guide_type, city, half_day_rate, full_day_rate, supplier_id, suppliers (name)')
        .eq('is_active', true)
        .order('city')

      if (data) {
        for (const r of data) {
          rates.push({
            rate_type: 'guide',
            rate_id: r.id,
            rate_name: `${r.guide_type || 'Guide'} - ${r.city}`,
            rate_eur: r.half_day_rate,
            rate_non_eur: r.half_day_rate,
            city: r.city,
            default_quantity_mode: 'per_group',
            supplier_id: r.supplier_id,
            supplier_name: (r.suppliers as any)?.name,
            details: `Half: €${r.half_day_rate} | Full: €${r.full_day_rate}`
          })
        }
      }
    }

    // Activity rates
    if (!rate_type || rate_type === 'activity') {
      const { data } = await supabaseAdmin
        .from('activity_rates')
        .select('id, activity_name, activity_category, city, base_rate_eur, base_rate_non_eur, supplier_id, suppliers (name)')
        .eq('is_active', true)
        .order('activity_name')

      if (data) {
        for (const r of data) {
          rates.push({
            rate_type: 'activity',
            rate_id: r.id,
            rate_name: `${r.activity_name}${r.city ? ` - ${r.city}` : ''}`,
            rate_eur: r.base_rate_eur,
            rate_non_eur: r.base_rate_non_eur,
            city: r.city,
            default_quantity_mode: 'per_pax',
            supplier_id: r.supplier_id,
            supplier_name: (r.suppliers as any)?.name,
            details: r.activity_category
          })
        }
      }
    }

    // Meal rates
    if (!rate_type || rate_type === 'meal') {
      const { data } = await supabaseAdmin
        .from('meal_rates')
        .select('id, restaurant_name, meal_type, tier, cuisine, city, base_rate_eur, base_rate_non_eur, supplier_id, suppliers (name)')
        .eq('is_active', true)
        .order('restaurant_name')

      if (data) {
        for (const r of data) {
          rates.push({
            rate_type: 'meal',
            rate_id: r.id,
            rate_name: `${r.restaurant_name} - ${r.meal_type} (${r.tier})`,
            rate_eur: r.base_rate_eur,
            rate_non_eur: r.base_rate_non_eur,
            city: r.city,
            default_quantity_mode: 'per_pax',
            supplier_id: r.supplier_id,
            supplier_name: (r.suppliers as any)?.name,
            details: `${r.cuisine || ''} ${r.tier}`
          })
        }
      }
    }

    // Accommodation rates
    if (!rate_type || rate_type === 'accommodation') {
      const { data } = await supabaseAdmin
        .from('accommodation_rates')
        .select('id, hotel_name, room_type, city, star_rating, rate_low_season_sgl, rate_high_season_sgl, rate_peak_season_sgl, supplier_id, suppliers (name)')
        .eq('is_active', true)
        .order('hotel_name')

      if (data) {
        for (const r of data) {
          rates.push({
            rate_type: 'accommodation',
            rate_id: r.id,
            rate_name: `${r.hotel_name} - ${r.room_type}`,
            rate_eur: r.rate_low_season_sgl,
            rate_non_eur: r.rate_low_season_sgl,
            city: r.city,
            default_quantity_mode: 'per_night',
            supplier_id: r.supplier_id,
            supplier_name: (r.suppliers as any)?.name,
            details: `${r.star_rating || ''}★ | Low: €${r.rate_low_season_sgl}`
          })
        }
      }
    }

    // Cruise rates
    if (!rate_type || rate_type === 'cruise') {
      const { data } = await supabaseAdmin
        .from('nile_cruises')
        .select('id, ship_name, cabin_type, cruise_type, nights, rate_low_season, rate_high_season, rate_peak_season, supplier_id, suppliers (name)')
        .eq('is_active', true)
        .order('ship_name')

      if (data) {
        for (const r of data) {
          rates.push({
            rate_type: 'cruise',
            rate_id: r.id,
            rate_name: `${r.ship_name} - ${r.cabin_type}`,
            rate_eur: r.rate_low_season,
            rate_non_eur: r.rate_low_season,
            city: 'Nile',
            default_quantity_mode: 'per_night',
            supplier_id: r.supplier_id,
            supplier_name: (r.suppliers as any)?.name,
            details: `${r.cruise_type} | ${r.nights} nights`
          })
        }
      }
    }

    // Apply filters
    let filteredRates = rates

    if (city) {
      filteredRates = filteredRates.filter(r => r.city?.toLowerCase().includes(city.toLowerCase()))
    }

    if (search) {
      const searchLower = search.toLowerCase()
      filteredRates = filteredRates.filter(r =>
        r.rate_name.toLowerCase().includes(searchLower) ||
        r.supplier_name?.toLowerCase().includes(searchLower) ||
        r.details?.toLowerCase().includes(searchLower)
      )
    }

    const grouped = filteredRates.reduce((acc, rate) => {
      if (!acc[rate.rate_type]) acc[rate.rate_type] = []
      acc[rate.rate_type].push(rate)
      return acc
    }, {} as Record<string, AvailableRate[]>)

    return NextResponse.json({ success: true, data: filteredRates, grouped, total: filteredRates.length })
  } catch (error: any) {
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}