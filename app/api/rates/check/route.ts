import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { selectAllRows } from '@/lib/db/select-all-rows'
import { hotelTierFindings, transportTypeFindings, type HotelCheckRow, type TransportCheckRow } from '@/lib/rates/rate-checks'

// ============================================
// GET /api/rates/check — rates likely saved under the wrong category
// ============================================
// Read-only: hotels whose tier does not fit their star rating, and transport
// whose type contradicts its route or name (lib/rates/rate-checks.ts). The
// signed-in client, so RLS keeps both reads to the caller's organisation.

export async function GET() {
  try {
    const supabase = createServerClient()
    const [hotels, transport] = await Promise.all([
      selectAllRows<HotelCheckRow>(() => supabase
        .from('accommodation_rates')
        .select('id, property_name, city, tier, star_rating')
        .eq('is_active', true)),
      selectAllRows<TransportCheckRow>(() => supabase
        .from('transportation_rates')
        .select('id, route_name, service_type, city, origin_city, destination_city')
        .eq('is_active', true)),
    ])
    const error = hotels.error ?? transport.error
    if (error) return NextResponse.json({ success: false, error: 'Could not check rates' }, { status: 500 })

    return NextResponse.json({
      success: true,
      data: {
        hotels: hotelTierFindings(hotels.data ?? []),
        transport: transportTypeFindings(transport.data ?? []),
      },
    })
  } catch (error) {
    console.error('GET /api/rates/check error:', error)
    return NextResponse.json({ success: false, error: 'Could not check rates' }, { status: 500 })
  }
}
