import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { selectAllRows } from '@/lib/db/select-all-rows'
import { hotelTierFindings, transportTypeFindings, type HotelCheckRow, type TransportCheckRow } from '@/lib/rates/rate-checks'

// ============================================
// GET /api/rates/check — rates likely saved under the wrong category
// ============================================
// Read-only: hotels whose tier does not fit their star rating, and transport
// whose type contradicts its route or name (lib/rates/rate-checks.ts). Both
// reads are the caller's organisation's (org_id), and RLS applies too.

export async function GET() {
  try {
    const supabase = createServerClient()
    // The company's own rates (rate tables carry org_id since 20261206).
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const [hotels, transport] = await Promise.all([
      selectAllRows<HotelCheckRow>(() => supabase
        .from('accommodation_rates')
        .select('id, property_name, city, tier, star_rating')
        .eq('org_id', orgId)
        .eq('is_active', true)),
      selectAllRows<TransportCheckRow>(() => supabase
        .from('transportation_rates')
        .select('id, route_name, service_type, city, origin_city, destination_city')
        .eq('org_id', orgId)
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
