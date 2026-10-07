// app/api/itinerary-resources/route.ts

import { createServerClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { assignmentInOrg, itineraryInOrg } from '@/lib/itinerary-resources/org-scope'

// Every method reads or writes only the signed-in organisation's trips
// (lib/itinerary-resources/org-scope): the service-role client bypasses RLS.

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    
    const itineraryId = searchParams.get('itinerary_id')
    const resourceType = searchParams.get('resource_type')
    
    let query = supabase
      .from('itinerary_resources')
      .select('*, itinerary:itineraries!inner(org_id)')
      .eq('itinerary.org_id', orgId)
      .order('start_date', { ascending: true })
    
    if (itineraryId) {
      query = query.eq('itinerary_id', itineraryId)
    }
    
    if (resourceType) {
      query = query.eq('resource_type', resourceType)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    // The join is only the scope; the rows go out as they always have.
    const rows = (data ?? []).map(({ itinerary: _scope, ...row }: Record<string, unknown>) => row)
    return NextResponse.json({ success: true, data: rows })
  } catch (error) {
    console.error('Error fetching itinerary resources:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch resources' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const body = await request.json()
    
    const {
      itinerary_id,
      itinerary_day_id,
      resource_type,
      resource_id,
      resource_name,
      start_date,
      end_date,
      notes,
      quantity,
      cost_eur,
      cost_non_eur,
      status
    } = body
    
    // Validate required fields
    if (!itinerary_id || !resource_type || !resource_id || !start_date) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (!(await itineraryInOrg(supabase, itinerary_id, orgId))) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }
    
    const { data, error } = await supabase
      .from('itinerary_resources')
      .insert({
        itinerary_id,
        itinerary_day_id: itinerary_day_id || null,
        resource_type,
        resource_id,
        resource_name: resource_name || null,
        start_date,
        end_date: end_date || start_date,
        notes: notes || null,
        quantity: quantity || 1,
        cost_eur: cost_eur || null,
        cost_non_eur: cost_non_eur || null,
        status: status || 'confirmed'
      })
      .select()
      .single()
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error creating itinerary resource:', error)
    
    // Handle unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'This resource is already assigned for this date' },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to create resource assignment' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Resource ID required' },
        { status: 400 }
      )
    }

    if (!(await assignmentInOrg(supabase, id, orgId))) {
      return NextResponse.json({ success: false, error: 'Assignment not found' }, { status: 404 })
    }
    
    const { error } = await supabase
      .from('itinerary_resources')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting itinerary resource:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete resource' },
      { status: 500 }
    )
  }
}
/**
 * PATCH /api/itinerary-resources?id=<assignment id>
 * Change an assignment's dates — airport staff booked for the whole trip when
 * they meet the arrival only. Body: { start_date, end_date? }; the end
 * defaults to the start (one day) and cannot fall before it. Only an
 * assignment on one of the signed-in organisation's itineraries is changed.
 * Ported from autoura-saas (#611).
 */
export async function PATCH(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()

    const id = new URL(request.url).searchParams.get('id')
    const body = await request.json().catch(() => ({}))
    const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    const start = body.start_date
    const end = body.end_date || start
    if (!id) return NextResponse.json({ success: false, error: 'Resource ID required' }, { status: 400 })
    if (!isDay(start) || !isDay(end)) {
      return NextResponse.json({ success: false, error: 'start_date and end_date must be dates (YYYY-MM-DD)' }, { status: 400 })
    }
    if (end < start) return NextResponse.json({ success: false, error: 'The end date is before the start date' }, { status: 400 })

    const { data: assignment } = await supabase
      .from('itinerary_resources')
      .select('id, itinerary:itineraries!inner(org_id)')
      .eq('id', id)
      .eq('itinerary.org_id', orgId)
      .maybeSingle()
    if (!assignment) {
      return NextResponse.json({ success: false, error: 'Assignment not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('itinerary_resources')
      .update({ start_date: start, end_date: end, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, start_date, end_date')
    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ success: false, error: 'Assignment not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: data[0] })
  } catch (error) {
    console.error('Error updating itinerary resource dates:', error)
    return NextResponse.json({ success: false, error: 'Failed to update the dates' }, { status: 500 })
  }
}
