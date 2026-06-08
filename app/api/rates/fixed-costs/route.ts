import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clearFixedCostsCache } from '@/lib/fixed-costs'
import { clientMessage } from '@/lib/api-errors'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('fixed_daily_costs')
      .select('*')
      .order('cost_type')

    if (error) {
      console.error('GET fixed_daily_costs error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load fixed costs') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET fixed_daily_costs catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load fixed costs') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

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
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to save fixed cost') }, { status: 500 })
    }

    clearFixedCostsCache()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('POST fixed_daily_costs catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to save fixed cost') }, { status: 500 })
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
    if (updateFields.is_active !== undefined && tableColumns.has('is_active')) updateData.is_active = updateFields.is_active

    const { data, error } = await supabaseAdmin
      .from('fixed_daily_costs')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT fixed_daily_costs error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to save fixed cost') }, { status: 500 })
    }

    clearFixedCostsCache()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT fixed_daily_costs catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to save fixed cost') }, { status: 500 })
  }
}
