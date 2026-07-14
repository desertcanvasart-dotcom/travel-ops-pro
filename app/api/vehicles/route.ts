// ============================================
// API Route: /api/vehicles
// ============================================
// GET: list vehicles (optionally only active ones). The calendar's
// vehicle-assignment filter has fetched this endpoint since it shipped, but
// the route never existed — every calendar load logged a JSON parse error
// against Next's HTML 404 page. Mirrors /api/guides' shape: { success, data }.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const is_active = request.nextUrl.searchParams.get('is_active')

    let query = supabase
      .from('vehicles')
      .select('id, name, vehicle_type, passenger_capacity, city, license_plate, is_active')
      .order('name', { ascending: true })

    if (is_active === 'true') {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET /api/vehicles error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to fetch vehicles') },
      { status: 500 }
    )
  }
}
