import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const shipName = searchParams.get('ship_name')
    const route = searchParams.get('route')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('nile_cruises')
      .select(`
        *,
        supplier:supplier_id (id, name, city, contact_phone, contact_email, star_rating)
      `)
      .order('ship_name')
      .order('cabin_type')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (shipName) query = query.ilike('ship_name', `%${shipName}%`)
    if (route) query = query.eq('route', route)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error fetching cruises:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Include supplier_id in insert
    const newCruise = {
      ...body,
      supplier_id: body.supplier_id || null
    }

    const { data, error } = await supabaseAdmin
      .from('nile_cruises')
      .insert([newCruise])
      .select(`*, supplier:supplier_id (id, name)`)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error creating cruise:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}