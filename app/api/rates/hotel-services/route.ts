// app/api/rates/hotel-services/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { clientMessage } from '@/lib/api-errors'

export async function GET() {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('hotel_staff_rates')
      .select('*')
      .order('service_type')
      .order('hotel_category')

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET hotel_staff_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load hotel service rates') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()

    // Normalize empty destination to null (means "all destinations")
    if (body.destination === '' || body.destination === undefined) {
      body.destination = null
    }

    // Check for existing rate with same natural key
    let existingQuery = supabase
      .from('hotel_staff_rates')
      .select('id')
    if (body.service_type) {
      existingQuery = existingQuery.eq('service_type', body.service_type)
    } else {
      existingQuery = existingQuery.is('service_type', null)
    }
    if (body.hotel_category) {
      existingQuery = existingQuery.eq('hotel_category', body.hotel_category)
    } else {
      existingQuery = existingQuery.is('hotel_category', null)
    }
    if (body.destination) {
      existingQuery = existingQuery.eq('destination', body.destination)
    } else {
      existingQuery = existingQuery.is('destination', null)
    }
    const { data: existing } = await existingQuery.limit(1)

    let data, error
    if (existing?.length) {
      // Update existing record
      const result = await supabase
        .from('hotel_staff_rates')
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id)
        .select()
        .single()
      data = result.data
      error = result.error
    } else {
      // Insert new record
      const result = await supabase
        .from('hotel_staff_rates')
        .insert([body])
        .select()
        .single()
      data = result.data
      error = result.error
    }

    if (error) throw error

    return NextResponse.json({ success: true, data, updated: !!existing?.length })
  } catch (error: any) {
    console.error('POST hotel_staff_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to save hotel service rate') }, { status: 500 })
  }
}