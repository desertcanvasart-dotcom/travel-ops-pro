import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string; serviceId: string }> }
) {
  try {
    const { serviceId } = await params

    const { data, error } = await supabaseAdmin
      .from('itinerary_services')  // ← FIXED
      .select(`
        *,
        supplier:suppliers(id, name, type, default_commission_rate, commission_type)
      `)
      .eq('id', serviceId)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in service GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string; serviceId: string }> }
) {
  try {
    const { serviceId } = await params
    const body = await request.json()

    // If supplier_id changed, fetch new supplier details
    let supplierData = null
    if (body.supplier_id) {
      const { data: supplier } = await supabaseAdmin
        .from('suppliers')
        .select('*')
        .eq('id', body.supplier_id)
        .single()
      
      supplierData = supplier
      
      // Update supplier_name if supplier selected
      if (supplier && !body.supplier_name) {
        body.supplier_name = supplier.name
      }
      
      // Set commission rate from supplier if not manually set
      if (supplier && body.commission_rate === undefined) {
        body.commission_rate = supplier.default_commission_rate
      }
    }

    // Recalculate commission amount
    if (body.commission_rate !== undefined && body.selling_price !== undefined) {
      body.commission_amount = (Number(body.selling_price) * Number(body.commission_rate)) / 100
    }

    const { data, error } = await supabaseAdmin
      .from('itinerary_services')  // ← FIXED
      .update(body)
      .eq('id', serviceId)
      .select(`
        *,
        supplier:suppliers(id, name, type, default_commission_rate, commission_type)
      `)
      .single()

    if (error) {
      console.error('Error updating service:', error)
      return NextResponse.json({ error: 'Failed to update service' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in service PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string; serviceId: string }> }
) {
  try {
    const { serviceId } = await params

    const { error } = await supabaseAdmin
      .from('itinerary_services')  // ← FIXED
      .delete()
      .eq('id', serviceId)

    if (error) {
      console.error('Error deleting service:', error)
      return NextResponse.json({ error: 'Failed to delete service' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in service DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}