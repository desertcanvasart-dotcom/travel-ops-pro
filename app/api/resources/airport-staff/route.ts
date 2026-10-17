// ============================================
// API Route: /api/resources/airport-staff/route.ts
// ============================================
// Airport staff collection operations: GET all, POST new
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

// The caller's company's staff (the view carries suppliers.org_id, 20261205);
// a new one is stamped with it — the view's INSTEAD OF INSERT trigger writes
// the supplier row with the org_id given.

// GET - List all airport staff
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()

    const { searchParams } = new URL(request.url)
    const location = searchParams.get('location')
    const isActive = searchParams.get('is_active')

    let query = supabase
      .from('airport_staff')
      .select('*')
      .eq('org_id', orgId)
      .order('name', { ascending: true })

    if (location) {
      query = query.ilike('airport_location', `%${location}%`)
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching airport staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch airport staff' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    })

  } catch (error) {
    console.error('Error in airport staff GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new airport staff
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const body = await request.json()

    if (!body.name || !body.airport_location || !body.phone) {
      return NextResponse.json(
        { success: false, error: 'Name, airport location, and phone are required' },
        { status: 400 }
      )
    }

    const staffData = {
      org_id: orgId,
      name: body.name,
      role: body.role || null,
      airport_location: body.airport_location,
      phone: body.phone,
      whatsapp: body.whatsapp || null,
      email: body.email || null,
      languages: body.languages || [],
      shift_times: body.shift_times || null,
      emergency_contact: body.emergency_contact || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true
    }

    const { data, error } = await supabase
      .from('airport_staff')
      .insert([staffData])
      .select()
      .single()

    if (error) {
      console.error('Error creating airport staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create airport staff' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Airport staff created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in airport staff POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}