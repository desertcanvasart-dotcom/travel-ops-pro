import { describe, it, expect } from 'vitest'

// The agency's supplements in the pricing grid (2026-09-13): a hotel or
// cruise pick can carry extra per-person-per-night items — a view, a deck,
// a meal plan from Settings → Vocabulary — priced on the rate row. In the
// grid they ride as extra selected items under the property, identified by
// `<propertyId>#supp:<key>`, so the single quote, the pax-range sheet, the
// save mapping and a reload all see the same thing. The single-supplement
// add-on (`<id>_supp`, the solo traveller's extra) keeps its own meaning.

import { calculateDay, calculatePaxRange, buildTransportTierIndex } from '@/app/pricing-grid/lib/calculator'
import { mapSlotsToServices, mapServicesToSlots } from '@/app/pricing-grid/lib/slot-mapping'
import { supplementItemId, isSupplementItem, isSingleSupplementItem } from '@/app/pricing-grid/types'
import type { GridConfig, GridDay, SelectedItem, SlotValue } from '@/app/pricing-grid/types'

function item(over: Partial<SelectedItem> & { rateId: string; rateEur: number; rateNonEur: number }): SelectedItem {
  return { name: over.name ?? over.rateId, ...over }
}
function slot(slotId: string, selectedItems: SelectedItem[], customAmount = 0): SlotValue {
  return { slotId, selectedItems, customAmount }
}
function cfg(over: Partial<GridConfig> = {}): GridConfig {
  return {
    pax: 2, passport: 'eu', tier: 'standard', clientType: 'b2b', withGuide: false,
    currency: 'EUR', marginPercent: 0, exchangeRate: null, startDate: '2026-01-01',
    clientName: '', clientEmail: '', clientPhone: '', tourName: '', nationality: '',
    itineraryId: null, itineraryCode: null, partnerId: null, partnerName: '',
    ...over,
  }
}

const HOTEL = item({ rateId: 'h1', name: 'Hotel A', rateEur: 80, rateNonEur: 90 })
const SINGLE = item({ rateId: 'h1_supp', name: 'Single Supplement', rateEur: 40, rateNonEur: 45 })
const VIEW = item({ rateId: supplementItemId('h1', 'view_nile'), name: 'Nile View (supplement)', rateEur: 20, rateNonEur: 25, supplementKey: 'view_nile' })
const SHIP = item({ rateId: 'c1', name: 'Ship', rateEur: 200, rateNonEur: 220 })
const DECK = item({ rateId: supplementItemId('c1', 'upper_deck'), name: 'Upper Deck (supplement)', rateEur: 30, rateNonEur: 35, supplementKey: 'upper_deck' })

function day(slots: SlotValue[]): GridDay {
  return { id: 'd1', dayNumber: 1, title: 'Day 1', city: 'Cairo', description: '', isExpanded: false, slots }
}

describe('item markers', () => {
  it('tells an agency supplement from the single-supplement add-on, by key or by id', () => {
    expect(isSupplementItem(VIEW)).toBe(true)
    expect(isSupplementItem({ rateId: 'h1#supp:view_nile' })).toBe(true)   // reloaded save, no key
    expect(isSupplementItem(SINGLE)).toBe(false)
    expect(isSingleSupplementItem(SINGLE)).toBe(true)
    expect(isSingleSupplementItem(VIEW)).toBe(false)
  })
})

describe('single quote (calculateDay)', () => {
  it('every traveller pays a hotel supplement per night; the single supplement stays a party-of-one extra', () => {
    const plain = calculateDay(day([slot('accommodation', [HOTEL, SINGLE])]), cfg({ pax: 2 }))
    const withView = calculateDay(day([slot('accommodation', [HOTEL, SINGLE, VIEW])]), cfg({ pax: 2 }))
    expect(plain.perPersonTotal).toBe(80)
    expect(withView.perPersonTotal).toBe(100)
    expect(withView.dailyTotal).toBe(200)
    // Solo: room + single supplement + view, non-EU rates
    const solo = calculateDay(day([slot('accommodation', [HOTEL, SINGLE, VIEW])]), cfg({ pax: 1, passport: 'non_eu' }))
    expect(solo.perPersonTotal).toBe(90 + 45 + 25)
  })

  it('a cruise supplement adds per person too', () => {
    const r = calculateDay(day([slot('cruise', [SHIP, DECK])]), cfg({ pax: 3 }))
    expect(r.perPersonTotal).toBe(230)
    expect(r.dailyTotal).toBe(690)
  })
})

describe('pax-range sheet (calculatePaxRange)', () => {
  it('carries the supplement in PerPerson at every pax count and keeps the single supplement separate', () => {
    const tierIndex = buildTransportTierIndex([])
    const days = [day([slot('accommodation', [HOTEL, SINGLE, VIEW])])]
    const r = calculatePaxRange(days, cfg(), tierIndex, { paxFrom: 1, paxTo: 4 })
    expect(r.singleSupplement).toBe(40)
    for (const row of r.paxPricing) {
      expect(row.withoutLeader.totalCost).toBe(100 * row.numPax)
    }
  })
})

describe('save and reload', () => {
  it('maps a supplement to its own per-pax service line, and a reload brings it back under the hotel', () => {
    const d = day([slot('accommodation', [HOTEL, VIEW])])
    const services = mapSlotsToServices(d, cfg({ pax: 2 }))
    const line = services.find(s => s.service_name === 'Nile View (supplement)')
    expect(line).toMatchObject({ service_type: 'accommodation', quantity: 2, rate_eur: 20, total_cost: 40 })
    expect(line!.notes).toContain('rate_id:h1#supp:view_nile')

    const slots = mapServicesToSlots(services.map((s, i) => ({ id: `svc${i}`, ...s })), 2)
    const acc = slots.find(s => s.slotId === 'accommodation')!
    expect(acc.selectedItems.map(i => i.rateId)).toEqual(['h1', 'h1#supp:view_nile'])
    expect(calculateDay(day([acc]), cfg({ pax: 2 })).perPersonTotal).toBe(100)
  })
})
