import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { resolveVehicleWrite } from '@/lib/rates/vehicle-bands-server'
import { validDuration, duplicateOf, duplicateMessage } from '@/lib/b2b/transport-packages'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// B2B TRANSPORT PACKAGES API
// File: app/api/b2b/transport-packages/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data, error } = await supabaseAdmin
      .from('b2b_transport_packages')
      .select('*')
      .eq('org_id', orgId)
      .order('package_name')

    if (error) {
      console.error('Error fetching transport packages:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // The vehicles, as a transportation rate stores them: vocabulary keys,
    // the vocabulary's passenger sizes (lib/rates/vehicle-bands-server).
    const vehicleWrite = await resolveVehicleWrite(body, null)
    if (!vehicleWrite.ok) return NextResponse.json({ success: false, error: vehicleWrite.error }, { status: 400 })
    if (!vehicleWrite.patch || vehicleWrite.patch.vehicles.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one vehicle rate is required' }, { status: 400 })
    }

    // A whole number of days, 1 or more; none sent is 1, as it always was.
    const durationDays = body.duration_days === undefined || body.duration_days === null ? 1 : validDuration(body.duration_days)
    if (durationDays === null) {
      return NextResponse.json({ success: false, error: 'Duration must be a whole number of days, 1 or more' }, { status: 400 })
    }
    const packageType = body.package_type || 'cruise_sightseeing'

    // A second active package for the same type, length and route would leave
    // pricing to pick between them — refused (lib/b2b/transport-packages).
    const { data: sameType } = await supabaseAdmin
      .from('b2b_transport_packages')
      .select('id, package_name, package_type, duration_days, origin_city, destination_city, is_active')
      .eq('org_id', orgId)
      .eq('package_type', packageType)
      .eq('is_active', true)
    const dup = duplicateOf({
      package_type: packageType, duration_days: durationDays,
      origin_city: body.origin_city, destination_city: body.destination_city, is_active: body.is_active ?? true,
    }, sameType ?? [])
    if (dup) return NextResponse.json({ success: false, error: duplicateMessage(dup) }, { status: 409 })

    const { data, error } = await supabaseAdmin
      .from('b2b_transport_packages')
      .insert({
        org_id: orgId,
        package_code: body.package_code || `PKG-${Date.now()}`,
        package_name: body.package_name,
        package_type: packageType,
        origin_city: body.origin_city,
        destination_city: body.destination_city,
        duration_days: durationDays,
        ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
        vehicles: vehicleWrite.patch.vehicles,
        description: body.description,
        includes: body.includes,
        notes: body.notes,
        is_active: body.is_active ?? true
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating transport package:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}