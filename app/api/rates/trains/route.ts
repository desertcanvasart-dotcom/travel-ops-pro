import { NextRequest, NextResponse } from 'next/server'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'
import { operatorNameForSupplier } from '@/lib/suppliers/operator-name'
import { clientMessage } from '@/lib/api-errors'
import { whereNullable, describeValidity } from '@/lib/rates/natural-key'
import { validateRatePayload } from '@/lib/rate-validation'
import { createActorAdminClient } from '@/lib/supabase-actor'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const originCity = searchParams.get('origin_city')
    const destinationCity = searchParams.get('destination_city')
    const classType = searchParams.get('class_type')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('train_rates')
      .select('*, supplier_properties(name)')
      .order('origin_city')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (originCity) query = query.eq('origin_city', originCity)
    if (destinationCity) query = query.eq('destination_city', destinationCity)
    if (classType) query = query.eq('class_type', classType)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET train_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET train_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }
    const trainProp = await resolveRateProperty(supabaseAdmin, {
      propertyType: 'train',
      supplierId: body.supplier_id || null,
      name: null,
      propertyId: body.property_id,
    })


    const newRate = {
      service_code: body.service_code || `TRN-${Date.now().toString(36).toUpperCase()}`,
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null,
      class_type: body.class_type || null,
      rate_eur: parseFloat(body.rate_eur) || 0,
      duration_hours: body.duration_hours ? parseFloat(body.duration_hours) : null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      // The supplier IS the operator (lib/suppliers/operator-name.ts).
      operator_name: await operatorNameForSupplier(supabaseAdmin, body.supplier_id, body.operator_name),
      supplier_id: body.supplier_id || null,
      // Optional explicit link to one of the supplier's trains (Phase 3).
      // Validated through the resolver's propertyId path — a stale id yields
      // null — and omitted when absent so an unmigrated database still saves.
      ...(trainProp.property_id ? { property_id: trainProp.property_id } : {}),
      departure_times: body.departure_times || null,
      description: body.description || null,
      notes: body.notes || null,
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      // Throughout-guide fare (migration 20260904_guide_fares): NULL = the
      // guide pays the customer rate. Included only when sent, so an
      // unmigrated database still saves.
      ...(body.guide_rate !== undefined && body.guide_rate !== null && body.guide_rate !== ''
        ? { guide_rate: parseFloat(body.guide_rate) }
        : {}),
      is_active: body.is_active !== false
    }

    // The FULL natural key, or a create silently overwrites (lib/rates/natural-key.ts).
    // Origin + destination + class_type + supplier was the old key: it had no
    // train and no validity period, so a second train's price on the same route
    // REPLACED the first (2026-08-31 / 2026-09-02, thirteen creates, zero inserts).
    let existingQuery = supabaseAdmin
      .from('train_rates')
      .select('*')
    existingQuery = whereNullable(existingQuery, 'origin_city', newRate.origin_city, { ilike: true })
    existingQuery = whereNullable(existingQuery, 'destination_city', newRate.destination_city, { ilike: true })
    existingQuery = whereNullable(existingQuery, 'class_type', newRate.class_type)
    // A rate belongs to a supplier: two companies may quote the same service.
    existingQuery = whereNullable(existingQuery, 'supplier_id', newRate.supplier_id)
    // ...and to ONE of that supplier's trains.
    existingQuery = whereNullable(existingQuery, 'property_id', trainProp.property_id)
    // ...for ONE validity period. Next season's price is a new row, not an edit.
    existingQuery = whereNullable(existingQuery, 'rate_valid_from', newRate.rate_valid_from)
    existingQuery = whereNullable(existingQuery, 'rate_valid_to', newRate.rate_valid_to)
    const { data: existing } = await existingQuery.limit(1)

    if (existing?.length) {
      // Never update from a create. The form switches to editing THIS row so
      // nothing the user typed is lost — but the overwrite is now their call.
      const train = trainProp.name ? `"${trainProp.name}" ` : ''
      // Name the row as it is RECORDED (canonical spelling), not as typed.
      const hit = existing[0]
      const where = `${hit.origin_city ?? '?'} → ${hit.destination_city ?? '?'} (${hit.class_type ?? 'any class'})`
      return NextResponse.json({
        success: false,
        error: `A ${train}rate for ${where}${describeValidity(hit.rate_valid_from, hit.rate_valid_to)} already exists. Edit that rate instead of creating a second one.`,
        existing: existing[0],
      }, { status: 409 })
    }

    const { data, error } = await supabaseAdmin
      .from('train_rates')
      .insert(newRate)
      .select('*')
      .single()

    if (error) {
      console.error('POST train_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, updated: false }, { status: 201 })
  } catch (error: any) {
    console.error('POST train_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}