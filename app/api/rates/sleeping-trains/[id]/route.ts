import { NextRequest, NextResponse } from 'next/server'
import { normaliseSleepingTrainCabin, SLEEPING_TRAIN_CABIN_ERROR } from '@/lib/rates/sleeping-train-cabins'
import { clientMessage } from '@/lib/api-errors'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('sleeping_train_rates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET sleeping_train_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET sleeping_train_rate catch error:', error)
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
    if (body.cabin_type !== undefined) {
      const cabin = normaliseSleepingTrainCabin(body.cabin_type)
      if (!cabin) {
        return NextResponse.json({ error: SLEEPING_TRAIN_CABIN_ERROR }, { status: 400 })
      }
      updateData.cabin_type = cabin
    }
    if (body.rate_oneway_eur !== undefined) updateData.rate_oneway_eur = parseFloat(body.rate_oneway_eur) || 0
    if (body.rate_roundtrip_eur !== undefined) updateData.rate_roundtrip_eur = body.rate_roundtrip_eur ? parseFloat(body.rate_roundtrip_eur) : null
    if (body.departure_time !== undefined) updateData.departure_time = body.departure_time || null
    if (body.arrival_time !== undefined) updateData.arrival_time = body.arrival_time || null
    if (body.rate_valid_from !== undefined) updateData.rate_valid_from = body.rate_valid_from || null
    if (body.rate_valid_to !== undefined) updateData.rate_valid_to = body.rate_valid_to || null
    if (body.season !== undefined) updateData.season = body.season || null
    if (body.operator_name !== undefined) updateData.operator_name = body.operator_name || null
    if (body.supplier_id !== undefined) updateData.supplier_id = body.supplier_id || null
    if (body.property_id !== undefined) {
      // Optional explicit train link (Phase 3): explicit null clears it, and
      // a stale id also resolves to null rather than saving a broken link.
      const trainProp = await resolveRateProperty(supabaseAdmin, {
        propertyType: 'train',
        supplierId: body.supplier_id || null,
        name: null,
        propertyId: body.property_id,
      })
      updateData.property_id = trainProp.property_id
    }
    if (body.description !== undefined) updateData.description = body.description || null
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data, error } = await supabaseAdmin
      .from('sleeping_train_rates')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT sleeping_train_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT sleeping_train_rate catch error:', error)
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
      .from('sleeping_train_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE sleeping_train_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE sleeping_train_rate catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}