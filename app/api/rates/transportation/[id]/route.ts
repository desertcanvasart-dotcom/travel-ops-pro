import { NextRequest, NextResponse } from 'next/server'
import { LEGACY_VEHICLE_KEYS, bodyTouchesVehicles } from '@/lib/rates/vehicle-bands'
import { resolveVehicleWrite } from '@/lib/rates/vehicle-bands-server'
import { clientMessage } from '@/lib/api-errors'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { createActorAdminClient } from '@/lib/supabase-actor'

// ============================================
// TRANSPORTATION RATES API - Single Record
// File: app/api/rates/transportation/[id]/route.ts
// ============================================

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()


// Helper to parse tiered rate fields from request body
// Vehicles are resolved by lib/rates/vehicle-bands-server — see the POST route.

// GET - Single transportation rate by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .select(`
        *,
        supplier:suppliers(id, name, city, contact_phone, contact_email)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET transportation_rates/[id] error:', error)
      return NextResponse.json({ success: false, error: 'Rate not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET transportation_rates/[id] catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// PUT - Update single transportation rate (tiered vehicle rates)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Validate supplier fields if either was provided. PUT can patch a subset
    // of columns, so only run the guard when the client touched supplier_id
    // or supplier_name; otherwise the existing row's FK stays untouched.
    const supplierFieldPresent = 'supplier_id' in body || 'supplier_name' in body
    let resolvedSupplierId: string | null | undefined
    let resolvedSupplierName: string | null | undefined
    if (supplierFieldPresent) {
      const supplierCheck = await validateAndResolveSupplierFields(body, supabaseAdmin)
      if (!supplierCheck.ok) {
        return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
      }
      resolvedSupplierId = supplierCheck.supplier_id
      resolvedSupplierName = supplierCheck.supplier_name
    }

    // Remove id from body to avoid conflicts
    const { id: _, ...rawUpdates } = body

    // Vehicles: a list replaces the row's; legacy fields patch it, merged over
    // what the row carries. Nothing vehicle-related in the body → unchanged.
    let vehiclePatch: Record<string, unknown> = {}
    if (bodyTouchesVehicles(rawUpdates)) {
      const { data: currentRow } = await supabaseAdmin
        .from('transportation_rates')
        .select('*')
        .eq('id', id)
        .single()
      const vehicleWrite = await resolveVehicleWrite(rawUpdates, currentRow ?? null)
      if (!vehicleWrite.ok) {
        return NextResponse.json({ success: false, error: vehicleWrite.error }, { status: 400 })
      }
      if (vehicleWrite.patch) {
        if (vehicleWrite.patch.vehicles.length === 0) {
          return NextResponse.json({ success: false, error: 'At least one vehicle rate is required' }, { status: 400 })
        }
        vehiclePatch = vehicleWrite.patch
      }
    }

    // Build non-vehicle updates — the patch above owns the vehicle fields.
    const updates: Record<string, any> = {}
    for (const [key, val] of Object.entries(rawUpdates)) {
      if (key !== 'vehicles' && !LEGACY_VEHICLE_KEYS.some(t => key.startsWith(`${t}_`))) {
        updates[key] = val
      }
    }

    // Apply the validated supplier fields AFTER the raw spread so the
    // sentinel-or-resolved values win over the client's raw body.
    if (supplierFieldPresent) {
      updates.supplier_id = resolvedSupplierId ?? null
      updates.supplier_name = resolvedSupplierName ?? null
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .update({ ...updates, ...vehiclePatch })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT transportation_rates/[id] error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT transportation_rates/[id] catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// DELETE - Delete single transportation rate
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await supabaseAdmin
      .from('transportation_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE transportation_rates/[id] error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE transportation_rates/[id] catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
