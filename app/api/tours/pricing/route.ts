import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

// ============================================
// TOUR PRICING COLLECTION ROUTE
// File: app/api/tours/pricing/route.ts
// ============================================

// GET - List all pricing records (optionally filter by tour_id)
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    const { searchParams } = new URL(request.url)
    const tourId = searchParams.get('tour_id')
    const pax = searchParams.get('pax')
    const isEuroPassport = searchParams.get('is_euro_passport')

    let query = supabase
      .from('tour_pricing')
      .select('*')
      .order('pax', { ascending: true })

    if (tourId) {
      query = query.eq('tour_id', tourId)
    }

    if (pax) {
      query = query.eq('pax', parseInt(pax))
    }

    if (isEuroPassport !== null && isEuroPassport !== undefined) {
      query = query.eq('is_euro_passport', isEuroPassport === 'true')
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching pricing:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch pricing' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    })

  } catch (error) {
    console.error('Error in pricing GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new pricing record
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()

    if (!body.tour_id || body.pax === undefined || body.is_euro_passport === undefined) {
      return NextResponse.json(
        { success: false, error: 'Tour ID, pax count, and is_euro_passport are required' },
        { status: 400 }
      )
    }

    const pricingData = {
      tour_id: body.tour_id,
      pax: body.pax,
      is_euro_passport: body.is_euro_passport,
      total_accommodation: body.total_accommodation || 0,
      total_meals: body.total_meals || 0,
      total_guides: body.total_guides || 0,
      total_transportation: body.total_transportation || 0,
      total_entrances: body.total_entrances || 0,
      grand_total: body.grand_total || 0,
      per_person_total: body.per_person_total || 0,
      calculated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('tour_pricing')
      .insert([pricingData])
      .select()
      .single()

    if (error) {
      console.error('Error creating pricing:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create pricing' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Pricing created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in pricing POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Bulk upsert pricing (for calculating all pax levels at once)
export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()

    if (!body.tour_id || !body.pricing_records || !Array.isArray(body.pricing_records)) {
      return NextResponse.json(
        { success: false, error: 'Tour ID and pricing_records array are required' },
        { status: 400 }
      )
    }

    // Delete existing pricing for this tour
    await supabase
      .from('tour_pricing')
      .delete()
      .eq('tour_id', body.tour_id)

    // Insert new pricing records
    const pricingRecords = body.pricing_records.map((record: any) => ({
      tour_id: body.tour_id,
      pax: record.pax,
      is_euro_passport: record.is_euro_passport,
      total_accommodation: record.total_accommodation || 0,
      total_meals: record.total_meals || 0,
      total_guides: record.total_guides || 0,
      total_transportation: record.total_transportation || 0,
      total_entrances: record.total_entrances || 0,
      grand_total: record.grand_total || 0,
      per_person_total: record.per_person_total || 0,
      calculated_at: new Date().toISOString()
    }))

    const { data, error } = await supabase
      .from('tour_pricing')
      .insert(pricingRecords)
      .select()

    if (error) {
      console.error('Error upserting pricing:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update pricing' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: `${data.length} pricing records updated`
    })

  } catch (error) {
    console.error('Error in pricing PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}