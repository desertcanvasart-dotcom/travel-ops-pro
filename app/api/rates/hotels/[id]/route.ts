import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { seasonsWrite, seasonsPayloadError, datedPeriodCount, tooManyPeriodsMessage } from '@/lib/rates/rate-seasons'
import { validateRatePayload } from '@/lib/rate-validation'
import { ownJoinedSupplier } from '@/lib/rates/joined-supplier'
import { rateUsage, rateInUseMessage } from '@/lib/rates/rate-in-use'
import { isForeignKeyViolation } from '@/lib/rates/accommodation-duplicates'
import { sanitizeSupplements } from '@/lib/rates/supplements'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    if (!(await rowInOrg(supabaseAdmin, 'accommodation_rates', id, orgId))) return notFoundInOrg('Rate')

    const { data, error } = await supabaseAdmin
      .from('accommodation_rates')
      .select(`
        *,
        supplier:suppliers(id, name, city, contact_phone, contact_email, org_id)
      `)
      .eq('org_id', orgId)
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET accommodation_rates by id error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: ownJoinedSupplier([data], orgId)[0] })
  } catch (error: any) {
    console.error('GET accommodation_rates by id catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    if (!(await rowInOrg(supabaseAdmin, 'accommodation_rates', id, orgId))) return notFoundInOrg('Rate')
    const body = await request.json()
    // Too many periods, a period that ends before it starts, or a negative
    // rate is refused (400) — never saved as "no periods".
    const periodLimit = tooManyPeriodsMessage(datedPeriodCount(body.seasons))
      ?? seasonsPayloadError(body.seasons, 'accommodation')
    if (periodLimit) return NextResponse.json({ success: false, error: periodLimit }, { status: 400 })

    // The same money checks as the create (a negative legacy column saved here).
    const rateCheck = validateRatePayload(body)
    if (!rateCheck.ok) {
      return NextResponse.json({ success: false, error: 'Invalid rate values', violations: rateCheck.errors }, { status: 400 })
    }

    const supplierCheck = await validateAndResolveSupplierFields(body, supabaseAdmin)
    if (!supplierCheck.ok) {
      return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
    }

    const hotelProp = await resolveRateProperty(supabaseAdmin, {
      propertyType: 'hotel',
      supplierId: supplierCheck.supplier_id,
      name: body.property_name,
      propertyId: body.property_id,
    })

    const updateData = {
      // Basic info
      service_code: body.service_code,
      property_name: hotelProp.name || body.property_name,
      ...(hotelProp.property_id ? { property_id: hotelProp.property_id } : {}),
      property_type: body.property_type || 'hotel',
      city: body.city || null,
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      board_basis: body.board_basis || 'BB',
      tier: body.tier || 'standard',
      supplier_id: supplierCheck.supplier_id,
      supplier_name: supplierCheck.supplier_name,
      
      // Hotel contacts
      contact_name: body.contact_name || null,
      contact_email: body.contact_email || null,
      contact_phone: body.contact_phone || null,
      reservations_email: body.reservations_email || null,
      reservations_phone: body.reservations_phone || null,
      
      // Low Season dates
      low_season_from: body.low_season_from || null,
      low_season_to: body.low_season_to || null,
      
      // Low Season rates - Per Person EUR
      pp_double_eur: parseFloat(body.pp_double_eur) || 0,
      single_supp_eur: parseFloat(body.single_supp_eur) || 0,
      triple_red_eur: parseFloat(body.triple_red_eur) || 0,

      // Low Season rates - Per Person Non-EUR
      pp_double_non_eur: parseFloat(body.pp_double_non_eur) || 0,
      single_supp_non_eur: parseFloat(body.single_supp_non_eur) || 0,
      triple_red_non_eur: parseFloat(body.triple_red_non_eur) || 0,

      // High Season dates
      high_season_from: body.high_season_from || null,
      high_season_to: body.high_season_to || null,

      // High Season rates - Per Person EUR
      high_pp_double_eur: parseFloat(body.high_pp_double_eur) || 0,
      high_single_supp_eur: parseFloat(body.high_single_supp_eur) || 0,
      high_triple_red_eur: parseFloat(body.high_triple_red_eur) || 0,

      // High Season rates - Per Person Non-EUR
      high_pp_double_non_eur: parseFloat(body.high_pp_double_non_eur) || 0,
      high_single_supp_non_eur: parseFloat(body.high_single_supp_non_eur) || 0,
      high_triple_red_non_eur: parseFloat(body.high_triple_red_non_eur) || 0,

      // Peak Season dates (Period 1)
      peak_season_from: body.peak_season_from || null,
      peak_season_to: body.peak_season_to || null,

      // Peak Season dates (Period 2 - optional)
      peak_season_2_from: body.peak_season_2_from || null,
      peak_season_2_to: body.peak_season_2_to || null,

      // Peak Season rates - Per Person EUR
      peak_pp_double_eur: parseFloat(body.peak_pp_double_eur) || 0,
      peak_single_supp_eur: parseFloat(body.peak_single_supp_eur) || 0,
      peak_triple_red_eur: parseFloat(body.peak_triple_red_eur) || 0,

      // Peak Season rates - Per Person Non-EUR
      peak_pp_double_non_eur: parseFloat(body.peak_pp_double_non_eur) || 0,
      peak_single_supp_non_eur: parseFloat(body.peak_single_supp_non_eur) || 0,
      peak_triple_red_non_eur: parseFloat(body.peak_triple_red_non_eur) || 0,
      
      // Dated rate periods (up to six), only when the body sends them. The
      // first is mirrored onto the base columns above for readers that have
      // no travel date; an EMPTY list clears the old windows above, so
      // removing every period sticks instead of bringing "Low / High / Peak
      // Season" back at their old prices (rate-seasons seasonsWrite).
      ...('seasons' in body ? seasonsWrite(body.seasons, 'accommodation') : {}),
      // The supplements the rate carries (their prices ride in the periods
      // above). Only when the body speaks of them: a caller that does not
      // (the bulk importer) leaves the list as it is.
      ...('supplements' in body ? { supplements: sanitizeSupplements(body.supplements) } : {}),

      // Rate validity
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      
      // Other
      notes: body.notes || null,
      is_active: body.is_active !== false,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('accommodation_rates')
      .update(updateData)
      .eq('org_id', orgId)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT accommodation_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT accommodation_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    if (!(await rowInOrg(supabaseAdmin, 'accommodation_rates', id, orgId))) return notFoundInOrg('Rate')

    // Refused while a tour, programme or Pricing Grid line still uses it
    // (lib/rates/rate-in-use): the reason, not "Internal server error".
    const inUse = rateInUseMessage(await rateUsage(supabaseAdmin, 'accommodation_rates', id, orgId))
    if (inUse) return NextResponse.json({ success: false, error: inUse }, { status: 409 })

    const { error } = await supabaseAdmin
      .from('accommodation_rates')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id)

    if (isForeignKeyViolation(error)) {
      return NextResponse.json({ success: false, error: 'This rate is still used elsewhere. Switch it off (untick Active) instead of deleting it.' }, { status: 409 })
    }
    if (error) {
      console.error('DELETE accommodation_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Hotel deleted successfully' })
  } catch (error: any) {
    console.error('DELETE accommodation_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}