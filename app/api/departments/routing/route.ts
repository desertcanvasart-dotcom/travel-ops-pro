// ============================================
// API: GET /api/departments/routing — who owns which kind of work
// ============================================
// Answers two questions an operator cannot otherwise get at:
//
//   1. what does each department currently own?
//   2. is any work falling through the gaps?
//
// (2) is the reason this exists. A service type owned by no department produces
// tasks with no assignee, and in the task list an unassigned task is
// indistinguishable from one nobody has picked up yet — so a routing hole looks
// exactly like a busy week. This reports the hole against the service types
// ACTUALLY PRESENT in the data, not against a hardcoded list.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import {
  buildRoutingReport,
  resolveDepartment,
  SERVICE_TYPE_ROUTING,
  type DepartmentRow,
} from '@/lib/departments'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data: departments, error: deptError } = await supabaseAdmin
      .from('departments')
      .select('id, name, description, service_types, is_active')
      .eq('is_active', true)
      .order('name')

    if (deptError) {
      console.error('Error fetching departments:', deptError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch departments' },
        { status: 500 }
      )
    }

    const rows = (departments || []) as DepartmentRow[]

    // The service types actually in use, so the report reflects this operator's
    // real work rather than a list someone typed once.
    const { data: services } = await supabaseAdmin
      .from('itinerary_services')
      .select('service_type')

    const observed = new Set<string>()
    for (const s of services || []) {
      const t = (s.service_type || '').trim().toLowerCase()
      if (t) observed.add(t)
    }

    // Union with the canonical map so a type we know about but have never
    // written yet still shows up as routed rather than missing.
    const universe = new Set([...observed, ...Object.keys(SERVICE_TYPE_ROUTING)])
    const report = buildRoutingReport(universe, rows)

    // Per-department view, plus how many live rows each one actually owns.
    const counts: Record<string, number> = {}
    for (const s of services || []) {
      const dept = resolveDepartment(s.service_type, rows)
      const key = dept?.name || '(unrouted)'
      counts[key] = (counts[key] || 0) + 1
    }

    return NextResponse.json({
      success: true,
      departments: rows.map(d => ({
        id: d.id,
        name: d.name,
        service_types: d.service_types || [],
        service_rows: counts[d.name] || 0,
      })),
      routing: {
        complete: report.complete,
        // False when routing only works because the code map caught it — i.e.
        // migration 20260812 has not been applied to this database.
        table_current: report.table_current,
        routed_by_code_only: report.fallback,
        // Service types in the data (or the canonical map) that reach no
        // department. Every one of these produces unassignable work.
        unrouted_service_types: report.unrouted,
        unrouted_service_rows: counts['(unrouted)'] || 0,
        // Where the database and the code's expectation disagree. Not an error
        // — an operator may have re-homed work deliberately — but visible.
        drift: report.drift,
      },
      observed_service_types: [...observed].sort(),
    })
  } catch (error) {
    console.error('Error in departments routing GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
