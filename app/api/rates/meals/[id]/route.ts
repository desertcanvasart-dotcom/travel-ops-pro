import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('meal_rates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET meal_rate error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load meal rate') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET meal_rate catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load meal rate') }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // First, fetch the existing record to discover actual table columns
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('meal_rates')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      console.error('PUT meal_rate: record not found:', fetchError)
      return NextResponse.json({ success: false, error: 'Record not found' }, { status: 404 })
    }

    // Only update columns that actually exist in the table (based on fetched record keys)
    const existingColumns = new Set(Object.keys(existing))
    const updateData: Record<string, any> = {}

    // Map body fields to update data, only if the column exists in the table
    const fieldMap: Record<string, (val: any) => any> = {
      service_code: (v) => v,
      restaurant_name: (v) => v,
      meal_type: (v) => v || null,
      cuisine_type: (v) => v || null,
      restaurant_type: (v) => v || null,
      city: (v) => v || null,
      base_rate_eur: (v) => parseFloat(v) || 0,
      base_rate_non_eur: (v) => parseFloat(v) || 0,
      season: (v) => v || null,
      rate_valid_from: (v) => v || null,
      rate_valid_to: (v) => v || null,
      supplier_id: (v) => v || null,
      supplier_name: (v) => v || null,
      tier: (v) => v || null,
      meal_category: (v) => v || null,
      dietary_options: (v) => v || [],
      per_person_rate: (v) => v,
      minimum_pax: (v) => v ? parseInt(v) : null,
      notes: (v) => v || null,
      is_active: (v) => v,
      is_preferred: (v) => v === true,
    }

    for (const [field, transform] of Object.entries(fieldMap)) {
      if (body[field] !== undefined && existingColumns.has(field)) {
        updateData[field] = transform(body[field])
      }
    }

    // Always set updated_at if the column exists
    if (existingColumns.has('updated_at')) {
      updateData.updated_at = new Date().toISOString()
    }

    console.log(`[Meal Rate PUT] Updating ${id}. Table columns: [${[...existingColumns].join(', ')}]. Update payload:`, JSON.stringify(updateData))

    let { data, error } = await supabaseAdmin
      .from('meal_rates')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    // If a check constraint fails (e.g. tier_check), retry without the offending field
    if (error && error.code === '23514') {
      console.warn('PUT meal_rate check constraint failed:', error.message, '— retrying without constrained fields')

      // Identify which constraint failed and remove that field
      const constraintField = error.message.includes('tier_check') ? 'tier'
        : error.message.includes('meal_category') ? 'meal_category'
        : error.message.includes('restaurant_type') ? 'restaurant_type'
        : null

      if (constraintField && updateData[constraintField] !== undefined) {
        delete updateData[constraintField]
        console.log(`[Meal Rate PUT] Retrying without "${constraintField}":`, JSON.stringify(updateData))

        const retry = await supabaseAdmin
          .from('meal_rates')
          .update(updateData)
          .eq('id', id)
          .select('*')
          .single()

        if (retry.error) {
          console.error('PUT meal_rate retry also failed:', retry.error)
          return NextResponse.json({ success: false, error: clientMessage(retry.error, 'Failed to save meal rate') }, { status: 500 })
        }

        // Log the constraint issue so we can fix form values
        console.warn(`[Meal Rate PUT] Succeeded without "${constraintField}". The value "${body[constraintField]}" is not allowed by the DB constraint. Please update the allowed values in Supabase or the form.`)
        return NextResponse.json({ success: true, data: retry.data, warning: `The "${constraintField}" value "${body[constraintField]}" is not allowed by the database. The record was saved without updating that field.` })
      }

      console.error('PUT meal_rate check constraint failed and could not identify field:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to save meal rate') }, { status: 500 })
    }

    if (error) {
      console.error('PUT meal_rate update failed:', error, 'updateData:', updateData)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to save meal rate') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT meal_rate catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to save meal rate') }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await supabaseAdmin
      .from('meal_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE meal_rate error:', error)
      
      // Check for foreign key constraint violation
      if (error.code === '23503' || error.message.includes('foreign key constraint')) {
        return NextResponse.json({ 
          success: false, 
          error: 'This meal rate cannot be deleted because it is being used in one or more tour itineraries. Please remove it from those tours first, or deactivate the rate instead of deleting it.'
        }, { status: 409 }) // 409 Conflict
      }
      
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to delete meal rate') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE meal_rate catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to delete meal rate') }, { status: 500 })
  }
}