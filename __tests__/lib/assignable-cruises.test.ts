// The cruise picker: every ship on every route it sails, from the directory
// and from Rates → Nile Cruises; routes read however they are written
// (lib/resources/assignable-cruises.ts).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { assignableCruises, cruiseRouteKey, cruiseRouteLabel, cruiseRoutesPresent, type NileCruiseRow } from '@/lib/resources/assignable-cruises'

const rate = (over: Partial<NileCruiseRow> = {}): NileCruiseRow => ({
  id: 'c1', property_id: null, ship_name: 'Adonis', route_name: 'Luxor to Aswan', embark_city: 'Luxor', disembark_city: 'Aswan', ...over,
})

describe('routes, however they are written', () => {
  it('the three known routes get one key', () => {
    expect(cruiseRouteKey({ route_name: 'luxor_aswan' })).toBe('luxor_aswan')
    expect(cruiseRouteKey({ route_name: 'Luxor - Aswan' })).toBe('luxor_aswan')
    expect(cruiseRouteKey({ route_name: 'LXR-ASW' })).toBe('luxor_aswan')
    expect(cruiseRouteKey({ route_name: null, embark_city: 'Aswan', disembark_city: 'Luxor' })).toBe('aswan_luxor')
    expect(cruiseRouteKey({ route_name: '7 nights round trip', embark_city: 'Luxor', disembark_city: 'Luxor' })).toBe('round_trip')
  })
  it('any other route keeps its own words', () => {
    expect(cruiseRouteKey({ route_name: 'Lake Nasser' })).toBe('Lake Nasser')
    expect(cruiseRouteLabel('Lake Nasser')).toBe('Lake Nasser')
    expect(cruiseRouteLabel('luxor_aswan')).toBe('Luxor → Aswan')
  })
})

describe('the list', () => {
  it('a priced ship is listed once per route, whatever its cabins and seasons', () => {
    const out = assignableCruises([], [rate(), rate({ id: 'c2' }), rate({ id: 'c3', route_name: 'Aswan to Luxor', embark_city: 'Aswan', disembark_city: 'Luxor' })])
    expect(out.map(c => [c.id, c.name, c.route])).toEqual([['c3', 'Adonis', 'aswan_luxor'], ['c1', 'Adonis', 'luxor_aswan']])
  })
  it('the directory entry wins over the same ship on the same route, and keeps its id', () => {
    const out = assignableCruises(
      [{ id: 'dir-1', name: 'Adonis', ship_name: 'Adonis', route: 'Luxor - Aswan', phone: '+20100' }],
      [rate(), rate({ id: 'c3', route_name: 'Lake Nasser', embark_city: 'Aswan', disembark_city: 'Abu Simbel' })],
    )
    expect(out.map(c => [c.id, c.route, c.source])).toEqual([['c3', 'Lake Nasser', 'rates'], ['dir-1', 'luxor_aswan', 'directory']])
  })
  it('a directory ship sailing several routes is one entry with all of them', () => {
    const [c] = assignableCruises([{ id: 'd', name: 'Sonesta', routes: ['luxor_aswan', 'Aswan to Luxor'] }], [])
    expect(c.routes).toEqual(['luxor_aswan', 'aswan_luxor'])
  })
  it('never two entries with the same id, even when one linked ship sails two routes', () => {
    const out = assignableCruises([], [rate({ property_id: 'p1' }), rate({ id: 'c3', property_id: 'p1', route_name: 'Aswan to Luxor', embark_city: 'Aswan', disembark_city: 'Luxor' })])
    expect(new Set(out.map(c => c.id)).size).toBe(2)
  })
  it('inactive and nameless rows are left out', () => {
    expect(assignableCruises([{ id: 'd', name: 'Old', is_active: false }], [rate({ ship_name: '' }), rate({ is_active: false })])).toEqual([])
  })
})

describe('the route filter', () => {
  it('offers every route the cruises sail, the known ones first', () => {
    expect(cruiseRoutesPresent([{ routes: ['Lake Nasser'] }, { route: 'round_trip' }, { routes: ['luxor_aswan', 'Dendera loop'] }]))
      .toEqual(['luxor_aswan', 'round_trip', 'Dendera loop', 'Lake Nasser'])
  })
  it('the picker no longer has the three hard-coded routes', () => {
    const code = readFileSync('app/components/ResourceAssignmentV2.tsx', 'utf8')
    expect(code).not.toMatch(/CRUISE_ROUTE_OPTIONS/)
    expect(code).toMatch(/apiEndpoint: '\/api\/cruises\/assignable'/)
  })
})
