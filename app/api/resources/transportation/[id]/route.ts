import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching transportation rate:', error)
      return NextResponse.json({ error: 'Transportation rate not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in transportation rate GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()

    const updateData = {
      service_code: body.service_code,
      service_type: body.service_type,
      vehicle_type: body.vehicle_type,
      capacity_min: body.capacity_min,
      capacity_max: body.capacity_max,
      city: body.city,
      base_rate_eur: body.base_rate_eur,
      base_rate_non: body.base_rate_non,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from,
      rate_valid_to: body.rate_valid_to,
      supplier_name: body.supplier_name || null,
      notes: body.notes || null,
      is_active: body.is_active,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating transportation rate:', error)
      return NextResponse.json({ error: 'Failed to update transportation rate' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in transportation rate PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const { error } = await supabaseAdmin
      .from('transportation_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting transportation rate:', error)
      return NextResponse.json({ error: 'Failed to delete transportation rate' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in transportation rate DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}