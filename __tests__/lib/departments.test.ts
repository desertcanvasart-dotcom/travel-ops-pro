import { describe, it, expect } from 'vitest'
import {
  resolveDepartment,
  buildRoutingReport,
  SERVICE_TYPE_ROUTING,
  type DepartmentRow,
} from '@/lib/departments'

// ============================================
// The bug this guards against: routing that fails SILENTLY. A service type
// owned by no department produces a task with no assignee, and in the task list
// that is indistinguishable from a task nobody has picked up yet. So the
// failure mode to test is not "throws" — it is "reports the gap".
//
// The original seed listed 'airport_service'/'hotel_service' (singular) while
// the live rows carry the plural, and omitted activity/tips/supplies entirely.
// ============================================

const dept = (id: string, name: string, service_types: string[]): DepartmentRow => ({
  id,
  name,
  service_types,
})

// The corrected table, as migration 20260812 leaves it.
const DEPARTMENTS: DepartmentRow[] = [
  dept('d-res', 'Reservation', ['accommodation', 'cruise', 'meal', 'transportation']),
  dept('d-avi', 'Aviation', ['flight']),
  dept('d-exe', 'Execution', [
    'guide',
    'entrance',
    'activity',
    'airport_service',
    'airport_services',
    'hotel_service',
    'hotel_services',
    'tips',
    'supplies',
  ]),
  dept('d-acc', 'Accounting', ['invoice', 'payment', 'commission']),
]

// What the table looked like before the fix — the regression case.
const OLD_DEPARTMENTS: DepartmentRow[] = [
  dept('d-res', 'Reservation', ['accommodation', 'cruise', 'meal', 'transportation']),
  dept('d-avi', 'Aviation', ['flight']),
  dept('d-exe', 'Execution', ['guide', 'entrance', 'airport_service', 'hotel_service']),
  dept('d-acc', 'Accounting', ['invoice', 'payment', 'commission']),
]

/** Every service_type present in the live itinerary_services rows. */
const OBSERVED = [
  'accommodation',
  'activity',
  'airport_services',
  'cruise',
  'entrance',
  'flight',
  'guide',
  'hotel_services',
  'meal',
  'supplies',
  'tips',
  'transportation',
]

describe('resolveDepartment', () => {
  it('routes each service type to its owning department', () => {
    expect(resolveDepartment('accommodation', DEPARTMENTS)?.name).toBe('Reservation')
    expect(resolveDepartment('flight', DEPARTMENTS)?.name).toBe('Aviation')
    expect(resolveDepartment('guide', DEPARTMENTS)?.name).toBe('Execution')
  })

  it('routes BOTH spellings of the airport/hotel service types', () => {
    // The app writes the singular today; older rows carry the plural. Listing
    // only one silently dropped the other.
    expect(resolveDepartment('airport_service', DEPARTMENTS)?.name).toBe('Execution')
    expect(resolveDepartment('airport_services', DEPARTMENTS)?.name).toBe('Execution')
    expect(resolveDepartment('hotel_service', DEPARTMENTS)?.name).toBe('Execution')
    expect(resolveDepartment('hotel_services', DEPARTMENTS)?.name).toBe('Execution')
  })

  it('routes the types that previously reached nobody', () => {
    for (const type of ['activity', 'tips', 'supplies', 'airport_services', 'hotel_services']) {
      // The corrected table owns them outright.
      const fromTable = resolveDepartment(type, DEPARTMENTS)
      expect(fromTable?.name, type).toBe('Execution')
      expect(fromTable?.source, type).toBe('database')

      // Against the OLD table they still reach the right team, but only via the
      // code map — the safety net, not the table. That distinction is what
      // buildRoutingReport surfaces.
      const fromOld = resolveDepartment(type, OLD_DEPARTMENTS)
      expect(fromOld?.name, type).toBe('Execution')
      expect(fromOld?.source, type).toBe('fallback')
    }
  })

  it('is insensitive to case and stray whitespace on both sides', () => {
    expect(resolveDepartment('  Guide ', DEPARTMENTS)?.name).toBe('Execution')
    expect(resolveDepartment('GUIDE', DEPARTMENTS)?.name).toBe('Execution')
    expect(resolveDepartment('meal', [dept('x', 'Reservation', [' MEAL '])])?.name).toBe(
      'Reservation'
    )
  })

  it('lets the DATABASE win over the code map', () => {
    // An operator moving meals to Execution should take effect without a deploy.
    const rehomed = [
      dept('d-res', 'Reservation', ['accommodation']),
      dept('d-exe', 'Execution', ['meal']),
    ]
    const resolved = resolveDepartment('meal', rehomed)
    expect(resolved?.name).toBe('Execution')
    expect(resolved?.source).toBe('database')
  })

  it('falls back to the code map for a type the table has not been told about', () => {
    const incomplete = [
      dept('d-res', 'Reservation', []),
      dept('d-exe', 'Execution', []),
      dept('d-avi', 'Aviation', []),
    ]
    const resolved = resolveDepartment('tips', incomplete)
    expect(resolved?.name).toBe('Execution')
    expect(resolved?.source).toBe('fallback')
  })

  it('returns null rather than a guess for an unknown type', () => {
    expect(resolveDepartment('quantum_teleportation', DEPARTMENTS)).toBeNull()
    expect(resolveDepartment('', DEPARTMENTS)).toBeNull()
    expect(resolveDepartment(null, DEPARTMENTS)).toBeNull()
    expect(resolveDepartment(undefined, DEPARTMENTS)).toBeNull()
  })

  it('cannot fall back when the named department does not exist', () => {
    // Aviation deleted: 'flight' has nowhere to go, and must not land elsewhere.
    const noAviation = DEPARTMENTS.filter(d => d.name !== 'Aviation').map(d =>
      d.name === 'Reservation' ? dept(d.id, d.name, ['accommodation']) : d
    )
    expect(resolveDepartment('flight', noAviation)).toBeNull()
  })

  it('tolerates a department row with no service_types at all', () => {
    expect(() =>
      resolveDepartment('guide', [{ id: 'd', name: 'Execution', service_types: null }])
    ).not.toThrow()
  })
})

describe('buildRoutingReport', () => {
  it('reports every observed service type as routed once the table is correct', () => {
    const report = buildRoutingReport(OBSERVED, DEPARTMENTS)
    expect(report.unrouted).toEqual([])
    expect(report.fallback).toEqual([])
    expect(report.complete).toBe(true)
    expect(report.table_current).toBe(true)
  })

  it('names exactly what the old table failed to own', () => {
    const report = buildRoutingReport(OBSERVED, OLD_DEPARTMENTS)

    // Nothing is lost — the code map catches all five — but the table is stale
    // and the report says so instead of reading as healthy.
    expect(report.complete).toBe(true)
    expect(report.table_current).toBe(false)
    expect(report.fallback).toEqual([
      'activity',
      'airport_services',
      'hotel_services',
      'supplies',
      'tips',
    ])
  })

  it('reports a type nothing knows about as unrouted, not as a fallback', () => {
    const report = buildRoutingReport(['guide', 'sky_diving'], DEPARTMENTS)
    expect(report.unrouted).toEqual(['sky_diving'])
    expect(report.fallback).toEqual([])
    expect(report.complete).toBe(false)
  })

  it('reports drift when the database disagrees with the code map', () => {
    const rehomed = [
      dept('d-res', 'Reservation', ['accommodation']),
      dept('d-exe', 'Execution', ['meal']),
    ]
    const report = buildRoutingReport(['meal'], rehomed)

    // Not an error — the operator may have meant it — but it must be visible.
    expect(report.complete).toBe(true)
    expect(report.drift).toEqual([{ service_type: 'meal', expected: 'Reservation', actual: 'Execution' }])
  })

  it('de-duplicates repeated types so the report reads as a set', () => {
    const report = buildRoutingReport(['tips', 'tips', 'tips', 'nonsense', 'nonsense'], DEPARTMENTS)
    expect(report.unrouted).toEqual(['nonsense'])
  })

  it('ignores blank entries instead of reporting an empty unrouted type', () => {
    const report = buildRoutingReport(['', '   ', 'guide'], DEPARTMENTS)
    expect(report.unrouted).toEqual([])
    expect(report.complete).toBe(true)
  })
})

describe('the canonical map and the migration agree', () => {
  it('every service type in the code map is owned by the seeded table', () => {
    for (const type of Object.keys(SERVICE_TYPE_ROUTING)) {
      expect(resolveDepartment(type, DEPARTMENTS)?.name, type).toBe(SERVICE_TYPE_ROUTING[type])
    }
  })

  it('covers every service type actually present in the data', () => {
    for (const type of OBSERVED) {
      expect(SERVICE_TYPE_ROUTING[type], `${type} is missing from SERVICE_TYPE_ROUTING`).toBeDefined()
    }
  })
})
