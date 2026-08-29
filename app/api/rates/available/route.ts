import { createActorAdminClient } from '@/lib/supabase-actor'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { currencySymbol } from '@/lib/currency-totals'

// ============================================
// AVAILABLE RATES API
// File: app/api/rates/available/route.ts
// ============================================

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

interface AvailableRate {
  rate_type: string
  rate_id: string
  /** The currency the row is entered in; null = the org rate currency. A
   *  composite API must not strip this — see the attractions round-trip bug. */
  rate_currency?: string | null
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
    // Rate amounts in text carry the org's rate-currency symbol, never a hard-coded euro.
    const rateSym = currencySymbol(await getOrgRateCurrency(supabaseAdmin, await getCurrentOrgId()))
    const { searchParams } = new URL(request.url)
    const rate_type = searchParams.get('type')
    const city = searchParams.get('city')
    const search = searchParams.get('search')

    const rates: AvailableRate[] = []

    // Six independent tables. The rate picker's DEFAULT request has no type
    // filter and therefore needs all six — and they used to run one after
    // another, so the picker paid six round trips of latency for one screen.
    // Supabase builders are lazy: nothing executes until awaited, so building
    // them first and awaiting together is what actually makes them concurrent.
    // Processing stays in the original order below, so the response body is
    // byte-identical to the sequential version.
    // transportation
    const q_trans =
      !rate_type || rate_type === 'transportation'
        ? supabaseAdmin
        .from('transportation_rates')
        .select('id, service_code, service_type, route_name, city, origin_city, destination_city, sedan_rate_eur, minivan_rate_eur, van_rate_eur, minibus_rate_eur, bus_rate_eur, supplier_id, suppliers (name)')
        .eq('is_active', true)
        .order('city')
        .order('service_type')
        : null
    // guide
    const q_guide =
      !rate_type || rate_type === 'guide'
        ? supabaseAdmin
        .from('guide_rates')
        .select('id, guide_type, city, half_day_rate, full_day_rate, supplier_id, suppliers (name)')
        .eq('is_active', true)
        .order('city')
        : null
    // activity
    const q_activ =
      !rate_type || rate_type === 'activity'
        ? supabaseAdmin
        .from('activity_rates')
        .select('id, activity_name, activity_category, city, base_rate_eur, base_rate_non_eur, supplier_id, suppliers (name)')
        .eq('is_active', true)
        .order('activity_name')
        : null
    // meal
    const q_meal =
      !rate_type || rate_type === 'meal'
        ? supabaseAdmin
        .from('meal_rates')
        .select('id, restaurant_name, meal_type, tier, cuisine, city, base_rate_eur, base_rate_non_eur, supplier_id, suppliers (name)')
        .eq('is_active', true)
        .order('restaurant_name')
        : null
    // accommodation
    const q_accom =
      !rate_type || rate_type === 'accommodation'
        ? supabaseAdmin
        .from('accommodation_rates')
        .select('id, hotel_name, room_type, city, star_rating, rate_low_season_sgl, rate_high_season_sgl, rate_peak_season_sgl, supplier_id, suppliers (name)')
        .eq('is_active', true)
        .order('hotel_name')
        : null
    // cruise
    const q_cruis =
      !rate_type || rate_type === 'cruise'
        ? supabaseAdmin
        .from('nile_cruises')
        .select('id, ship_name, cabin_type, cruise_type, nights, rate_low_season, rate_high_season, rate_peak_season, supplier_id, suppliers (name)')
        .eq('is_active', true)
        .order('ship_name')
        : null

    const [r_trans, r_guide, r_activ, r_meal, r_accom, r_cruis] = await Promise.all([q_trans, q_guide, q_activ, q_meal, q_accom, q_cruis])

    if (r_trans?.data) {
      const data = r_trans.data
        for (const r of data) {
          // Find the cheapest available tier rate for display
          const tierRates = [r.sedan_rate_eur, r.minivan_rate_eur, r.van_rate_eur, r.minibus_rate_eur, r.bus_rate_eur].filter(Boolean) as number[]
          const minRate = tierRates.length > 0 ? Math.min(...tierRates) : 0
          const tierCount = tierRates.length

          rates.push({
            rate_type: 'transportation',
            rate_id: r.id,
            rate_currency: (r as any).rate_currency ?? null,
            rate_name: r.route_name || r.service_type || `${r.origin_city} to ${r.destination_city}`,
            rate_eur: minRate,
            rate_non_eur: minRate,
            city: r.city || r.origin_city,
            default_quantity_mode: 'per_group',
            supplier_id: r.supplier_id,
            supplier_name: (r.suppliers as any)?.name,
            details: `${tierCount} vehicle tier${tierCount !== 1 ? 's' : ''} | from ${rateSym}${minRate}`
          })
        }
    }
    if (r_guide?.data) {
      const data = r_guide.data
        for (const r of data) {
          rates.push({
            rate_type: 'guide',
            rate_id: r.id,
            rate_currency: (r as any).rate_currency ?? null,
            rate_name: `${r.guide_type || 'Guide'} - ${r.city}`,
            rate_eur: r.half_day_rate,
            rate_non_eur: r.half_day_rate,
            city: r.city,
            default_quantity_mode: 'per_group',
            supplier_id: r.supplier_id,
            supplier_name: (r.suppliers as any)?.name,
            details: `Half: ${rateSym}${r.half_day_rate} | Full: ${rateSym}${r.full_day_rate}`
          })
        }
    }
    if (r_activ?.data) {
      const data = r_activ.data
        for (const r of data) {
          rates.push({
            rate_type: 'activity',
            rate_id: r.id,
            rate_currency: (r as any).rate_currency ?? null,
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
    if (r_meal?.data) {
      const data = r_meal.data
        for (const r of data) {
          rates.push({
            rate_type: 'meal',
            rate_id: r.id,
            rate_currency: (r as any).rate_currency ?? null,
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
    if (r_accom?.data) {
      const data = r_accom.data
        for (const r of data) {
          rates.push({
            rate_type: 'accommodation',
            rate_id: r.id,
            rate_currency: (r as any).rate_currency ?? null,
            rate_name: `${r.hotel_name} - ${r.room_type}`,
            rate_eur: r.rate_low_season_sgl,
            rate_non_eur: r.rate_low_season_sgl,
            city: r.city,
            default_quantity_mode: 'per_night',
            supplier_id: r.supplier_id,
            supplier_name: (r.suppliers as any)?.name,
            details: `${r.star_rating || ''}★ | Low: ${rateSym}${r.rate_low_season_sgl}`
          })
        }
    }
    if (r_cruis?.data) {
      const data = r_cruis.data
        for (const r of data) {
          rates.push({
            rate_type: 'cruise',
            rate_id: r.id,
            rate_currency: (r as any).rate_currency ?? null,
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