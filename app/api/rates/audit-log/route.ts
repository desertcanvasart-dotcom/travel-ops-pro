import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@/lib/supabase'

/**
 * GET /api/rates/audit-log
 *
 * Query params:
 *   table_name  - required: which rate table (e.g. 'accommodation_rates')
 *   record_id   - optional: specific record UUID
 *   limit       - optional: max rows (default 50, max 200)
 *   offset      - optional: pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)

    const tableName = searchParams.get('table_name')
    const recordId = searchParams.get('record_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!tableName) {
      return NextResponse.json(
        { success: false, error: 'table_name query parameter is required' },
        { status: 400 }
      )
    }

    // Validate table name against allowlist to prevent injection
    const ALLOWED_TABLES = [
      'accommodation_rates', 'transportation_rates', 'guide_rates',
      'meal_rates', 'entrance_fees', 'flight_rates', 'activity_rates',
      'tipping_rates', 'airport_staff_rates', 'hotel_staff_rates',
      'nile_cruises', 'train_rates', 'sleeping_train_rates'
    ]

    if (!ALLOWED_TABLES.includes(tableName)) {
      return NextResponse.json(
        { success: false, error: `Invalid table_name. Must be one of: ${ALLOWED_TABLES.join(', ')}` },
        { status: 400 }
      )
    }

    let query = supabase
      .from('rate_audit_log')
      .select('*', { count: 'exact' })
      .eq('table_name', tableName)
      .order('changed_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (recordId) {
      query = query.eq('record_id', recordId)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching audit log:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch audit log' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      total: count || 0,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('Error in audit log API:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
