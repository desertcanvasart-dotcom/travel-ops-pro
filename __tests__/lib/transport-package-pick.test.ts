// ============================================
// Tours › Transport Packages — which package prices a cruise, and the rules
// that keep the rows from contradicting each other (Tours audit, 2026-10)
// ============================================
// #2: the package was chosen by length alone, from rows in heap order — a
//     5-day Multi-Day Tour could price a 4-night cruise, and editing either
//     package could switch every quote between them.
// #8: duplicates and a duration of 0 or less were accepted; deleting the last
//     package of a length was silent.
// #10: a partner's per-variation override applied outside its dates.
import { describe, it, expect } from 'vitest'
import {
  cruiseSailings, firstSailing, packageForDuration, pickPackage, routeFit, sailingRoute,
} from '@/lib/pricing/cruise-package'
import { duplicateOf, lengthLeftWithout, sameSlot, validDuration } from '@/lib/b2b/transport-packages'
import { partnerOverrideOn } from '@/lib/b2b/partner-margin'

const pkg = (id: string, over: Record<string, unknown> = {}) => ({
  id, package_type: 'cruise_sightseeing', duration_days: 5, origin_city: 'Luxor', destination_city: 'Aswan',
  created_at: '2026-01-01T00:00:00Z', is_active: true, ...over,
})
const day = (n: number, city: string, aboard = false) => ({ day: n, city, is_cruise_day: aboard })
// Luxor → Aswan, 4 nights: board in Luxor, leave the ship in Aswan.
const DOWNSTREAM = [day(1, 'Cairo'), day(2, 'Luxor', true), day(3, 'Edfu', true), day(4, 'Kom Ombo', true), day(5, 'Aswan', true), day(6, 'Aswan')]
const route = (days: typeof DOWNSTREAM) => sailingRoute(days, cruiseSailings(days)[0])

describe('the cruise package is chosen by type, length and route — in a fixed order', () => {
  it('a Multi-Day Tour of the same length never prices a cruise, whatever order the rows come in', () => {
    const multi = pkg('multi', { package_type: 'multi_day', origin_city: 'Cairo', destination_city: 'Alexandria', created_at: '2025-01-01T00:00:00Z' })
    const cruise = pkg('cruise')
    expect(packageForDuration([multi, cruise], 5)?.id).toBe('cruise')
    expect(packageForDuration([cruise, multi], 5)?.id).toBe('cruise')
    expect(packageForDuration([multi], 5)).toBeNull()
  })

  it('a Cruise Transfer of the same length does not either', () => {
    expect(packageForDuration([pkg('t', { package_type: 'cruise_transfer' })], 5)).toBeNull()
  })

  it('two fitting packages: the oldest wins, in either order — an edit does not move quotes', () => {
    const older = pkg('b-older', { created_at: '2026-01-01T00:00:00Z' })
    const newer = pkg('a-newer', { created_at: '2026-06-01T00:00:00Z' })
    expect(packageForDuration([older, newer], 5)?.id).toBe('b-older')
    expect(packageForDuration([newer, older], 5)?.id).toBe('b-older')
    // Same creation time: by id.
    const twin = pkg('a-twin')
    expect(packageForDuration([older, twin], 5)?.id).toBe('a-twin')
    expect(packageForDuration([twin, older], 5)?.id).toBe('a-twin')
  })

  it("the sailing's route runs from the boarding day to the disembark day", () => {
    expect(route(DOWNSTREAM)).toEqual(['cairo', 'luxor', 'edfu', 'kom ombo', 'aswan', 'aswan'])
  })

  it('a package for the other direction is skipped; one on the route wins over one naming no cities', () => {
    const up = pkg('up', { origin_city: 'Aswan', destination_city: 'Luxor', created_at: '2025-01-01T00:00:00Z' })
    const down = pkg('down')
    const open = pkg('open', { origin_city: null, destination_city: null, created_at: '2024-01-01T00:00:00Z' })
    const r = route(DOWNSTREAM)
    expect(routeFit(up, r)).toBe('conflict')
    expect(routeFit(down, r)).toBe('match')
    expect(packageForDuration([up, down, open], 5, r)?.id).toBe('down')
    expect(packageForDuration([up, open], 5, r)?.id).toBe('open')
    expect(packageForDuration([up], 5, r)).toBeNull()
  })

  it('a package naming neither city of the route is skipped; days that name no city check nothing', () => {
    const elsewhere = pkg('elsewhere', { origin_city: 'Cairo', destination_city: 'Alexandria' })
    const nileOnly = [day(1, 'Luxor', true), day(2, 'Luxor', true)]
    expect(routeFit(elsewhere, ['luxor', 'edfu', 'aswan'])).toBe('conflict')
    expect(routeFit(pkg('down'), [])).toBe('open')
    // "Luxor" matches a stop written "Luxor (East Bank)".
    expect(routeFit(pkg('down'), ['luxor (east bank)', 'aswan'])).toBe('match')
    expect(sailingRoute(nileOnly, cruiseSailings(nileOnly)[0])).toEqual(['luxor', 'luxor'])
  })

  it("the calculator's own pick: any type the caller names, length optional", () => {
    const t1 = pkg('t1', { package_type: 'cruise_transfer', duration_days: 1 })
    expect(pickPackage([t1], { type: 'cruise_transfer' })?.id).toBe('t1')
    expect(pickPackage([t1], { type: 'cruise_transfer', durationDays: 5 })).toBeNull()
  })

  it("a template's first sailing gives the length and route; no cruise days → the tour's length", () => {
    expect(firstSailing(DOWNSTREAM, 6)).toEqual({ durationDays: 5, route: route(DOWNSTREAM) })
    expect(firstSailing([day(1, 'Cairo'), day(2, 'Giza')], 2)).toEqual({ durationDays: 2, route: [] })
    expect(firstSailing(null, 4)).toEqual({ durationDays: 4, route: [] })
  })
})

describe('package rows that cannot contradict each other', () => {
  it('duration is a whole number of days, 1 or more', () => {
    expect(validDuration(5)).toBe(5)
    expect(validDuration('3')).toBe(3)
    for (const bad of [0, -3, 2.5, '', 'x', null, undefined]) expect(validDuration(bad)).toBeNull()
  })

  it('a second active package of the same type, length and route is a duplicate', () => {
    const existing = [pkg('a')]
    expect(duplicateOf(pkg('new', { origin_city: 'luxor ' }), existing)?.id).toBe('a')
    expect(duplicateOf(pkg('new', { is_active: false }), existing)).toBeNull()
    expect(duplicateOf(pkg('new', { duration_days: 4 }), existing)).toBeNull()
    expect(duplicateOf(pkg('new', { origin_city: 'Aswan', destination_city: 'Luxor' }), existing)).toBeNull()
    expect(duplicateOf(pkg('new'), [pkg('a', { is_active: false })])).toBeNull()
    // Saving a package over itself is not a duplicate.
    expect(duplicateOf(pkg('a'), existing)).toBeNull()
    expect(sameSlot(pkg('x'), pkg('y', { package_type: 'multi_day' }))).toBe(false)
  })

  it('removing the last active Cruise Sightseeing package of a length is flagged', () => {
    const only5 = pkg('only5')
    const all = [only5, pkg('four', { duration_days: 4 }), pkg('inactive5', { is_active: false })]
    expect(lengthLeftWithout(only5, null, all)).toBe(5)                                  // deleted
    expect(lengthLeftWithout(only5, { ...only5, is_active: false }, all)).toBe(5)        // deactivated
    expect(lengthLeftWithout(only5, { ...only5, duration_days: 6 }, all)).toBe(5)        // moved length
    expect(lengthLeftWithout(only5, { ...only5, package_type: 'day_tour' }, all)).toBe(5) // moved type
    expect(lengthLeftWithout(only5, { ...only5, package_name: 'Renamed' } as any, all)).toBeNull()
    // Another active 5-day package (any route) still prices those cruises.
    expect(lengthLeftWithout(only5, null, [...all, pkg('other5', { origin_city: 'Aswan', destination_city: 'Luxor' })])).toBeNull()
    // A package that never priced a cruise is not flagged.
    expect(lengthLeftWithout(pkg('m', { package_type: 'multi_day' }), null, all)).toBeNull()
  })
})

describe("a partner's per-variation override honours its dates", () => {
  const rows = [
    { id: 'old', margin_percent_override: 5, valid_from: '2026-01-01', valid_to: '2026-06-30' },
    { id: 'open', margin_percent_override: 8, valid_from: null, valid_to: null },
    { id: 'summer', margin_percent_override: 12, valid_from: '2027-06-01', valid_to: '2027-08-31' },
  ]
  it('in force on the travel date, inclusive; the latest-starting one wins', () => {
    expect(partnerOverrideOn(rows, '2026-03-01')?.id).toBe('old')
    expect(partnerOverrideOn(rows, '2026-06-30')?.id).toBe('old')
    expect(partnerOverrideOn(rows, '2026-07-01')?.id).toBe('open')
    expect(partnerOverrideOn(rows, '2027-07-15')?.id).toBe('summer')
    expect(partnerOverrideOn([...rows].reverse(), '2027-07-15')?.id).toBe('summer')
  })
  it('expired or not yet started: none', () => {
    expect(partnerOverrideOn([rows[0]], '2026-07-01')).toBeNull()
    expect(partnerOverrideOn([rows[2]], '2027-05-31')).toBeNull()
  })
})
