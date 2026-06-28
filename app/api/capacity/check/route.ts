import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { determineCapacityResult } from '@/lib/capacity-availability'

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
    const { org_id, start_date, end_date, group_size = 1 } = body

    if (!org_id) {
      return NextResponse.json(
        { success: false, error: 'org_id is required' },
        { status: 400 }
      )
    }

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

    // Use admin client since this is called by AI agent without user auth
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Get capacity entries for the date range
    const { data: capacityData, error } = await supabase
      .from('operator_capacity')
      .select('date, status, max_groups, booked_groups, notes, reason')
      .eq('org_id', org_id)
      .gte('date', start_date)
      .lte('date', effectiveEndDate)
      .order('date', { ascending: true })

    if (error) {
      console.error('Error checking capacity:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // Create a map of dates to capacity
    const capacityMap = new Map<string, {
      status: string
      max_groups: number
      booked_groups: number
      notes?: string
      reason?: string
    }>()

    capacityData?.forEach(entry => {
      capacityMap.set(entry.date, {
        status: entry.status,
        max_groups: entry.max_groups,
        booked_groups: entry.booked_groups,
        notes: entry.notes,
        reason: entry.reason
      })
    })

    // Generate all dates in range
    const dates: string[] = []
    const current = new Date(start_date)
    const end = new Date(effectiveEndDate)

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0])
      current.setDate(current.getDate() + 1)
    }

    // Check availability for each date
    const details = dates.map(date => {
      const capacity = capacityMap.get(date)

      if (!capacity) {
        // No entry = default available
        return {
          date,
          status: 'available' as const,
          available_slots: 3 - group_size // Default 3 max groups
        }
      }

      const availableSlots = capacity.max_groups - capacity.booked_groups

      return {
        date,
        status: capacity.status as 'available' | 'limited' | 'busy' | 'blackout',
        available_slots: availableSlots,
        reason: capacity.reason
      }
    })

    // Determine overall availability (pure — see lib/capacity-availability.ts)
    const result = determineCapacityResult(details as any, group_size)

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
