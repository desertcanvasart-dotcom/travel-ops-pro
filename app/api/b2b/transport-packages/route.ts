import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { resolveVehicleWrite } from '@/lib/rates/vehicle-bands-server'
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

    const { data, error } = await supabaseAdmin
      .from('b2b_transport_packages')
      .insert({
        org_id: orgId,
        package_code: body.package_code || `PKG-${Date.now()}`,
        package_name: body.package_name,
        package_type: body.package_type || 'cruise_sightseeing',
        origin_city: body.origin_city,
        destination_city: body.destination_city,
        duration_days: body.duration_days || 1,
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