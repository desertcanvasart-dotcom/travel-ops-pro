import { NextRequest, NextResponse } from 'next/server'
import { validateRatePayload } from '@/lib/rate-validation'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
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

    // Include supplier_id in insert (resolved/validated above)
    const newCruise = {
      ...body,
      supplier_id: supplierCheck.supplier_id
    }

    // Check for existing rate with same natural key
    let existingQuery = supabaseAdmin
      .from('nile_cruises')
      .select('id')
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

    let data, error
    if (existing?.length) {
      // Update existing record
      const result = await supabaseAdmin
        .from('nile_cruises')
        .update({ ...newCruise, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id)
        .select(`*, supplier:supplier_id (id, name)`)
        .single()
      data = result.data
      error = result.error
    } else {
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

    return NextResponse.json({ success: true, data, updated: !!existing?.length })
  } catch (error: any) {
    console.error('Error creating cruise:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}