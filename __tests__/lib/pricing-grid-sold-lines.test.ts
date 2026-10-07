// What the grid charges, on screen and in the B2B sheet: the guide switch by
// each tip's role, a typed accommodation amount, the single supplement for a
// party of one (app/pricing-grid/lib/guide-rule.ts, sold-lines.ts).
import { describe, it, expect } from 'vitest'
import { calculateDay, calculatePaxRange, buildTransportTierIndex } from '@/app/pricing-grid/lib/calculator'
import { isGuideTip } from '@/app/pricing-grid/lib/guide-rule'
import { soldAccommodationItems, throughoutGuideRows } from '@/app/pricing-grid/lib/sold-lines'
import { attachPricingBasis } from '@/app/pricing-grid/lib/attach-basis'
import type { GridConfig, GridDay, SlotValue } from '@/app/pricing-grid/types'

const slot = (slotId: string, items: Array<Record<string, unknown>> = [], customAmount = 0): SlotValue =>
  ({ slotId, selectedItems: items as never, customAmount })
const config = (over: Partial<GridConfig> = {}): GridConfig => ({
  pax: 2, passport: 'non_eu', tier: 'standard', clientType: 'b2c', withGuide: true, guideMode: 'spot',
  currency: 'EUR', marginPercent: 0, exchangeRate: null, startDate: '2026-11-03', clientName: '',
  clientEmail: '', clientPhone: '', tourName: '', nationality: '', itineraryId: null, itineraryCode: null,
  partnerId: null, partnerName: '', ...over,
} as GridConfig)
const day = (slots: SlotValue[]): GridDay => ({ dayNumber: 1, slots } as unknown as GridDay)

const UUID = '33333333-3333-4333-8333-333333333333'

describe('the guide switch decides by whose tip it is', () => {
  const tips = slot('tipping', [
    { rateId: UUID, name: 'Guide tip', rateEur: 10, rateNonEur: 10, tipRole: 'guide' },
    { rateId: '44444444-4444-4444-8444-444444444444', name: 'Driver tip', rateEur: 5, rateNonEur: 5, tipRole: 'driver' },
  ])
  it('guide off drops the guide’s tip — whose id is a UUID — and keeps the driver’s', () => {
    expect(calculateDay(day([tips]), config({ withGuide: false })).groupTotal).toBe(5)
    expect(calculateDay(day([tips]), config({ withGuide: true })).groupTotal).toBe(15)
  })
  it('the B2B sheet agrees', () => {
    const r = calculatePaxRange([day([tips])], config({ withGuide: false }), buildTransportTierIndex([]), { paxFrom: 2, paxTo: 2 })
    expect(r.paxPricing[0].withoutLeader.totalCost).toBe(5)
  })
  it('the role, else the id', () => {
    expect(isGuideTip({ rateId: UUID, tipRole: 'guide' })).toBe(true)
    expect(isGuideTip({ rateId: UUID, tipRole: 'driver' })).toBe(false)
    expect(isGuideTip({ rateId: 'guide_tip' })).toBe(true)
  })
  it('a reloaded tip takes its rate’s role', () => {
    const loaded = [day([slot('tipping', [{ rateId: UUID, name: 'Tip', rateEur: 10, rateNonEur: 10 }])])]
    const { days } = attachPricingBasis(loaded, { tipping: [{ id: UUID, name: 'Tip', rateEur: 10, rateNonEur: 10, tip_role: 'guide' }] } as never)
    expect(days[0].slots[0].selectedItems[0].tipRole).toBe('guide')
  })
})

describe('accommodation', () => {
  const hotel = { rateId: 'h1', name: 'Hotel', rateEur: 100, rateNonEur: 100 }
  const single = { rateId: 'h1_supp', name: 'Single Supplement', rateEur: 50, rateNonEur: 50 }
  const view = { rateId: 'h1#supp:view', name: 'Nile view', rateEur: 20, rateNonEur: 20, supplementKey: 'view' }
  it('the single supplement for a party of one; the agency’s supplements for everyone', () => {
    expect(soldAccommodationItems([hotel, single, view], 2).map(i => i.rateId)).toEqual(['h1', 'h1#supp:view'])
    expect(soldAccommodationItems([hotel, single, view], 1).map(i => i.rateId)).toEqual(['h1', 'h1_supp', 'h1#supp:view'])
  })
  it('a typed amount is per person and wins — on screen and in the B2B sheet', () => {
    const typed = day([slot('accommodation', [hotel], 80)])
    expect(calculateDay(typed, config()).perPersonTotal).toBe(80)
    const r = calculatePaxRange([typed], config(), buildTransportTierIndex([]), { paxFrom: 2, paxTo: 2 })
    expect(r.paxPricing[0].withoutLeader.totalCost).toBe(160)
  })
})

describe('the throughout guide’s own costs, as the calculator charges them', () => {
  const cfg = { guideMode: 'throughout', withGuide: true, pax: 2, passport: 'non_eu' as const }
  it('bed, seat (guide fare, else passenger fare), meals at three or fewer', () => {
    const rows = throughoutGuideRows([
      slot('accommodation', [{ rateId: 'h1', name: 'Hotel', rateEur: 100, rateNonEur: 100, guideRate: 40 }]),
      slot('flights', [{ rateId: 'f1', name: 'CAI→LXR', rateEur: 120, rateNonEur: 120, guideRate: null }]),
      slot('meals', [{ rateId: 'm1', name: 'Lunch', rateEur: 30, rateNonEur: 30 }]),
    ], cfg, '2026-11-03')
    expect(rows.map(r => `${r.kind} ${r.amount}`)).toEqual(['bed 40', 'seat 120', 'meal 30'])
    const d = day([
      slot('accommodation', [{ rateId: 'h1', name: 'Hotel', rateEur: 100, rateNonEur: 100, guideRate: 40 }]),
      slot('flights', [{ rateId: 'f1', name: 'CAI→LXR', rateEur: 120, rateNonEur: 120, guideRate: null }]),
      slot('meals', [{ rateId: 'm1', name: 'Lunch', rateEur: 30, rateNonEur: 30 }]),
    ])
    expect(calculateDay(d, config({ guideMode: 'throughout' })).groupTotal).toBe(190)
  })
  it('no meals for four or more; nothing with the guide off or a spot guide', () => {
    const meals = [slot('meals', [{ rateId: 'm1', name: 'Lunch', rateEur: 30, rateNonEur: 30 }])]
    expect(throughoutGuideRows(meals, { ...cfg, pax: 4 }, null)).toEqual([])
    expect(throughoutGuideRows(meals, { ...cfg, withGuide: false }, null)).toEqual([])
    expect(throughoutGuideRows(meals, { ...cfg, guideMode: 'spot' }, null)).toEqual([])
  })
})
