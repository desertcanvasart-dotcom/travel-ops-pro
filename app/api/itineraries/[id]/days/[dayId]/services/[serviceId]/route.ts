// API Route: /api/itineraries/[id]/days/[dayId]/services/[serviceId]/route.ts
// Updated to handle transport-specific fields
//
// Until 2026-08-22 every handler here filtered on `day_id`, a column
// itinerary_services does not have (it is `itinerary_day_id`), so PostgREST
// answered 42703 and GET/PUT/DELETE returned 400 on EVERY call — the same
// defect that had kept generate-commissions from ever running. The editor
// writes services through Supabase directly, which is why nobody noticed.
//
// The ownership check is now the full chain: itinerary ∈ org, day ∈ itinerary,
// service ∈ day. Checking only the itinerary's org let a caller pair their
// own itinerary id with any other org's day and service ids.

import { createClient } from '@/lib/supabase/server'
import { clientMessage } from '@/lib/api-errors'
import { NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

/** 404 unless the itinerary belongs to the org AND the day belongs to the itinerary. */
async function ownedDay(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  itineraryId: string,
  dayId: string
): Promise<boolean> {
  const { data: parent } = await supabase
    .from('itineraries')
    .select('id')
    .eq('id', itineraryId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!parent) return false
  const { data: day } = await supabase
    .from('itinerary_days')
    .select('id')
    .eq('id', dayId)
    .eq('itinerary_id', itineraryId)
    .maybeSingle()
  return !!day
}

const NOT_FOUND = NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })

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

    // itinerary ∈ org, day ∈ itinerary — before mutating child service
    if (!(await ownedDay(supabase, orgId, id, dayId))) return NOT_FOUND

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
      sold_by_supplier_id: body.sold_by_supplier_id,
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
      .eq('itinerary_day_id', dayId)
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

    // itinerary ∈ org, day ∈ itinerary — before deleting child service
    if (!(await ownedDay(supabase, orgId, id, dayId))) return NOT_FOUND

    const { error } = await supabase
      .from('itinerary_services')
      .delete()
      .eq('id', serviceId)
      .eq('itinerary_day_id', dayId)

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

    // itinerary ∈ org, day ∈ itinerary — before reading child service
    if (!(await ownedDay(supabase, orgId, id, dayId))) return NOT_FOUND

    const { data, error } = await supabase
      .from('itinerary_services')
      // Two FKs point at suppliers (supplier_id + sold_by_supplier_id since
      // 20260822_service_sold_by.sql): the embed must name its column or
      // PostgREST answers PGRST201 (ambiguous). Keeps the `suppliers` key.
      .select('*, suppliers:suppliers!supplier_id(id, name, type, contact_name, contact_phone, contact_email, city)')
      .eq('id', serviceId)
      .eq('itinerary_day_id', dayId)
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