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
    const city = searchParams.get('city')
    const cuisineType = searchParams.get('cuisine_type')
    const mealType = searchParams.get('meal_type')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('meal_rates')
      .select(`
        *,
        supplier:supplier_id (id, name, city, contact_phone, contact_email, cuisine_types)
      `)
      .order('restaurant_name')
      .order('meal_type')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (city) query = query.eq('restaurant_city', city)
    if (cuisineType) query = query.eq('cuisine_type', cuisineType)
    if (mealType) query = query.eq('meal_type', mealType)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error fetching meal rates:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const newRate = {
      ...body,
      supplier_id: body.supplier_id || null
    }

    const { data, error } = await supabaseAdmin
      .from('meal_rates')
      .insert([newRate])
      .select(`*, supplier:supplier_id (id, name, city)`)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error creating meal rate:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}