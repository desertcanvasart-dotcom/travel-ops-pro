import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { notFoundInOrg } from '@/lib/api/org-scope'
import { clientMessage } from '@/lib/api-errors'
import { resolveVehicleWrite } from '@/lib/rates/vehicle-bands-server'
import { validDuration, duplicateOf, duplicateMessage } from '@/lib/b2b/transport-packages'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// B2B TRANSPORT PACKAGES API - Single Item
// File: app/api/b2b/transport-packages/[id]/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()

    // Vehicles merge over the row's own, like a transportation rate's PUT.
    const { data: currentRow } = await supabaseAdmin
      .from('b2b_transport_packages')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!currentRow) return notFoundInOrg('Transport package')
    const vehicleWrite = await resolveVehicleWrite(body, currentRow)
    if (!vehicleWrite.ok) return NextResponse.json({ success: false, error: vehicleWrite.error }, { status: 400 })
    if (vehicleWrite.patch && vehicleWrite.patch.vehicles.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one vehicle rate is required' }, { status: 400 })
    }

    if (body.duration_days !== undefined && validDuration(body.duration_days) === null) {
      return NextResponse.json({ success: false, error: 'Duration must be a whole number of days, 1 or more' }, { status: 400 })
    }
    // The row as it will be (a key left out keeps its stored value): no second
    // active package for the same type, length and route.
    const pick = <T,>(k: string, stored: T): T => (body[k] !== undefined ? body[k] : stored)
    const after = {
      id,
      package_type: pick('package_type', currentRow.package_type),
      duration_days: body.duration_days !== undefined ? validDuration(body.duration_days) : currentRow.duration_days,
      origin_city: pick('origin_city', currentRow.origin_city),
      destination_city: pick('destination_city', currentRow.destination_city),
      is_active: pick('is_active', currentRow.is_active),
    }
    const { data: sameType } = await supabaseAdmin
      .from('b2b_transport_packages')
      .select('id, package_name, package_type, duration_days, origin_city, destination_city, is_active')
      .eq('org_id', orgId)
      .eq('package_type', after.package_type)
      .eq('is_active', true)
    const dup = duplicateOf(after, sameType ?? [])
    if (dup) return NextResponse.json({ success: false, error: duplicateMessage(dup) }, { status: 409 })

    const { data, error } = await supabaseAdmin
      .from('b2b_transport_packages')
      .update({
        package_code: body.package_code,
        package_name: body.package_name,
        package_type: body.package_type,
        origin_city: body.origin_city,
        destination_city: body.destination_city,
        duration_days: body.duration_days === undefined ? undefined : after.duration_days,
        ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
        ...(vehicleWrite.patch ?? {}),
        description: body.description,
        includes: body.includes,
        notes: body.notes,
        is_active: body.is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .maybeSingle()

    if (!error && !data) return notFoundInOrg('Transport package')
    if (error) {
      console.error('Error updating transport package:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data, error } = await supabaseAdmin
      .from('b2b_transport_packages')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id')

    if (!error && !data?.length) return notFoundInOrg('Transport package')
    if (error) {
      console.error('Error deleting transport package:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}