import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// Actor-attributed service-role client (lib/supabase-actor): rate-table
// writes from here reach fn_rate_audit_trigger, and without the actor
// header every one of them lands in rate_audit_log as changed_by NULL —
// which the rate-change digest then reports as "unknown user /
// 不明なユーザー" to the whole team (audit AUT-H04).
const supabaseAdmin = createServerClient()

const VEHICLE_TIERS = ['sedan', 'minivan', 'van', 'minibus', 'bus'] as const

// Helper to parse tiered rate fields from request body
function parseTieredRates(body: any) {
  const rates: Record<string, any> = {}
  for (const tier of VEHICLE_TIERS) {
    if (body[`${tier}_rate_eur`] !== undefined) {
      rates[`${tier}_rate_eur`] = body[`${tier}_rate_eur`] !== null ? parseFloat(body[`${tier}_rate_eur`]) || null : null
    }
    if (body[`${tier}_rate_non_eur`] !== undefined) {
      rates[`${tier}_rate_non_eur`] = body[`${tier}_rate_non_eur`] !== null ? parseFloat(body[`${tier}_rate_non_eur`]) || null : null
    }
    if (body[`${tier}_capacity_min`] !== undefined) {
      rates[`${tier}_capacity_min`] = body[`${tier}_capacity_min`] !== null ? parseInt(body[`${tier}_capacity_min`]) : null
    }
    if (body[`${tier}_capacity_max`] !== undefined) {
      rates[`${tier}_capacity_max`] = body[`${tier}_capacity_max`] !== null ? parseInt(body[`${tier}_capacity_max`]) : null
    }
  }
  return rates
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const city = searchParams.get('city')
    const serviceType = searchParams.get('serviceType')
    const supplierId = searchParams.get('supplier_id')
    const activeOnly = searchParams.get('activeOnly') === 'true'

    let query = supabaseAdmin
      .from('transportation_rates')
      .select(`
        *,
        supplier:supplier_id (id, name, city, contact_phone, contact_email)
      `)
      .order('city', { ascending: true })
      .order('service_type', { ascending: true })

    if (city) query = query.eq('city', city)
    if (serviceType) query = query.eq('service_type', serviceType)
    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching transportation rates:', error)
      return NextResponse.json({ error: 'Failed to fetch transportation rates' }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error in transportation rates GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.city || !body.service_type) {
      return NextResponse.json({ error: 'City and service type are required' }, { status: 400 })
    }

    // Parse tiered rates
    const tieredRates = parseTieredRates(body)

    // Must have at least one vehicle tier rate
    const hasAnyRate = VEHICLE_TIERS.some(t => tieredRates[`${t}_rate_eur`] != null && tieredRates[`${t}_rate_eur`] > 0)
    if (!hasAnyRate) {
      return NextResponse.json({ error: 'At least one vehicle tier rate is required' }, { status: 400 })
    }

    const serviceCode = body.service_code ||
      `${body.city.toUpperCase().replace(/\s+/g, '-')}-${body.service_type.toUpperCase().replace(/_/g, '-')}`

    const newRate: Record<string, any> = {
      service_code: serviceCode,
      service_type: body.service_type,
      city: body.city,
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null,
      duration: body.duration || null,
      area: body.area || null,
      includes: body.includes || null,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || new Date().toISOString().split('T')[0],
      rate_valid_to: body.rate_valid_to || '2099-12-31',
      supplier_id: body.supplier_id || null,
      supplier_name: body.supplier_name || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      // Phase B (per-rate currency) named the WRONG route family for this
      // form — it saves through /api/resources/transportation, so the chosen
      // currency was silently dropped here. Only-when-present, so old
      // clients and unmigrated databases are untouched.
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      ...tieredRates
    }

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .insert([newRate])
      .select(`*, supplier:supplier_id (id, name, city)`)
      .single()

    if (error) {
      console.error('Error creating transportation rate:', error)
      return NextResponse.json({ error: `Failed to create: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Error in transportation rates POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
