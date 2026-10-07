// GET /api/cruises/assignable — the cruise picker's list: the cruise directory
// and the ships priced under Rates → Nile Cruises, one entry per ship per route
// (lib/resources/assignable-cruises). Rates and directory are install-wide, as
// GET /api/cruises is; the middleware gates /api/cruises the same way.

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { assignableCruises, type CruiseContactRow, type NileCruiseRow } from '@/lib/resources/assignable-cruises'

export async function GET() {
  try {
    const supabase = createServerClient()
    const [directory, rates] = await Promise.all([
      supabase.from('cruise_contacts').select('id, name, ship_name, route, routes, phone, is_active'),
      supabase.from('nile_cruises').select('id, property_id, ship_name, route_name, embark_city, disembark_city, is_active'),
    ])
    // Either source alone still makes a list; both failing is an error.
    if (directory.error && rates.error) throw directory.error
    if (directory.error) console.error('cruise picker: directory read failed:', directory.error.message)
    if (rates.error) console.error('cruise picker: rates read failed:', rates.error.message)
    const data = assignableCruises(
      (directory.data ?? []) as CruiseContactRow[],
      (rates.data ?? []) as NileCruiseRow[],
    )
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error listing assignable cruises:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch cruises' }, { status: 500 })
  }
}
