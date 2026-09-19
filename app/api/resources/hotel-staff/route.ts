// ============================================
// API Route: /api/resources/hotel-staff/route.ts
// ============================================
// Hotel staff collection operations: GET all, POST new
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// GET - List all hotel staff with hotel info
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()

    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get('hotel_id')
    const isActive = searchParams.get('is_active')

    // NO embed. hotel_staff carries no hotel reference at all (see the
    // hotel_id note below), so `hotel:hotel_contacts(...)` had no foreign key
    // to travel — and PostgREST rejects the WHOLE query for an unresolvable
    // embed (PGRST200), not just that column. The endpoint 500'd on every
    // call, so no hotel staff ever loaded. Callers already read `hotel` with
    // optional chaining, so its absence is the value they were getting.
    let query = supabase
      .from('hotel_staff')
      .select('*')
      .order('name', { ascending: true })

    if (hotelId) {
      // hotel_staff has no hotel_id column — the filter silently 400'd.
      // Staff are not hotel-scoped in this schema.
      void hotelId
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching hotel staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch hotel staff' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    })

  } catch (error) {
    console.error('Error in hotel staff GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new hotel staff
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const body = await request.json()

    if (!body.name || !body.phone) {
      return NextResponse.json(
        { success: false, error: 'Name and phone are required' },
        { status: 400 }
      )
    }

    const staffData = {
      name: body.name,
      role: body.role || null,
      phone: body.phone,
      whatsapp: body.whatsapp || null,
      email: body.email || null,
      languages: body.languages || [],
      shift_times: body.shift_times || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true
    }

    const { data, error } = await supabase
      .from('hotel_staff')
      .insert([staffData])
      .select('*')
      .single()

    if (error) {
      console.error('Error creating hotel staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create hotel staff' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Hotel staff created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in hotel staff POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}