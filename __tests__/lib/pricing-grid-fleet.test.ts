// A group bigger than the route's largest vehicle rides in several of it, on
// the Pricing Grid as in trip pricing and quotes (vehicleFleetForPax). The
// grid's own chooser offered one of the largest, so 60 people were priced as
// one bus on screen and in the save.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { withFleet } from '@/app/pricing-grid/lib/hydrate-items'

const bus = { id: 'r1__bus', name: 'Cairo day — Bus', rateEur: 300, rateNonEur: 300, capacity_min: 20, capacity_max: 45 } as any
const item = (o: any) => ({ rateId: o.id, name: o.name, rateEur: o.rateEur, rateNonEur: o.rateNonEur }) as any

describe('several vehicles for a big group', () => {
  it('60 people ride in 2 buses, at twice the rate', () => {
    expect(withFleet(item(bus), bus, 60)).toMatchObject({ name: '2 × Cairo day — Bus', rateEur: 600, rateNonEur: 600 })
  })

  it('a group the vehicle seats is one vehicle', () => {
    expect(withFleet(item(bus), bus, 45)).toEqual(item(bus))
    expect(withFleet(item(bus), bus, 30)).toEqual(item(bus))
  })

  it('a vehicle with no capacity stays one vehicle', () => {
    expect(withFleet(item({ ...bus, capacity_max: null }), { ...bus, capacity_max: null }, 60).rateEur).toBe(300)
  })

  it('is applied where the screen and the save both rebuild a route vehicle', () => {
    const src = readFileSync('app/pricing-grid/lib/hydrate-items.ts', 'utf8')
    expect(src).toContain('return withFleet(fromOption(item, vehicle), vehicle, pax)')
  })
})
