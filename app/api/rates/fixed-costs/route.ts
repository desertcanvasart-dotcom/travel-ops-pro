import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { validateRatePayload } from '@/lib/rate-validation'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { clearFixedCostsCache } from '@/lib/fixed-costs'

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('fixed_daily_costs')
      .select('*')
      .order('cost_type')

    if (error) {
      console.error('GET fixed_daily_costs error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET fixed_daily_costs catch error:', error)
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

    // Discover actual table columns
    const { data: sampleRow } = await supabaseAdmin
      .from('fixed_daily_costs')
      .select('*')
      .limit(1)
      .single()
    const tableColumns = sampleRow
      ? new Set(Object.keys(sampleRow))
      : new Set(['cost_type', 'cost_per_person_per_day', 'is_active'])

    const allFields: Record<string, any> = {
      cost_type: body.cost_type,
      cost_per_person_per_day: parseFloat(body.cost_per_person_per_day) || 0,
      description: body.description || null,
      ...('rate_currency' in body ? { rate_currency: body.rate_currency || null } : {}),
      is_active: body.is_active !== false,
    }

    // Only include columns that exist in the table
    const newCost: Record<string, any> = {}
    for (const [col, val] of Object.entries(allFields)) {
      if (tableColumns.has(col)) {
        newCost[col] = val
      }
    }

    const { data, error } = await supabaseAdmin
      .from('fixed_daily_costs')
      .insert(newCost)
      .select('*')
      .single()

    if (error) {
      console.error('POST fixed_daily_costs error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    clearFixedCostsCache()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('POST fixed_daily_costs catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updateFields } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })
    }

    // Discover actual table columns from the existing record
    const { data: existing } = await supabaseAdmin
      .from('fixed_daily_costs')
      .select('*')
      .eq('id', id)
      .single()
    const tableColumns = existing
      ? new Set(Object.keys(existing))
      : new Set(['cost_type', 'cost_per_person_per_day', 'is_active'])

    const updateData: Record<string, any> = {}
    if (tableColumns.has('updated_at')) updateData.updated_at = new Date().toISOString()
    if (updateFields.cost_type !== undefined && tableColumns.has('cost_type')) updateData.cost_type = updateFields.cost_type
    if (updateFields.cost_per_person_per_day !== undefined && tableColumns.has('cost_per_person_per_day')) updateData.cost_per_person_per_day = parseFloat(updateFields.cost_per_person_per_day) || 0
    if (updateFields.description !== undefined && tableColumns.has('description')) updateData.description = updateFields.description || null
    if (updateFields.rate_currency !== undefined && tableColumns.has('rate_currency')) updateData.rate_currency = updateFields.rate_currency || null
    if (updateFields.is_active !== undefined && tableColumns.has('is_active')) updateData.is_active = updateFields.is_active

    const { data, error } = await supabaseAdmin
      .from('fixed_daily_costs')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT fixed_daily_costs error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    clearFixedCostsCache()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT fixed_daily_costs catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// DELETE — remove a fixed cost permanently. Note for 'Water Bottle': the
// engine falls back to a built-in default (lib/fixed-costs DEFAULTS) when no
// row exists, so deleting the water row does NOT price water at zero — the
// UI's confirm dialog says so. Deactivating (is_active=false) is the
// reversible alternative and zeroes nothing either.
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('fixed_daily_costs')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE fixed_daily_costs error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    clearFixedCostsCache()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE fixed_daily_costs catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
