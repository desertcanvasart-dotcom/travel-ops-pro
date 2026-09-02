import { NextRequest, NextResponse } from 'next/server'
import { normaliseSleepingTrainCabin, SLEEPING_TRAIN_CABIN_ERROR } from '@/lib/rates/sleeping-train-cabins'
import { clientMessage } from '@/lib/api-errors'
import { whereNullable, describeValidity } from '@/lib/rates/natural-key'
import { validateRatePayload } from '@/lib/rate-validation'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'
import { operatorNameForSupplier } from '@/lib/suppliers/operator-name'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const originCity = searchParams.get('origin_city')
    const destinationCity = searchParams.get('destination_city')
    const cabinType = searchParams.get('cabin_type')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('sleeping_train_rates')
      .select('*, supplier_properties(name)')
      .order('origin_city')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (originCity) query = query.eq('origin_city', originCity)
    if (destinationCity) query = query.eq('destination_city', destinationCity)
    if (cabinType) query = query.eq('cabin_type', cabinType)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET sleeping_train_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET sleeping_train_rates catch error:', error)
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

    // Two cabins, by operator decision; the column has no CHECK so this is it.
    const cabin = normaliseSleepingTrainCabin(body.cabin_type)
    if (!cabin) {
      return NextResponse.json({ error: SLEEPING_TRAIN_CABIN_ERROR }, { status: 400 })
    }

    // Optional explicit link to one of the supplier's trains (Phase 3);
    // a stale id resolves to null, and null is omitted so an unmigrated
    // database still saves.
    const trainProp = await resolveRateProperty(supabaseAdmin, {
      propertyType: 'train',
      supplierId: body.supplier_id || null,
      name: null,
      propertyId: body.property_id,
    })

    const newRate = {
      service_code: body.service_code || `SLP-${Date.now().toString(36).toUpperCase()}`,
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null,
      cabin_type: cabin,
      rate_oneway_eur: parseFloat(body.rate_oneway_eur) || 0,
      rate_roundtrip_eur: body.rate_roundtrip_eur ? parseFloat(body.rate_roundtrip_eur) : null,
      departure_time: body.departure_time || null,
      arrival_time: body.arrival_time || null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      season: body.season || null,
      // The supplier IS the operator (lib/suppliers/operator-name.ts).
      operator_name: await operatorNameForSupplier(supabaseAdmin, body.supplier_id, body.operator_name),
      supplier_id: body.supplier_id || null,
      ...(trainProp.property_id ? { property_id: trainProp.property_id } : {}),
      description: body.description || null,
      notes: body.notes || null,
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      is_active: body.is_active !== false
    }

    // The FULL natural key, or a create silently overwrites (lib/rates/natural-key.ts).
    // Origin + destination + cabin_type + supplier was the old key: it had no
    // train and no validity period, so a second train's price on the same route
    // REPLACED the first (2026-08-31 / 2026-09-02, thirteen creates, zero inserts).
    let existingQuery = supabaseAdmin
      .from('sleeping_train_rates')
      .select('*')
    existingQuery = whereNullable(existingQuery, 'origin_city', newRate.origin_city, { ilike: true })
    existingQuery = whereNullable(existingQuery, 'destination_city', newRate.destination_city, { ilike: true })
    existingQuery = whereNullable(existingQuery, 'cabin_type', newRate.cabin_type)
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
      const where = `${hit.origin_city ?? '?'} → ${hit.destination_city ?? '?'} (${hit.cabin_type ?? 'any cabin'})`
      return NextResponse.json({
        success: false,
        error: `A ${train}rate for ${where}${describeValidity(hit.rate_valid_from, hit.rate_valid_to)} already exists. Edit that rate instead of creating a second one.`,
        existing: existing[0],
      }, { status: 409 })
    }

    const { data, error } = await supabaseAdmin
      .from('sleeping_train_rates')
      .insert(newRate)
      .select('*')
      .single()

    if (error) {
      console.error('POST sleeping_train_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, updated: false }, { status: 201 })
  } catch (error: any) {
    console.error('POST sleeping_train_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}