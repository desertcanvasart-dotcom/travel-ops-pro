import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { orgAuth } from '@/lib/auth/org-auth'
import { capacityInputError, mergeCapacityEntry } from '@/lib/capacity-availability'
import { loadDayLoads } from '@/lib/capacity-load'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// ============================================
// OPERATOR CAPACITY API
// File: app/api/capacity/route.ts
//
// Endpoints for managing operator capacity
// Used by calendar UI and WhatsApp AI agent
// ============================================

export interface CapacityEntry {
  id: string
  org_id: string
  date: string
  status: 'available' | 'limited' | 'busy' | 'blackout'
  max_groups: number
  booked_groups: number
  max_guides?: number
  booked_guides?: number
  max_vehicles?: number
  booked_vehicles?: number
  notes?: string
  internal_notes?: string
  reason?: string
  created_at: string
  updated_at: string
}

/**
 * GET /api/capacity
 * List capacity entries for a date range
 *
 * Query params:
 * - start_date: YYYY-MM-DD (required)
 * - end_date: YYYY-MM-DD (required)
 * - status: filter by status (optional)
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const status = searchParams.get('status')

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'start_date and end_date are required' },
        { status: 400 }
      )
    }
    if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate) || endDate < startDate ||
        (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 > 366) {
      return NextResponse.json(
        { success: false, error: 'start_date and end_date must be YYYY-MM-DD, in order, at most 366 days apart' },
        { status: 400 }
      )
    }

    let query = supabase
      .from('operator_capacity')
      .select('*')
      .eq('org_id', org_id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching capacity:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    // What is out on each day, counted from sold trips and running
    // departures (lib/capacity-load) — booked_groups was never written.
    const loads = await loadDayLoads(supabase, org_id, startDate, endDate)

    return NextResponse.json({
      success: true,
      data: data || [],
      loads: Object.fromEntries(loads)
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
 * POST /api/capacity
 * Create or update capacity entries
 * Supports bulk upsert for calendar updates
 *
 * Body:
 * - entries: Array of { date, status, max_groups?, notes?, reason? }
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { entries } = body

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'entries array is required' },
        { status: 400 }
      )
    }

    // Validate entries — a bad one is the caller's mistake (400), not a
    // server error: these used to throw into the 500 handler. Counts are
    // whole numbers ≥ 0; max guides / vehicles may be null (no limit).
    if (entries.length > 400) {
      return NextResponse.json({ success: false, error: 'Too many days at once (max 400)' }, { status: 400 })
    }
    for (const entry of entries as Array<Record<string, unknown>>) {
      if (!entry?.date || !ISO_DATE.test(String(entry.date))) {
        return NextResponse.json({ success: false, error: 'Each entry must have a date (YYYY-MM-DD)' }, { status: 400 })
      }
      const bad = capacityInputError(entry)
      if (bad) {
        return NextResponse.json({ success: false, error: `${entry.date}: ${bad}` }, { status: 400 })
      }
    }

    // The days as they stand, so a field the request leaves out keeps its
    // value (lib/capacity-availability mergeCapacityEntry) — the editor sends
    // only what the operator touched, and booked counts and internal notes
    // were reset on every save.
    const dates = [...new Set((entries as Partial<CapacityEntry>[]).map(e => String(e.date)))]
    const { data: existingRows, error: existingErr } = await supabase
      .from('operator_capacity')
      .select('*')
      .eq('org_id', org_id)
      .in('date', dates)
    if (existingErr) {
      console.error('Error reading capacity before save:', existingErr)
      return NextResponse.json(
        { success: false, error: clientMessage(existingErr, 'Internal server error') },
        { status: 500 }
      )
    }
    const existingByDate = new Map<string, Record<string, unknown>>(
      (existingRows || []).map((r: Record<string, unknown>) => [String(r.date), r])
    )

    const preparedEntries = (entries as Partial<CapacityEntry>[]).map(entry => {
      const existing = existingByDate.get(String(entry.date))
      return {
        org_id,
        date: entry.date,
        ...mergeCapacityEntry(entry as Record<string, unknown>, existing),
        created_by: (existing?.created_by as string | null | undefined) ?? user?.id ?? null
      }
    })

    // Upsert entries (update if date exists, insert if not)
    const { data, error } = await supabase
      .from('operator_capacity')
      .upsert(preparedEntries, {
        onConflict: 'org_id,date',
        ignoreDuplicates: false
      })
      .select()

    if (error) {
      console.error('Error saving capacity:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      message: `${preparedEntries.length} capacity entries saved`
    })
  } catch (error: unknown) {
    console.error('Capacity POST error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/capacity
 * Delete capacity entries for a date range
 * Useful for resetting to default (available)
 *
 * Query params:
 * - start_date: YYYY-MM-DD (required)
 * - end_date: YYYY-MM-DD (required)
 */
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'start_date and end_date are required' },
        { status: 400 }
      )
    }
    if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate) || endDate < startDate) {
      return NextResponse.json(
        { success: false, error: 'start_date and end_date must be YYYY-MM-DD, in order' },
        { status: 400 }
      )
    }

    const { error, count } = await supabase
      .from('operator_capacity')
      .delete({ count: 'exact' })
      .eq('org_id', org_id)
      .gte('date', startDate)
      .lte('date', endDate)

    if (error) {
      console.error('Error deleting capacity:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${count || 0} capacity entries`
    })
  } catch (error: unknown) {
    console.error('Capacity DELETE error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
