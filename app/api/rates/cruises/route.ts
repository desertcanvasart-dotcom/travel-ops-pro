import { NextRequest, NextResponse } from 'next/server'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSeasons, legacyColumnMirror } from '@/lib/rates/rate-seasons'
import { validateRatePayload } from '@/lib/rate-validation'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { createActorAdminClient } from '@/lib/supabase-actor'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const shipName = searchParams.get('ship_name')
    const route = searchParams.get('route')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('nile_cruises')
      .select(`
        *,
        supplier:supplier_id (id, name, city, contact_phone, contact_email, star_rating)
      `)
      .order('ship_name')
      .order('cabin_type')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (shipName) query = query.ilike('ship_name', `%${shipName}%`)
    if (route) query = query.eq('route', route)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error fetching cruises:', error)
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

    const supplierCheck = await validateAndResolveSupplierFields(body, supabaseAdmin)
    if (!supplierCheck.ok) {
      return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
    }

    // Include supplier_id in insert (resolved/validated above).
    // `seasons` is JSONB straight off the request, so it is validated rather
    // than spread through — and the first period is mirrored onto the base
    // columns for readers that have no travel date.
    const cruiseSeasons = sanitizeSeasons(body.seasons, 'cruise')

    // Supplier-HAS-properties (Phase 1): link the rate to its ship, creating
    // the property under the supplier when it does not exist yet. The
    // property's canonical name wins over the payload spelling.
    const ship = await resolveRateProperty(supabaseAdmin, {
      propertyType: 'ship',
      supplierId: supplierCheck.supplier_id,
      name: body.ship_name,
      propertyId: body.property_id,
    })

    const newCruise = {
      ...body,
      seasons: cruiseSeasons,
      ...legacyColumnMirror(cruiseSeasons, 'cruise'),
      supplier_id: supplierCheck.supplier_id,
      // Omitted when null so a database that has not run the phase-1 migration
      // yet still saves the rate.
      ...(ship.property_id ? { property_id: ship.property_id } : {}),
      ...(ship.name ? { ship_name: ship.name } : {})
    }

    // Check for existing rate with same natural key
    let existingQuery = supabaseAdmin
      .from('nile_cruises')
      .select('*')
      .ilike('ship_name', newCruise.ship_name)
    if (newCruise.cabin_type) {
      existingQuery = existingQuery.eq('cabin_type', newCruise.cabin_type)
    } else {
      existingQuery = existingQuery.is('cabin_type', null)
    }
    if (newCruise.route) {
      existingQuery = existingQuery.eq('route', newCruise.route)
    } else {
      existingQuery = existingQuery.is('route', null)
    }
    const { data: existing } = await existingQuery.limit(1)

    // A create never updates. The natural-key match used to be UPDATED in
    // place — so "Duplicate this rate, change the season, save" rewrote the
    // original and nothing new appeared (the train-rates overwrite, same class,
    // #325). An exact duplicate is answered with the existing row instead.
    if (existing?.length) {
      return NextResponse.json({
        success: false,
        error: 'A rate with these details already exists. Edit that rate, or change what makes this one different (supplier, period, class, city) before saving.',
        existing: existing[0],
      }, { status: 409 })
    }
    let data, error
    {
      // Insert new record
      const result = await supabaseAdmin
        .from('nile_cruises')
        .insert([newCruise])
        .select(`*, supplier:supplier_id (id, name)`)
        .single()
      data = result.data
      error = result.error
    }

    if (error) throw error

    return NextResponse.json({ success: true, data, updated: false })
  } catch (error: any) {
    console.error('Error creating cruise:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}