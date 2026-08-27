import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { createActorAdminClient } from '@/lib/supabase-actor'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('guide_rates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET guide_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET guide_rate catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const updateData: Record<string, any> = {}

    if (body.service_code !== undefined) updateData.service_code = body.service_code
    if (body.guide_language !== undefined) updateData.guide_language = body.guide_language
    if (body.guide_type !== undefined) updateData.guide_type = body.guide_type
    if (body.city !== undefined) updateData.city = body.city || null
    if (body.tour_duration !== undefined) updateData.tour_duration = body.tour_duration
    if (body.base_rate_eur !== undefined) updateData.base_rate_eur = parseFloat(body.base_rate_eur) || 0
    if (body.base_rate_non_eur !== undefined) updateData.base_rate_non_eur = parseFloat(body.base_rate_non_eur) || 0
    if (body.rate_currency !== undefined) updateData.rate_currency = body.rate_currency || null
    if (body.season !== undefined) updateData.season = body.season || null
    if (body.rate_valid_from !== undefined) updateData.rate_valid_from = body.rate_valid_from || null
    if (body.rate_valid_to !== undefined) updateData.rate_valid_to = body.rate_valid_to || null
    if ('supplier_id' in body || 'supplier_name' in body) {
      const supplierCheck = await validateAndResolveSupplierFields(body, supabaseAdmin)
      if (!supplierCheck.ok) {
        return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
      }
      updateData.supplier_id = supplierCheck.supplier_id
    }
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data, error } = await supabaseAdmin
      .from('guide_rates')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT guide_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT guide_rate catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await supabaseAdmin
      .from('guide_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE guide_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE guide_rate catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}