import { describe, it, expect } from 'vitest'
import { calculateDay, calculatePaxRange, buildTransportTierIndex, countMissingGuideBeds } from '@/app/pricing-grid/lib/calculator'
import { mapSlotsToServices, mapServicesToSlots } from '@/app/pricing-grid/lib/slot-mapping'
import type { GridConfig, GridDay, SlotValue } from '@/app/pricing-grid/types'

// The Quote Builder learns the throughout "+1" (operator ask 2026-09-05):
// same rules as the auto engine — the guide's bed from the chosen row's
// guide rate, his meals for groups of 3 or fewer, a seat on every flight
// pick at the guide fare (else customer fare), vehicles sized at pax+1 on
// the rate sheet — computed purely from what the slots already hold.

const slot = (slotId: string, items: Array<Record<string, unknown>> = []): SlotValue =>
  ({ slotId, selectedItems: items as never, customAmount: 0 })

const config = (over: Partial<GridConfig> = {}): GridConfig => ({
  pax: 2, passport: 'non_eu', tier: 'standard', clientType: 'b2c',
  withGuide: true, guideMode: 'throughout', currency: 'USD', marginPercent: 0,
  exchangeRate: null, startDate: '2026-11-03', clientName: '', clientEmail: '',
  clientPhone: '', tourName: '', nationality: '', itineraryId: null,
  itineraryCode: null, partnerId: null, partnerName: '',
} as GridConfig)

const day = (slots: SlotValue[]): GridDay => ({ dayNumber: 1, slots } as unknown as GridDay)

const hotel = { rateId: 'h1', name: 'Cairo Standard', rateEur: 85, rateNonEur: 95, guideRate: 40 }
const flight = { rateId: 'f1', name: 'CAI→LXR', rateEur: 120, rateNonEur: 120, guideRate: 100 }
const flightNoGuideFare = { rateId: 'f2', name: 'LXR→CAI', rateEur: 120, rateNonEur: 120, guideRate: null }
const lunch = { rateId: 'm1', name: 'Lunch', rateEur: 30, rateNonEur: 30 }
const guide = { rateId: 'g1', name: 'Guide', rateEur: 75, rateNonEur: 75 }

describe('calculateDay in throughout mode', () => {
  it("adds the guide's bed, flight seats (guide fare else customer fare) and small-group meals to GROUP costs", () => {
    const d = day([
      slot('guide', [guide]),
      slot('accommodation', [hotel]),
      slot('flights', [flight, flightNoGuideFare]),
      slot('meals', [lunch]),
    ])
    const spot = calculateDay(d, { ...config(), guideMode: 'spot' })
    const thr = calculateDay(d, config())
    // +40 bed, +100 guide-fare seat, +120 customer-fare seat, +30 meal (pax 2 ≤ 3)
    expect(thr.groupTotal - spot.groupTotal).toBe(40 + 100 + 120 + 30)
    // Per-person side unchanged — the "+1" is a group cost.
    expect(thr.perPersonTotal).toBe(spot.perPersonTotal)
  })

  it('4+ pax eat the guide free; without a guide, throughout adds nothing', () => {
    const d = day([slot('accommodation', [hotel]), slot('meals', [lunch])])
    const four = calculateDay(d, { ...config(), pax: 4 })
    const fourSpot = calculateDay(d, { ...config(), pax: 4, guideMode: 'spot' })
    expect(four.groupTotal - fourSpot.groupTotal).toBe(40) // bed only, no meal
    const noGuide = calculateDay(d, { ...config(), withGuide: false })
    expect(noGuide.groupTotal).toBe(calculateDay(d, { ...config(), withGuide: false, guideMode: 'spot' }).groupTotal)
  })

  it('a chosen hotel without a guide rate adds nothing silently — the counter reports it', () => {
    const bare = { ...hotel, guideRate: 0 }
    const d = day([slot('accommodation', [bare])])
    expect(calculateDay(d, config()).groupTotal).toBe(calculateDay(d, { ...config(), guideMode: 'spot' }).groupTotal)
    expect(countMissingGuideBeds([d], config())).toBe(1)
    expect(countMissingGuideBeds([d], { ...config(), guideMode: 'spot' })).toBe(0)
  })
})

describe('rate sheet in throughout mode', () => {
  it('sizes the vehicle at pax+1 — the band tips one seat earlier', () => {
    // Sedan holds 1-3, minivan 4-7: at 3 pax the "+1" forces the minivan.
    const routeOptions = [
      { id: 'r1__sedan', name: 'Sedan', rateEur: 70, rateNonEur: 70, capacity_min: 1, capacity_max: 3 },
      { id: 'r1__minivan', name: 'Minivan', rateEur: 100, rateNonEur: 100, capacity_min: 4, capacity_max: 7 },
    ] as never[]
    const tierIndex = buildTransportTierIndex(routeOptions)
    const d = day([slot('route', [{ rateId: 'r1__sedan', name: 'Sedan', rateEur: 70, rateNonEur: 70 }])])
    const spotRow = calculatePaxRange([d], { ...config(), guideMode: 'spot' }, tierIndex, { paxFrom: 3, paxTo: 3 }).paxPricing[0]
    const thrRow = calculatePaxRange([d], config(), tierIndex, { paxFrom: 3, paxTo: 3 }).paxPricing[0]
    expect(thrRow.withoutLeader.totalCost - spotRow.withoutLeader.totalCost).toBe(30) // 100 − 70
  })
})

describe('saving a throughout quote', () => {
  it('writes synthetic guide rows the reload skips (never doubled back into slots)', () => {
    const d = day([
      slot('accommodation', [hotel]),
      slot('flights', [flight]),
      slot('meals', [lunch]),
    ])
    const rows = mapSlotsToServices(d, config())
    const synthetic = rows.filter(r => (r.notes ?? '').startsWith('slot:throughout_guide'))
    expect(synthetic.map(r => [r.service_name, r.total_cost])).toEqual([
      ['Throughout Guide — bed (Cairo Standard)', 40],
      ['Throughout Guide — seat (CAI→LXR)', 100],
      ['Throughout Guide — Lunch', 30],
    ])
    // Round-trip: the synthetic rows must NOT rejoin the slots.
    const slots = mapServicesToSlots(rows.map((r, i) => ({ id: String(i), ...r })), 2)
    const flightsBack = slots.find(sl => sl.slotId === 'flights')!
    expect(flightsBack.selectedItems).toHaveLength(1)
    const accBack = slots.find(sl => sl.slotId === 'accommodation')!
    expect(accBack.selectedItems.filter(i => /Throughout/.test(i.name))).toHaveLength(0)
  })

  it('spot mode writes exactly what it always wrote', () => {
    const d = day([slot('accommodation', [hotel]), slot('flights', [flight])])
    const rows = mapSlotsToServices(d, { ...config(), guideMode: 'spot' })
    expect(rows.some(r => /Throughout/.test(r.service_name))).toBe(false)
  })
})
