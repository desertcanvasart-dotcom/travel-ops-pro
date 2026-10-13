import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { capacityDayDetail, determineCapacityResult } from '@/lib/capacity-availability'
import { datesInRange, loadDayLoads } from '@/lib/capacity-load'

// ============================================
// CAPACITY CHECK API (server-to-server, e.g. WhatsApp AI agent)
// File: app/api/capacity/check/route.ts
//
// Check availability for a date range. Pass org_id in the body.
// ============================================

/**
 * POST /api/capacity/check
 * Check availability for dates (used by AI agent)
 *
 * Body:
 * - org_id: string (required)
 * - start_date: YYYY-MM-DD (required)
 * - end_date: YYYY-MM-DD (optional, defaults to start_date)
 * - group_size: number (optional, for group capacity checking)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { start_date, end_date, group_size = 1 } = body

    // WHOSE capacity is read comes from the SESSION, never the body. It used to
    // take `org_id` straight from the request, so any authenticated caller could
    // read any organisation's capacity calendar by naming its id.
    const org_id = await getCurrentOrgId()
    if (!org_id) return noOrgResponse()

    if (!start_date) {
      return NextResponse.json(
        { success: false, error: 'start_date is required' },
        { status: 400 }
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid start_date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const effectiveEndDate = end_date || start_date

    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveEndDate)) {
      return NextResponse.json(
        { success: false, error: 'Invalid end_date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }
    // A reversed range would scan nothing yet report "available" for a trip that
    // cannot be served; an unbounded one is a cheap way to force a huge scan.
    if (effectiveEndDate < start_date) {
      return NextResponse.json(
        { success: false, error: 'end_date must not be before start_date' },
        { status: 400 }
      )
    }
    const spanDays = (Date.parse(effectiveEndDate) - Date.parse(start_date)) / 86_400_000
    if (spanDays > 366) {
      return NextResponse.json(
        { success: false, error: 'Date range too large (max 366 days)' },
        { status: 400 }
      )
    }

    // Use admin client since this is called by AI agent without user auth
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Get capacity entries for the date range
    const { data: capacityData, error } = await supabase
      .from('operator_capacity')
      .select('date, status, max_groups, reason')
      .eq('org_id', org_id)
      .gte('date', start_date)
      .lte('date', effectiveEndDate)
      .order('date', { ascending: true })

    if (error) {
      console.error('Error checking capacity:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    const capacityMap = new Map<string, { status: string; max_groups: number; reason?: string | null }>()
    capacityData?.forEach(entry => capacityMap.set(entry.date, entry))

    // The groups already out on each day, counted from sold trips and
    // running departures (lib/capacity-load) — booked_groups was never
    // written, so every day had all its slots free. A day with no entry is
    // available with 3 groups (capacityDayDetail).
    const loads = await loadDayLoads(supabase, org_id, start_date, effectiveEndDate)
    const details = datesInRange(start_date, effectiveEndDate)
      .map(date => capacityDayDetail(date, capacityMap.get(date), loads.get(date)))

    // Determine overall availability (pure — see lib/capacity-availability.ts)
    // group_size is how many GROUPS the enquiry needs (one party = 1), the
    // unit the slots are counted in.
    const result = determineCapacityResult(details, Math.max(1, Number(group_size) || 1))

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error: unknown) {
    console.error('Capacity check error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
