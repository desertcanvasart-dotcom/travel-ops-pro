import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { orgAuth } from '@/lib/auth/org-auth'
import { mergeCapacityEntry } from '@/lib/capacity-availability'

// ============================================
// SINGLE DATE CAPACITY API
// File: app/api/capacity/[date]/route.ts
//
// Get/Update/Delete capacity for a specific date
// ============================================

interface RouteParams {
  params: Promise<{ date: string }>
}

/**
 * GET /api/capacity/[date]
 * Get capacity for a specific date
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await orgAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, org_id } = authResult
    if (!supabase || !org_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { date } = await params

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('operator_capacity')
      .select('*')
      .eq('org_id', org_id)
      .eq('date', date)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching capacity:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    // If no entry exists, return default available status
    if (!data) {
      return NextResponse.json({
        success: true,
        data: {
          date,
          status: 'available',
          max_groups: 3,
          booked_groups: 0,
          is_default: true
        }
      })
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: unknown) {
    console.error('Capacity GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/capacity/[date]
 * Update capacity for a specific date
 *
 * Body:
 * - status: 'available' | 'limited' | 'busy' | 'blackout'
 * - max_groups?: number
 * - booked_groups?: number
 * - notes?: string
 * - reason?: string
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await orgAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, org_id, user } = authResult
    if (!supabase || !org_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { date } = await params
    const body = await request.json()

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Validate status if provided
    const validStatuses = ['available', 'limited', 'busy', 'blackout']
    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    // Prepare update data: what the body leaves out keeps the day's stored
    // value. Built from the body alone, a PUT of { status } reset the day's
    // booked groups to 0 and blanked its notes.
    const { data: existing } = await supabase
      .from('operator_capacity')
      .select('*')
      .eq('org_id', org_id)
      .eq('date', date)
      .maybeSingle()
    const updateData = {
      org_id,
      date,
      ...mergeCapacityEntry(body && typeof body === 'object' ? body : {}, existing),
      created_by: existing?.created_by ?? user?.id ?? null
    }

    // Upsert (insert or update)
    const { data, error } = await supabase
      .from('operator_capacity')
      .upsert(updateData, {
        onConflict: 'org_id,date',
        ignoreDuplicates: false
      })
      .select()
      .single()

    if (error) {
      console.error('Error updating capacity:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: unknown) {
    console.error('Capacity PUT error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/capacity/[date]
 * Delete capacity entry for a specific date
 * (Resets to default available status)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await orgAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, org_id } = authResult
    if (!supabase || !org_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { date } = await params

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('operator_capacity')
      .delete()
      .eq('org_id', org_id)
      .eq('date', date)

    if (error) {
      console.error('Error deleting capacity:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Capacity for ${date} reset to default (available)`
    })
  } catch (error: unknown) {
    console.error('Capacity DELETE error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
    }
}
