// ============================================
// RESOURCE COVERAGE — what each day needs, and whether it is assigned
// ============================================
// The itinerary page showed resources two ways, both as empty states: a "No
// Resources Assigned" card and the assignment panel's "No guides assigned
// yet". Neither said what the trip actually NEEDS, so a trip with a guide for
// three of its five touring days looked as finished as one fully staffed.
//
// The need is read off the day's services — the lines the client is paying
// for — and the cover off itinerary_resources. One row per resource type, one
// column per day:
//
//   covered  the day has a line for it and an assignment spans the day
//   missing  the day has a line for it and nothing is assigned
//   extra    something is assigned with no line asking for it (shown, not
//            flagged: a guide on a free day can be deliberate)
//   none     neither
//
// Pure, so the page and the tests read the same rules.

export const COVERAGE_TYPES = [
  'guide',
  'vehicle',
  'hotel',
  'cruise',
  'restaurant',
  'airport_staff',
  'hotel_staff',
] as const

export type CoverageType = typeof COVERAGE_TYPES[number]

export type CoverageState = 'covered' | 'missing' | 'extra' | 'none'

/** Service lines (itinerary_services.service_type) that ask for each type. */
const NEED_BY_SERVICE: Record<string, CoverageType> = {
  guide: 'guide',
  transportation: 'vehicle',
  accommodation: 'hotel',
  hotel: 'hotel',
  cruise: 'cruise',
  meal: 'restaurant',
  airport_service: 'airport_staff',
  hotel_service: 'hotel_staff',
}

/**
 * Types whose assignment ends on a check-out: a hotel booked 5–8 Dec covers
 * the nights of the 5th, 6th and 7th, not the 8th, when the guests may be in
 * the next hotel. Everything else covers its end date too.
 */
const NIGHTLY = new Set<CoverageType>(['hotel', 'cruise'])

export interface CoverageDay {
  id: string
  day_number: number
  date: string
  services: Array<{ service_type?: string | null }>
}

export interface CoverageAssignment {
  resource_type: string
  resource_name: string
  start_date: string
  end_date?: string | null
  itinerary_day_id?: string | null
  status?: string | null
}

export interface CoverageCell {
  dayId: string
  needed: boolean
  assigned: string[]
  state: CoverageState
}

export interface CoverageRow {
  type: CoverageType
  cells: CoverageCell[]
  needed: number
  covered: number
}

export interface Coverage {
  rows: CoverageRow[]
  needed: number
  covered: number
}

/** What one day's lines ask for. Meals on a cruise day are eaten on board. */
export function dayNeeds(services: CoverageDay['services']): Set<CoverageType> {
  const needs = new Set<CoverageType>()
  for (const s of services ?? []) {
    const type = NEED_BY_SERVICE[String(s.service_type ?? '').toLowerCase()]
    if (type) needs.add(type)
  }
  if (needs.has('cruise')) needs.delete('restaurant')
  return needs
}

const day10 = (d: string | null | undefined) => (d ?? '').slice(0, 10)

/** Whether an assignment is in force on a day. */
export function assignmentCovers(a: CoverageAssignment, day: Pick<CoverageDay, 'id' | 'date'>): boolean {
  if (String(a.status ?? '').toLowerCase() === 'cancelled') return false
  // Pinned to one day: that day only.
  if (a.itinerary_day_id) return a.itinerary_day_id === day.id
  const date = day10(day.date)
  const start = day10(a.start_date)
  const end = day10(a.end_date) || start
  if (!start || !date) return false
  const nightly = NIGHTLY.has(a.resource_type as CoverageType) && end > start
  return date >= start && (nightly ? date < end : date <= end)
}

export function coverageGrid(days: CoverageDay[], assignments: CoverageAssignment[]): Coverage {
  const needsByDay = new Map(days.map(d => [d.id, dayNeeds(d.services)]))
  const rows: CoverageRow[] = []
  let needed = 0
  let covered = 0

  for (const type of COVERAGE_TYPES) {
    const ofType = assignments.filter(a => a.resource_type === type)
    const cells = days.map<CoverageCell>(day => {
      const isNeeded = needsByDay.get(day.id)?.has(type) ?? false
      const assigned = [...new Set(ofType.filter(a => assignmentCovers(a, day)).map(a => a.resource_name))]
      const state: CoverageState = isNeeded
        ? (assigned.length > 0 ? 'covered' : 'missing')
        : (assigned.length > 0 ? 'extra' : 'none')
      return { dayId: day.id, needed: isNeeded, assigned, state }
    })
    // A type nobody needs and nobody is assigned to is not a row.
    if (cells.every(c => c.state === 'none')) continue
    const rowNeeded = cells.filter(c => c.needed).length
    const rowCovered = cells.filter(c => c.state === 'covered').length
    needed += rowNeeded
    covered += rowCovered
    rows.push({ type, cells, needed: rowNeeded, covered: rowCovered })
  }

  return { rows, needed, covered }
}
