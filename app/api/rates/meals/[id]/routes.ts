import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('meal_rates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET meal_rate error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET meal_rate catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const updateData: Record<string, any> = {}

    if (body.service_code !== undefined) updateData.service_code = body.service_code
    if (body.restaurant_name !== undefined) updateData.restaurant_name = body.restaurant_name
    if (body.meal_type !== undefined) updateData.meal_type = body.meal_type || null
    if (body.cuisine_type !== undefined) updateData.cuisine_type = body.cuisine_type || null
    if (body.restaurant_type !== undefined) updateData.restaurant_type = body.restaurant_type || null
    if (body.city !== undefined) updateData.city = body.city || null
    if (body.base_rate_eur !== undefined) updateData.base_rate_eur = parseFloat(body.base_rate_eur) || 0
    if (body.base_rate_non_eur !== undefined) updateData.base_rate_non_eur = parseFloat(body.base_rate_non_eur) || 0
    if (body.season !== undefined) updateData.season = body.season || null
    if (body.rate_valid_from !== undefined) updateData.rate_valid_from = body.rate_valid_from || null
    if (body.rate_valid_to !== undefined) updateData.rate_valid_to = body.rate_valid_to || null
    if (body.supplier_id !== undefined) updateData.supplier_id = body.supplier_id || null
    if (body.supplier_name !== undefined) updateData.supplier_name = body.supplier_name || null
    if (body.tier !== undefined) updateData.tier = body.tier || null
    if (body.meal_category !== undefined) updateData.meal_category = body.meal_category || null
    if (body.dietary_options !== undefined) updateData.dietary_options = body.dietary_options || []
    if (body.per_person_rate !== undefined) updateData.per_person_rate = body.per_person_rate
    if (body.minimum_pax !== undefined) updateData.minimum_pax = body.minimum_pax ? parseInt(body.minimum_pax) : null
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data, error } = await supabaseAdmin
      .from('meal_rates')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT meal_rate error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT meal_rate catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await supabaseAdmin
      .from('meal_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE meal_rate error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE meal_rate catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}