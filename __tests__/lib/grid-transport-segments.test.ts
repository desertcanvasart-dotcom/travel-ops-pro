// The grid's save gate counts a route by what it covers in this app's own
// vocabulary (ported in spirit from autoura-saas #612): an Intercity line is
// the road move, a Half Day or Extended Day Tour the sightseeing, a same-day
// return intercity the day's vehicle. It matched only 'day_tour' and the
// retired 'intercity_transfer'.
import { describe, it, expect } from 'vitest'
import { gridCompleteness, transportSegments } from '@/app/pricing-grid/lib/grid-completeness'
import { attachPricingBasis } from '@/app/pricing-grid/lib/attach-basis'
import { DAY_TYPE_LABELS, type GridDay, type GridConfig } from '@/app/pricing-grid/types'

const route = (serviceType: string, tripShape?: string) =>
  ({ slotId: 'route', selectedItems: [{ rateId: 'r1', name: 'X', rateEur: 50, rateNonEur: 60, serviceType, tripShape }], customAmount: 0 })
const priced = (slotId: string) => ({ slotId, selectedItems: [{ rateId: `${slotId}1`, name: 'X', rateEur: 50, rateNonEur: 60 }], customAmount: 0 })
const day = (slots: any[], over: Partial<GridDay> = {}) => ({ id: 'd1', dayNumber: 1, title: 'D', city: 'Cairo', description: '', isExpanded: false, slots, ...over }) as GridDay
const cfg = { withGuide: false } as Partial<GridConfig>
const transportIssues = (d: GridDay) => gridCompleteness([d], cfg).issues.filter(i => i.code.startsWith('missing-transport')).map(i => i.code)

describe('what a route covers', () => {
  it('in this app’s words', () => {
    expect(transportSegments('intercity')).toEqual(['intercity_transfer'])
    expect(transportSegments('intercity', 'same_day_return')).toEqual(['day_tour'])
    expect(transportSegments('intercity_with_sightseeing')).toEqual(['intercity_transfer', 'day_tour'])
    expect(transportSegments('extended_day_tour')).toEqual(['day_tour'])
    expect(transportSegments('airport_with_sightseeing')).toEqual(['airport_transfer', 'day_tour'])
    expect(transportSegments('dinner_transfer')).toEqual([])
  })
})

describe('the gate counts it', () => {
  it('a sightseeing day covered by a Half Day, an Extended Day Tour, or a same-day-return Intercity', () => {
    for (const r of [route('half_day'), route('extended_day_tour'), route('intercity', 'same_day_return')]) {
      expect(transportIssues(day([priced('accommodation'), r], { dayType: 'tour' }))).toEqual([])
    }
  })
  it('a travel day covered by an Intercity', () => {
    expect(transportIssues(day([priced('accommodation'), route('intercity', 'one_way')], { dayType: 'transfer' }))).toEqual([])
  })
  it('a dinner transfer covers neither', () => {
    expect(transportIssues(day([priced('accommodation'), route('dinner_transfer')], { dayType: 'tour' }))).toEqual(['missing-transport-day_tour'])
  })
})

describe('a reloaded transport line', () => {
  it('shows its rate’s current name, at the price it was saved at', () => {
    const loaded = [day([{ slotId: 'route', selectedItems: [{ rateId: 'r1__sedan', name: 'Old name', rateEur: 93.38, rateNonEur: 93.38 }], customAmount: 0 }])]
    const { days } = attachPricingBasis(loaded, { route: [{ id: 'r1__sedan', name: 'Sedan (1-2 pax) — Cairo → Alexandria · Intercity, day trip, back the same day', rateEur: 120, rateNonEur: 120 }] } as never)
    expect(days[0].slots[0].selectedItems[0]).toMatchObject({ name: 'Sedan (1-2 pax) — Cairo → Alexandria · Intercity, day trip, back the same day', rateEur: 93.38 })
  })
})

describe('the Day Type labels', () => {
  it('no longer say "overnight", which reads as a transport rate', () => {
    expect(Object.values(DAY_TYPE_LABELS).some(l => /overnight/i.test(l))).toBe(false)
  })
})
