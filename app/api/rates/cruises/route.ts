import { NextRequest, NextResponse } from 'next/server'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'
import { clientMessage } from '@/lib/api-errors'
import { seasonsWrite, seasonsPayloadError, datedPeriodCount, tooManyPeriodsMessage } from '@/lib/rates/rate-seasons'
import { pickCruiseColumns, validityError } from '@/lib/rates/accommodation-payload'
import { findDuplicateCruise, isUniqueViolation, CRUISE_KEY_DESCRIPTION } from '@/lib/rates/accommodation-duplicates'
import { ownJoinedSupplier } from '@/lib/rates/joined-supplier'
import { ownSupplierFilterId } from '@/lib/suppliers/supplier-org'
import { sanitizeSupplements } from '@/lib/rates/supplements'
import { sanitizeSailingDays } from '@/lib/rates/cruise-sailing'
import { validateRatePayload } from '@/lib/rate-validation'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const shipName = searchParams.get('ship_name')
    const route = searchParams.get('route')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('nile_cruises')
      .select(`
        *,
        supplier:supplier_id (id, name, city, contact_phone, contact_email, star_rating, org_id)
      `)
      .eq('org_id', orgId)
      .order('ship_name')
      .order('cabin_type')

    // Only one of the caller's company's suppliers (lib/suppliers/supplier-org).
    if (supplierId) query = query.eq('supplier_id', await ownSupplierFilterId(supabaseAdmin, supplierId))
    if (shipName) query = query.ilike('ship_name', `%${shipName}%`)
    // The column is route_name; `route` does not exist and answered 500.
    if (route) query = query.eq('route_name', route)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) throw error

    // Another company's supplier on a row reads as no supplier (lib/rates/joined-supplier).
    return NextResponse.json({ success: true, data: ownJoinedSupplier(data, orgId) })
  } catch (error: any) {
    console.error('Error fetching cruises:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
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
    // Too many periods, a backwards period or a negative rate: refused (400).
    const periodLimit = tooManyPeriodsMessage(datedPeriodCount(body.seasons))
      ?? seasonsPayloadError(body.seasons, 'cruise')
      ?? validityError(body.rate_valid_from, body.rate_valid_to)
    if (periodLimit) return NextResponse.json({ success: false, error: periodLimit }, { status: 400 })

    // Supplier-HAS-properties (Phase 1): link the rate to its ship, creating
    // the property under the supplier when it does not exist yet. The
    // property's canonical name wins over the payload spelling.
    const ship = await resolveRateProperty(supabaseAdmin, {
      propertyType: 'ship',
      supplierId: supplierCheck.supplier_id,
      name: body.ship_name,
      propertyId: body.property_id,
    })

    // The form's columns only (lib/rates/accommodation-payload) — never the raw body:
    // it carried `id`, `created_at`, and a property_id the resolver refused.
    const newCruise: Record<string, unknown> = {
      ...pickCruiseColumns(body),
      ...('seasons' in body ? seasonsWrite(body.seasons, 'cruise') : { seasons: null }),
      // Known weekday keys only, in week order — the one place that decides
      // what a sailing day may be.
      sailing_days: sanitizeSailingDays(body.sailing_days),
      // The supplements the ship carries; their prices ride in the periods above.
      supplements: sanitizeSupplements(body.supplements),
      supplier_id: supplierCheck.supplier_id,
      // The RESOLVED ship or none: a property_id the resolver dropped
      // (another company's ship, another supplier's) is never written.
      property_id: ship.property_id ?? null,
      ...(ship.name ? { ship_name: ship.name } : {})
    }

    // The full natural key (lib/rates/accommodation-duplicates).
    const dup = await findDuplicateCruise(supabaseAdmin, orgId, newCruise)
    if (!dup.ok) throw new Error(dup.error)

    // A create never updates. The natural-key match used to be UPDATED in
    // place — so "Duplicate this rate, change the season, save" rewrote the
    // original and nothing new appeared (the train-rates overwrite, same class,
    // #325). An exact duplicate is answered with the existing row instead.
    if (dup.existing) {
      return NextResponse.json({
        success: false,
        error: `A rate with the same ${CRUISE_KEY_DESCRIPTION} already exists. Edit that rate, or change one of those before saving.`,
        existing: dup.existing,
      }, { status: 409 })
    }
    let data, error
    {
      // Insert new record
      const result = await supabaseAdmin
        .from('nile_cruises')
        .insert([{ ...newCruise, org_id: orgId }])
        .select(`*, supplier:supplier_id (id, name)`)
        .single()
      data = result.data
      error = result.error
    }

    if (isUniqueViolation(error)) {
      return NextResponse.json({ success: false, error: `Cruise code ${String(newCruise.cruise_code ?? '')} is already used by another rate. Type another Cruise Code.` }, { status: 409 })
    }
    if (error) throw error

    return NextResponse.json({ success: true, data, updated: false })
  } catch (error: any) {
    console.error('Error creating cruise:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}