// The Operations tab's coverage grid: what each day's services ask for,
// against what itinerary_resources has assigned.
import { describe, it, expect } from 'vitest'
import { assignmentCovers, coverageGrid, dayNeeds, type CoverageDay } from '@/lib/itineraries/coverage'

const day = (n: number, types: string[]): CoverageDay => ({
  id: `d${n}`,
  day_number: n,
  date: `2026-12-${String(4 + n).padStart(2, '0')}`,
  services: types.map(service_type => ({ service_type })),
})

describe('dayNeeds', () => {
  it('reads the need off the service lines', () => {
    expect([...dayNeeds([{ service_type: 'airport_service' }, { service_type: 'hotel_service' }, { service_type: 'transportation' }])].sort())
      .toEqual(['airport_staff', 'hotel_staff', 'vehicle'])
  })
  it('meals on a cruise day are on board, not a restaurant', () => {
    expect(dayNeeds([{ service_type: 'cruise' }, { service_type: 'meal' }]).has('restaurant')).toBe(false)
  })
  it('entrances, tips and water ask for no resource', () => {
    expect(dayNeeds([{ service_type: 'entrance' }, { service_type: 'tips' }, { service_type: 'supplies' }]).size).toBe(0)
  })
})

describe('assignmentCovers', () => {
  const d = { id: 'd3', date: '2026-12-07' }
  it('a range covers the days inside it, end included', () => {
    expect(assignmentCovers({ resource_type: 'guide', resource_name: 'G', start_date: '2026-12-05', end_date: '2026-12-07' }, d)).toBe(true)
    expect(assignmentCovers({ resource_type: 'guide', resource_name: 'G', start_date: '2026-12-08', end_date: '2026-12-09' }, d)).toBe(false)
  })
  it('a hotel ends on its check-out: the check-out day is not a night there', () => {
    expect(assignmentCovers({ resource_type: 'hotel', resource_name: 'H', start_date: '2026-12-05', end_date: '2026-12-07' }, d)).toBe(false)
    expect(assignmentCovers({ resource_type: 'hotel', resource_name: 'H', start_date: '2026-12-05', end_date: '2026-12-08' }, d)).toBe(true)
  })
  it('a one-day assignment without an end covers its start', () => {
    expect(assignmentCovers({ resource_type: 'airport_staff', resource_name: 'A', start_date: '2026-12-07', end_date: null }, d)).toBe(true)
  })
  it('a pinned day wins over the dates; a cancelled one covers nothing', () => {
    expect(assignmentCovers({ resource_type: 'guide', resource_name: 'G', start_date: '2026-12-01', end_date: '2026-12-31', itinerary_day_id: 'd2' }, d)).toBe(false)
    expect(assignmentCovers({ resource_type: 'guide', resource_name: 'G', start_date: '2026-12-07', status: 'cancelled' }, d)).toBe(false)
  })
})

describe('coverageGrid', () => {
  const days = [
    day(1, ['airport_service', 'hotel_service', 'transportation']),
    day(2, ['cruise', 'guide', 'meal']),
    day(3, ['cruise', 'guide']),
    day(4, ['accommodation', 'guide', 'transportation']),
  ]

  it('nothing assigned: every need is missing, and only needed types are rows', () => {
    const grid = coverageGrid(days, [])
    expect(grid.rows.map(r => r.type)).toEqual(['guide', 'vehicle', 'hotel', 'cruise', 'airport_staff', 'hotel_staff'])
    expect(grid.needed).toBe(10)
    expect(grid.covered).toBe(0)
    expect(grid.rows.find(r => r.type === 'guide')!.cells.map(c => c.state)).toEqual(['none', 'missing', 'missing', 'missing'])
  })

  it('a guide for part of the trip covers part of it; one on a free day is extra', () => {
    const grid = coverageGrid(days, [
      { resource_type: 'guide', resource_name: 'Ahmed', start_date: '2026-12-05', end_date: '2026-12-07' },
    ])
    const guide = grid.rows.find(r => r.type === 'guide')!
    expect(guide.cells.map(c => c.state)).toEqual(['extra', 'covered', 'covered', 'missing'])
    expect(guide.cells[1].assigned).toEqual(['Ahmed'])
    expect(guide.covered).toBe(2)
    expect(guide.needed).toBe(3)
  })

  it('an assignment of a type no day needs still gets a row', () => {
    const grid = coverageGrid([day(1, [])], [{ resource_type: 'restaurant', resource_name: 'Abou El Sid', start_date: '2026-12-05' }])
    expect(grid.rows).toHaveLength(1)
    expect(grid.rows[0].cells[0].state).toBe('extra')
  })
})
