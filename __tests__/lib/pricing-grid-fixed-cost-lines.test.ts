// Rates › Fixed Costs on the grid (owner decision 2026-10-14): charged on every
// sightseeing day, per person, with no pick. This pins the pure rule the screen
// (calculator.ts) and the save share — what a sightseeing day is, what a day is
// charged, and how a draft or trip from before this (the Water slot) is
// cleaned — and that the tour-leader / pax-table math carries the costs the
// way the old Water slot did.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  isSightseeingDay, fixedCostsForDay, fixedCostPerPerson, sightseeingDayCount, dropLegacyFixedCostPicks,
} from '@/app/pricing-grid/lib/fixed-cost-lines'
import { calculateDay, calculateGrandTotals, calculatePaxRange, buildTransportTierIndex } from '@/app/pricing-grid/lib/calculator'
import { SLOT_DEFINITIONS, type GridConfig, type GridDay, type SelectedItem } from '@/app/pricing-grid/types'

const item = (id = 'x', rate = 10): SelectedItem => ({ rateId: id, name: id, rateEur: rate, rateNonEur: rate })
const day = (n: number, picks: Record<string, SelectedItem[] | number> = {}): GridDay => ({
  id: `d${n}`, dayNumber: n, title: `Day ${n}`, city: 'Cairo', description: '', isExpanded: false,
  slots: SLOT_DEFINITIONS.map(def => {
    const p = picks[def.slotId]
    return { slotId: def.slotId, selectedItems: Array.isArray(p) ? p : [], customAmount: typeof p === 'number' ? p : 0 }
  }),
})
const COSTS = [{ name: 'Water Bottle', perPersonPerDay: 2 }, { name: 'Wifi', perPersonPerDay: 3 }]
const cfg = (over: Partial<GridConfig> = {}): GridConfig => ({
  pax: 2, passport: 'non_eu', tier: 'standard', clientType: 'b2c', withGuide: true, guideMode: 'spot', currency: 'USD',
  marginPercent: 0, exchangeRate: null, rateCurrency: 'USD', startDate: '2026-11-03', clientName: '', clientEmail: '', clientPhone: '',
  tourName: '', nationality: '', itineraryId: null, itineraryCode: null, partnerId: null, partnerName: '', fixedCosts: COSTS, ...over,
})

describe('a sightseeing day (the engine’s guide-required-or-attractions rule, read off the picks)', () => {
  it('a guide pick, a typed guide amount, or any entrance / experience / boat ride', () => {
    expect(isSightseeingDay(day(1, { guide: [item()] }), true)).toBe(true)
    expect(isSightseeingDay(day(1, { guide: 50 }), true)).toBe(true)
    expect(isSightseeingDay(day(1, { entrance_fees: [item()] }), true)).toBe(true)
    expect(isSightseeingDay(day(1, { experiences: [item()] }), true)).toBe(true)
    expect(isSightseeingDay(day(1, { boat_rides: 30 }), true)).toBe(true)
  })
  it('a day with only a hotel, meals, transport, flights or tips is not one', () => {
    const d = day(1, { accommodation: [item()], meals: [item()], route: [item()], flights: [item()], tipping: [item()], airport_services: [item()] })
    expect(isSightseeingDay(d, true)).toBe(false)
  })
  it('guide switched off: the guide alone no longer makes the day; an attraction still does', () => {
    expect(isSightseeingDay(day(1, { guide: [item()] }), false)).toBe(false)
    expect(isSightseeingDay(day(1, { guide: 50 }), false)).toBe(false)
    expect(isSightseeingDay(day(1, { guide: [item()], entrance_fees: [item()] }), false)).toBe(true)
  })
  it('counts the days', () => {
    expect(sightseeingDayCount([day(1, { guide: [item()] }), day(2), day(3, { entrance_fees: [item()] })], true)).toBe(2)
  })
})

describe('what a day is charged', () => {
  it('every cost on a sightseeing day, none on another; zero or unusable amounts add nothing', () => {
    const on = day(1, { entrance_fees: [item()] })
    expect(fixedCostsForDay(on, { withGuide: true, fixedCosts: COSTS })).toEqual(COSTS)
    expect(fixedCostPerPerson(on, { withGuide: true, fixedCosts: COSTS })).toBe(5)
    expect(fixedCostsForDay(day(2), { withGuide: true, fixedCosts: COSTS })).toEqual([])
    expect(fixedCostsForDay(on, { withGuide: true, fixedCosts: [{ name: 'Z', perPersonPerDay: 0 }, { name: 'N', perPersonPerDay: NaN }] })).toEqual([])
    expect(fixedCostsForDay(on, { withGuide: true })).toEqual([])
  })
})

describe('the screen’s price', () => {
  const days = [day(1, { entrance_fees: [item('e', 10)] }), day(2, { guide: [item('g', 80)] }), day(3, { accommodation: [item('h', 100)] })]
  it('a sightseeing day adds the costs per person; the others do not; a day’s pick of anything else is unchanged', () => {
    expect(calculateDay(days[0], cfg())).toMatchObject({ perPersonTotal: 15, dailyPerPerson: 15, exactTotal: 30 })
    expect(calculateDay(days[0], cfg({ fixedCosts: [] })).perPersonTotal).toBe(10)
    expect(calculateDay(days[2], cfg()).perPersonTotal).toBe(100)
  })
  it('the trip total is the picks plus costs × sightseeing days × pax, and per person follows', () => {
    const totals = calculateGrandTotals(days, cfg({ marginPercent: 20 }))
    // entrance 10×2 + guide 80 + hotel 100×2 + costs 5 × 2 days × 2 pax
    expect(totals.totalCost).toBe(20 + 80 + 200 + 20)
    expect(totals.sellingPriceTotal).toBe(384)
    expect(totals.sellingPricePerPerson).toBe(192)
  })
  it('no per-day choice: a day cannot opt out, a legacy water slot adds nothing', () => {
    const withOldWater = { ...days[0], slots: [...days[0].slots, { slotId: 'water', selectedItems: [item('water-standard', 0.5)], customAmount: 0 }] }
    expect(calculateDay(withOldWater, cfg()).perPersonTotal).toBe(15)
  })
})

describe('the tour-leader and pax tables carry them as water was carried', () => {
  const days = [day(1, { entrance_fees: [item('e', 10)] }), day(2, { entrance_fees: [item('e', 10)] })]
  const sheet = (fixedCosts: GridConfig['fixedCosts']) =>
    calculatePaxRange(days, cfg({ fixedCosts, marginPercent: 0 }), buildTransportTierIndex([]), { paxFrom: 2, paxTo: 3 }).paxPricing
  it('per person on every pax count and for the leader', () => {
    const without = sheet([])
    const withCosts = sheet(COSTS)
    for (let i = 0; i < without.length; i++) {
      // 5 per person per day × 2 days = 10 per person more.
      expect(withCosts[i].withoutLeader.sellingPrice - without[i].withoutLeader.sellingPrice).toBeCloseTo(10 * withCosts[i].numPax, 2)
      // The leader is one more body paying his own per-person costs (tourLeaderCost = perPerson + single supplement).
      expect(withCosts[i].withLeader.sellingPrice - without[i].withLeader.sellingPrice).toBeCloseTo(10 * (withCosts[i].numPax + 1), 2)
    }
  })
  it('the pax-table price at the quote’s own pax equals the single quote', () => {
    const table = sheet(COSTS).find(r => r.numPax === 2)!
    const single = calculateGrandTotals(days, cfg({ marginPercent: 0 }))
    expect(table.withoutLeader.sellingPrice).toBe(single.sellingPriceTotal)
  })
})

describe('earlier picks are not charged twice', () => {
  it('the old Water slot is dropped from a draft; the same array back when there is none', () => {
    const old = { ...day(1, { entrance_fees: [item()] }), slots: [...day(1).slots, { slotId: 'water', selectedItems: [item('water-standard', 0.5)], customAmount: 0 }] }
    const clean = day(2)
    const out = dropLegacyFixedCostPicks([old, clean])
    expect(out[0].slots.some(s => s.slotId === 'water')).toBe(false)
    expect(out[0].slots).toHaveLength(old.slots.length - 1)
    expect(out[1]).toBe(clean)
    const none = [clean]
    expect(dropLegacyFixedCostPicks(none)).toBe(none)
  })
  it('the slot list no longer has Water', () => {
    expect(SLOT_DEFINITIONS.map(s => s.slotId)).not.toContain('water')
  })
})

describe('the screen shows them read-only, in both languages', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('DayRow lists the day’s fixed costs from the shared rule, with i18n text and no pick', () => {
    const src = read('app/pricing-grid/components/DayRow.tsx')
    expect(src).toContain('fixedCostsForDay(day, config)')
    expect(src).toContain("t('fixedCosts')")
    expect(src).not.toContain('APPLY_TO_ALL_SLOTS')
    for (const l of ['en', 'ja']) {
      const m = JSON.parse(read(`messages/${l}.json`))
      for (const k of ['fixedCosts', 'fixedCostsHint', 'perPerson']) expect(m.pricingGrid[k]).toBeTruthy()
    }
  })
  it('the page takes the costs and warnings from the rates route, shows the warnings, and cleans an old draft', () => {
    const src = read('app/pricing-grid/page.tsx')
    expect(src).toContain('data.fixedCosts?.items')
    expect(src).toContain('fixedCosts: fixedCosts.items')
    expect(src).toContain('fixed-cost-warnings')
    expect(src).toContain('dropLegacyFixedCostPicks(loadFromStorage')
  })
  it('the AI parse no longer fills a water pick', () => {
    const src = read('app/api/pricing-grid/parse/route.ts')
    expect(src).not.toContain('water-standard')
    expect(src).not.toContain('slots.water')
  })
})
