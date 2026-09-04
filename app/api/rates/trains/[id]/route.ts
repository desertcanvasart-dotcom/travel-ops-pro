import { NextRequest, NextResponse } from 'next/server'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'
import { operatorNameForSupplier } from '@/lib/suppliers/operator-name'
import { clientMessage } from '@/lib/api-errors'
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
      .from('train_rates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET train_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET train_rate catch error:', error)
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
    if (body.rate_currency !== undefined) updateData.rate_currency = body.rate_currency || null
    if (body.origin_city !== undefined) updateData.origin_city = body.origin_city || null
    if (body.destination_city !== undefined) updateData.destination_city = body.destination_city || null
    if (body.class_type !== undefined) updateData.class_type = body.class_type || null
    if (body.rate_eur !== undefined) updateData.rate_eur = parseFloat(body.rate_eur) || 0
    // Throughout-guide fare: blank clears back to NULL = pays the customer rate.
    if (body.guide_rate !== undefined) updateData.guide_rate = body.guide_rate === '' || body.guide_rate === null ? null : parseFloat(body.guide_rate)
    if (body.duration_hours !== undefined) updateData.duration_hours = body.duration_hours ? parseFloat(body.duration_hours) : null
    if (body.rate_valid_from !== undefined) updateData.rate_valid_from = body.rate_valid_from || null
    if (body.rate_valid_to !== undefined) updateData.rate_valid_to = body.rate_valid_to || null
    // The supplier IS the operator: derive the denormalized name rather
    // than trusting the client, so the two can never disagree. Clearing the
    // supplier clears the name — a name with no supplier is the orphan state
    // this replaced. A payload naming neither (e.g. CSV) is left alone.
    if (body.supplier_id !== undefined || body.operator_name !== undefined) {
      updateData.operator_name = await operatorNameForSupplier(
        supabaseAdmin,
        body.supplier_id,
        body.operator_name
      )
    }
    if (body.supplier_id !== undefined) updateData.supplier_id = body.supplier_id || null
    if (body.property_id !== undefined) {
      const trainProp = await resolveRateProperty(supabaseAdmin, {
        propertyType: 'train',
        supplierId: body.supplier_id || null,
        name: null,
        propertyId: body.property_id,
      })
      // Explicit null clears the link; a stale id also resolves to null.
      updateData.property_id = trainProp.property_id
    }
    if (body.departure_times !== undefined) updateData.departure_times = body.departure_times || null
    if (body.description !== undefined) updateData.description = body.description || null
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data, error } = await supabaseAdmin
      .from('train_rates')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT train_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT train_rate catch error:', error)
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
      .from('train_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE train_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE train_rate catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}