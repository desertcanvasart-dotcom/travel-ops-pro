// ============================================
// DEPARTMENT ROUTING — which department owns which kind of work
// ============================================
// A trip's services are worked by different teams: someone books the hotels,
// someone else ticketed the flights, someone else meets the group at the gate.
// The department table carries that mapping (departments.service_types), and
// task generation uses it to route each generated task to the right team.
//
// WHY THIS FILE EXISTS
//
// The mapping lived in two places that had drifted apart: the seed data in
// migrations/20260217_create_departments.sql and a hardcoded object in
// lib/ai/task-generation.ts. Both listed 'airport_service' / 'hotel_service'
// (singular) while the live rows carry the plural, and neither listed
// 'activity', 'tips' or 'supplies' at all — so 36 of 89 service rows routed to
// no department. Nothing failed; the tasks just came out unassigned, which
// looks identical to "nobody has picked it up yet".
//
// So: one canonical map here, the database remains the runtime authority (an
// operator can edit service_types without a deploy), and the two are
// cross-checked so drift is REPORTED rather than silently dropping work.

import { normalizeServiceType } from '@/lib/service-types'

/** The four departments seeded by 20260217_create_departments.sql. */
export const DEPARTMENT_NAMES = ['Reservation', 'Aviation', 'Execution', 'Accounting'] as const
export type DepartmentName = (typeof DEPARTMENT_NAMES)[number]

export interface DepartmentRow {
  id: string
  name: string
  service_types: string[] | null
}

/**
 * The expected routing, in the canonical vocabulary (lib/service-types.ts).
 *
 * This map used to list both spellings of the airport/hotel types because the
 * grid and the AI writer disagreed. The taxonomy is unified now (AUT-L02):
 * lookups normalize the incoming value, so legacy plural rows still route,
 * and the map itself stays single-spelling.
 */
export const SERVICE_TYPE_ROUTING: Readonly<Record<string, DepartmentName>> = {
  // Reservation — anything booked with a supplier ahead of the trip
  accommodation: 'Reservation',
  cruise: 'Reservation',
  meal: 'Reservation',
  transportation: 'Reservation',

  // Aviation — ticketing
  flight: 'Aviation',

  // Execution — everything that happens on the ground, on the day
  guide: 'Execution',
  entrance: 'Execution',
  activity: 'Execution',
  airport_service: 'Execution',
  hotel_service: 'Execution',
  tips: 'Execution',
  supplies: 'Execution',

  // Accounting — not itinerary_services types; these route non-service work
  invoice: 'Accounting',
  payment: 'Accounting',
  commission: 'Accounting',
}

/**
 * Resolve the department that owns a service type.
 *
 * The DATABASE wins: an operator who moves 'meal' from Reservation to Execution
 * in the departments table should see that take effect without a deploy. The
 * code map is only a fallback for a type the table has not been told about —
 * which is exactly the gap that made this silent before.
 */
export function resolveDepartment(
  serviceType: string | null | undefined,
  departments: DepartmentRow[]
): { id: string; name: string; source: 'database' | 'fallback' } | null {
  if (!serviceType) return null
  const type = normalizeServiceType(serviceType)
  if (!type) return null

  for (const dept of departments) {
    if (dept.service_types?.some(t => normalizeServiceType(t) === type)) {
      return { id: dept.id, name: dept.name, source: 'database' }
    }
  }

  // Not in the table — fall back to the canonical map, matching by name.
  const expected = SERVICE_TYPE_ROUTING[type]
  if (expected) {
    const dept = departments.find(d => d.name === expected)
    if (dept) return { id: dept.id, name: dept.name, source: 'fallback' }
  }

  return null
}

export interface RoutingReport {
  /** Service types present in the work but owned by no department. */
  unrouted: string[]
  /**
   * Types that route ONLY because the code map caught them — the departments
   * table does not list them. Work still reaches the right team, but the table
   * is behind the code (usually: the migration has not been run), and that
   * should be visible rather than papered over by the safety net.
   */
  fallback: string[]
  /** Types the code expects to route somewhere the database disagrees about. */
  drift: Array<{ service_type: string; expected: DepartmentName; actual: string | null }>
  /** True when every type in `serviceTypes` reaches a department. */
  complete: boolean
  /** True when every type is owned by the TABLE, with no fallback in play. */
  table_current: boolean
}

/**
 * Compare the live table against the canonical map for a given set of service
 * types — normally the distinct types actually present on a trip.
 *
 * This is the whole point of the file: unrouted work should be VISIBLE. An
 * unassigned task and a task nobody has claimed yet look the same in the UI,
 * so the routing gap has to be reported at the moment tasks are generated.
 */
export function buildRoutingReport(
  serviceTypes: Iterable<string>,
  departments: DepartmentRow[]
): RoutingReport {
  const unrouted: string[] = []
  const fallback: string[] = []
  const drift: RoutingReport['drift'] = []
  const seen = new Set<string>()

  for (const raw of serviceTypes) {
    const type = (raw || '').trim().toLowerCase()
    if (!type || seen.has(type)) continue
    seen.add(type)

    const resolved = resolveDepartment(type, departments)
    if (!resolved) {
      unrouted.push(type)
      continue
    }

    if (resolved.source === 'fallback') {
      fallback.push(type)
    }

    const expected = SERVICE_TYPE_ROUTING[type]
    if (expected && resolved.name !== expected) {
      // Not an error — an operator may have deliberately re-homed the work.
      // Reported so an accidental divergence is visible rather than inferred.
      drift.push({ service_type: type, expected, actual: resolved.name })
    }
  }

  return {
    unrouted: unrouted.sort(),
    fallback: fallback.sort(),
    drift,
    complete: unrouted.length === 0,
    table_current: unrouted.length === 0 && fallback.length === 0,
  }
}
