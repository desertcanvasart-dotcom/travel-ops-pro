// ============================================
// API Route: /api/resources/vehicles
// ============================================
// Fetches transport suppliers from suppliers table
// (type = 'transport', 'local_operator', or 'driver')
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const isActive = searchParams.get('is_active')
    const city = searchParams.get('city')

    let query = supabaseAdmin
      .from('suppliers')
      .select('*')
      .in('type', ['transport', 'local_operator', 'driver'])
      .order('name', { ascending: true })

    if (isActive === 'true') {
      query = query.eq('status', 'active')
    } else if (isActive === 'false') {
      query = query.eq('status', 'inactive')
    }

    if (city) {
      query = query.ilike('city', `%${city}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching transport suppliers:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch transport suppliers' },
        { status: 500 }
      )
    }

    // Map supplier fields to Resource interface expected by ResourceAssignmentV2
    const mappedData = (data || []).map((supplier: any) => ({
      id: supplier.id,
      name: supplier.name,
      type: supplier.type,
      city: supplier.city || null,
      phone: supplier.contact_phone || supplier.whatsapp || null,
      whatsapp: supplier.whatsapp || null,
      email: supplier.contact_email || null,
      vehicle_types: supplier.vehicle_types || [],
      notes: supplier.notes || null,
      is_active: supplier.status === 'active',
      created_at: supplier.created_at,
    }))

    return NextResponse.json({ success: true, data: mappedData })
  } catch (error) {
    console.error('Error in vehicles GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
