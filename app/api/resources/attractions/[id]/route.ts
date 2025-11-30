import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Create admin client for server-side operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch single attraction by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const { data, error } = await supabaseAdmin
      .from('entrance_fees')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch attraction' },
      { status: 500 }
    )
  }
}

// PUT - Update attraction
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()

    // Validate required fields
    if (!body.attraction_name || !body.city) {
      return NextResponse.json(
        { success: false, error: 'Attraction name and city are required' },
        { status: 400 }
      )
    }

    const updateData = {
      service_code: body.service_code,
      attraction_name: body.attraction_name,
      city: body.city,
      fee_type: body.fee_type || 'standard',
      eur_rate: body.eur_rate || 0,
      non_eur_rate: body.non_eur_rate || 0,
      egyptian_rate: body.egyptian_rate || null,
      student_discount_percentage: body.student_discount_percentage || null,
      child_discount_percent: body.child_discount_percent || null,
      season: body.season || 'all_year',
      rate_valid_from: body.rate_valid_from,
      rate_valid_to: body.rate_valid_to,
      category: body.category || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('entrance_fees')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Attraction updated successfully'
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update attraction' },
      { status: 500 }
    )
  }
}

// DELETE - Delete attraction
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const { error } = await supabaseAdmin
      .from('entrance_fees')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Attraction deleted successfully'
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete attraction' },
      { status: 500 }
    )
  }
}