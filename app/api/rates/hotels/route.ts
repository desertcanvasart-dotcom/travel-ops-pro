import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSeasons, legacyColumnMirror } from '@/lib/rates/rate-seasons'
import { validateRatePayload } from '@/lib/rate-validation'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { resolveRateProperty } from '@/lib/suppliers/resolve-property'
import { createActorAdminClient } from '@/lib/supabase-actor'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const city = searchParams.get('city')
    const tier = searchParams.get('tier')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('accommodation_rates')
      .select(`
        *,
        supplier:suppliers(id, name, city, contact_phone, contact_email)
      `)
      .order('property_name')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (city) query = query.eq('city', city)
    if (tier) query = query.eq('tier', tier)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET accommodation_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET accommodation_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // A malformed periods payload reads as "no periods" and the row keeps
    // pricing off its base columns — never a 500 on a rate save.
    const hotelSeasons = sanitizeSeasons(body.seasons, 'accommodation')

    const _rateCheck = validateRatePayload(body)
    if (!_rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: _rateCheck.errors }, { status: 400 })
    }

    const supplierCheck = await validateAndResolveSupplierFields(body, supabaseAdmin)
    if (!supplierCheck.ok) {
      return NextResponse.json({ error: supplierCheck.error }, { status: supplierCheck.status })
    }

    // Supplier-HAS-properties (Phase 2): link the rate to its hotel, creating
    // the property under the supplier when it does not exist yet. The
    // property's canonical name wins over the payload spelling.
    const hotelProp = await resolveRateProperty(supabaseAdmin, {
      propertyType: 'hotel',
      supplierId: supplierCheck.supplier_id,
      name: body.property_name,
      propertyId: body.property_id,
    })

    const newHotel = {
      // Basic info
      service_code: body.service_code || `ACC-${Date.now().toString(36).toUpperCase()}`,
      property_name: hotelProp.name || body.property_name,
      property_id: hotelProp.property_id,
      property_type: body.property_type || 'hotel',
      city: body.city || null,
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
      
      // Dated rate periods (unlimited). When present these are what pricing
      // reads; the first one is mirrored onto the base columns above for
      // readers that have no travel date.
      seasons: hotelSeasons,
      ...legacyColumnMirror(hotelSeasons, 'accommodation'),

      // Rate validity
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      
      // Other
      notes: body.notes || null,
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      is_active: body.is_active !== false
    }

    // Check for existing rate with same natural key (property_name + city + tier)
    const { data: existing } = await supabaseAdmin
      .from('accommodation_rates')
      .select('id')
      .ilike('property_name', newHotel.property_name)
      .eq('city', newHotel.city)
      .eq('tier', newHotel.tier)
      .limit(1)

    let data, error
    if (existing?.length) {
      // Update existing record instead of creating duplicate
      const result = await supabaseAdmin
        .from('accommodation_rates')
        .update({ ...newHotel, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id)
        .select('*')
        .single()
      data = result.data
      error = result.error
    } else {
      const result = await supabaseAdmin
        .from('accommodation_rates')
        .insert(newHotel)
        .select('*')
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('POST accommodation_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, updated: !!existing?.length })
  } catch (error: any) {
    console.error('POST accommodation_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}