// app/api/rates/cruises/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSeasons, legacyColumnMirror } from '@/lib/rates/rate-seasons'
import { createServerClient } from '@/lib/supabase-server'
import { resolveShipProperty } from '@/lib/suppliers/resolve-property'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServerClient()
    const body = await request.json()

    // Validate supplier_id only when the client touched the field (PUT can patch).
    let updateBody = body
    if ('supplier_id' in body || 'supplier_name' in body) {
      const supplierCheck = await validateAndResolveSupplierFields(body, supabase)
      if (!supplierCheck.ok) {
        return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
      }
      updateBody = { ...body, supplier_id: supplierCheck.supplier_id }
    }

    // PUT can patch, so only touch periods when the client sent them. When it
    // did, they are validated rather than passed through as raw JSONB, and the
    // first period is mirrored onto the base columns for readers that have no
    // travel date.
    if ('seasons' in body) {
      const cruiseSeasons = sanitizeSeasons(body.seasons, 'cruise')
      updateBody = {
        ...updateBody,
        seasons: cruiseSeasons,
        ...legacyColumnMirror(cruiseSeasons, 'cruise'),
      }
    }

    // Re-link the ship when anything identifying it moved (PUT can patch, so
    // read the row for whichever half the payload left out).
    if ('ship_name' in updateBody || 'supplier_id' in updateBody || 'property_id' in updateBody) {
      const { data: current } = await supabase
        .from('nile_cruises')
        .select('supplier_id, ship_name')
        .eq('id', id)
        .maybeSingle()
      const ship = await resolveShipProperty(supabase, {
        supplierId: 'supplier_id' in updateBody ? updateBody.supplier_id : current?.supplier_id,
        shipName: 'ship_name' in updateBody ? updateBody.ship_name : current?.ship_name,
        propertyId: updateBody.property_id,
      })
      updateBody = {
        ...updateBody,
        property_id: ship.property_id,
        ...(ship.ship_name ? { ship_name: ship.ship_name } : {}),
      }
    }

    const { data, error } = await supabase
      .from('nile_cruises')
      .update(updateBody)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServerClient()

    const { error } = await supabase
      .from('nile_cruises')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}