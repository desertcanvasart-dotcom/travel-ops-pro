// API Route: /api/itineraries/[id]/days/[dayId]/services/[serviceId]/route.ts
// Updated to handle transport-specific fields

import { createClient } from '@/lib/supabase/server'
import { clientMessage } from '@/lib/api-errors'
import { NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; dayId: string; serviceId: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id, dayId, serviceId } = await params
    const supabase = createClient()
    const body = await request.json()

    // Confirm the itinerary belongs to this org before mutating child service
    const { data: parent } = await supabase
      .from('itineraries')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parent) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // Extract all fields including transport-specific ones
    const updateData: Record<string, any> = {
      service_name: body.service_name,
      service_code: body.service_code,
      service_type: body.service_type,
      quantity: body.quantity,
      rate_eur: body.rate_eur,
      rate_non_eur: body.rate_non_eur,
      total_cost: body.total_cost,
      notes: body.notes,
      supplier_id: body.supplier_id,
      supplier_name: body.supplier_name,
      commission_rate: body.commission_rate,
      commission_amount: body.commission_amount,
      commission_status: body.commission_status,
      client_price: body.client_price,
      is_preferred_supplier: body.is_preferred_supplier,
      // Transport-specific fields
      vehicle_type: body.vehicle_type || null,
      pickup_location: body.pickup_location || null,
      dropoff_location: body.dropoff_location || null,
      pickup_time: body.pickup_time || null,
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key]
      }
    })

    const { data, error } = await supabase
      .from('itinerary_services')
      .update(updateData)
      .eq('id', serviceId)
      .eq('day_id', dayId)
      .select()
      .single()

    if (error) {
      console.error('Error updating service:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; dayId: string; serviceId: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id, dayId, serviceId } = await params
    const supabase = createClient()

    // Confirm the itinerary belongs to this org before deleting child service
    const { data: parent } = await supabase
      .from('itineraries')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parent) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    const { error } = await supabase
      .from('itinerary_services')
      .delete()
      .eq('id', serviceId)
      .eq('day_id', dayId)

    if (error) {
      console.error('Error deleting service:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; dayId: string; serviceId: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id, dayId, serviceId } = await params
    const supabase = createClient()

    // Confirm the itinerary belongs to this org before reading child service
    const { data: parent } = await supabase
      .from('itineraries')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parent) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    const { data, error } = await supabase
      .from('itinerary_services')
      .select(`
        *,
        suppliers (
          id,
          name,
          type,
          contact_name,
          contact_phone,
          contact_email,
          city
        )
      `)
      .eq('id', serviceId)
      .eq('day_id', dayId)
      .single()

    if (error) {
      console.error('Error fetching service:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}