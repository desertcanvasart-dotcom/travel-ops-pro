// app/api/rates/cruises/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSeasons, legacyColumnMirror } from '@/lib/rates/rate-seasons'
import { createServerClient } from '@/lib/supabase-server'
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