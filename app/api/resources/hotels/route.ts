import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('accommodation_rates')
      .select('*')
      .order('property_name')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('=== HOTELS API POST START ===')
    console.log('Body received:', JSON.stringify(body, null, 2))

    // Minimal insert with only required fields
    const newRate: Record<string, any> = {
      service_code: body.service_code || `HTL-${Date.now()}`,
      property_name: body.property_name,
      property_type: body.property_type || 'hotel',
      board_basis: body.board_basis || 'BB',
      base_rate_eur: parseFloat(body.double_rate_eur) || 0,
      base_rate_non_eur: parseFloat(body.double_rate_non_eur) || 0,
      tier: body.tier || 'standard',
      is_active: body.is_active !== false
    }

    // Add optional fields
    if (body.city) newRate.city = body.city
    if (body.supplier_id) newRate.supplier_id = body.supplier_id
    if (body.supplier_name) newRate.supplier_name = body.supplier_name
    if (body.notes) newRate.notes = body.notes

    console.log('Inserting:', JSON.stringify(newRate, null, 2))

    // Try insert without select first to see if it works
    const { data: insertData, error: insertError, count, status, statusText } = await supabaseAdmin
      .from('accommodation_rates')
      .insert(newRate)
      .select('*')
      .single()

    console.log('Insert result - status:', status, 'statusText:', statusText)
    console.log('Insert data:', insertData)
    console.log('Insert error:', insertError)
    console.log('Count:', count)

    if (insertError) {
      console.error('Supabase insert error:', insertError)
      return NextResponse.json({ 
        success: false, 
        error: insertError.message,
        details: insertError,
        hint: 'Check if RLS is blocking the insert'
      }, { status: 500 })
    }

    if (!insertData) {
      console.error('No data returned from insert - likely RLS issue')
      return NextResponse.json({ 
        success: false, 
        error: 'Insert succeeded but no data returned. This usually means Row Level Security (RLS) is blocking the operation.',
        hint: 'Run: ALTER TABLE accommodation_rates DISABLE ROW LEVEL SECURITY;'
      }, { status: 500 })
    }

    console.log('=== INSERT SUCCESSFUL ===')
    console.log('Inserted data:', insertData)

    return NextResponse.json({ success: true, data: insertData })
  } catch (error: any) {
    console.error('=== HOTELS API POST ERROR ===')
    console.error('Error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    }, { status: 500 })
  }
}