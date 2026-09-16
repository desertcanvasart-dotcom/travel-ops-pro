// The cost breakdown reads like the day runs (operator, 2026-09-16).
//
// The operator could not check a quote against the programme: within a day the
// lines came out in whatever order the engine computed them, with every fixed
// cost forced ahead of every per-person one. These pin the one ordering rule
// the engine and the calculator page share.
import { describe, it, expect } from 'vitest'
import { flowRank, isBookableLine, sortByItineraryFlow, type FlowLine } from '@/lib/pricing/breakdown-order'

const line = (id: string, category: string, dayNumber: number | null): FlowLine => ({ id, category, dayNumber })

describe('a day reads in the order it runs', () => {
  it('breakfast, travel, sights, lunch, dinner, the night, then tips', () => {
    // Day 7 of NMS803-CR-ABS as the engine emits it: guide and tips first,
    // hotel before the fees, transport last.
    const engineOrder = [
      line('day7-guide', 'guide', 7),
      line('day7-tips-guide', 'tips', 7),
      line('day7-hotel', 'accommodation', 7),
      line('entrance-abu-simbel', 'entrance', 7),
      line('day7-breakfast', 'meal', 7),
      line('day7-lunch', 'meal', 7),
      line('day7-dinner', 'meal', 7),
      line('water-day-7', 'water', 7),
      line('day7-ticket-flight', 'flight', 7),
      line('day7-transport', 'transportation', 7),
    ]
    const ids = sortByItineraryFlow(engineOrder, x => x).map(x => x.id)
    expect(ids).toEqual([
      'day7-breakfast',
      'day7-ticket-flight',
      'day7-transport',
      'day7-guide',
      'entrance-abu-simbel',
      'water-day-7',
      'day7-lunch',
      'day7-dinner',
      'day7-hotel',
      'day7-tips-guide',
    ])
  })

  it('leaving one hotel comes before the travel, arriving at the next one after it', () => {
    const ids = sortByItineraryFlow([
      line('day6-hotel-checkin', 'hotel_service', 6),
      line('day6-transport', 'transportation', 6),
      line('day6-hotel-checkout', 'hotel_service', 6),
      line('day6-airport-arrival', 'airport_service', 6),
      line('day6-airport-departure', 'airport_service', 6),
      line('day6-ticket-flight', 'flight', 6),
    ], x => x).map(x => x.id)
    expect(ids).toEqual([
      'day6-hotel-checkout',
      'day6-airport-departure',
      'day6-ticket-flight',
      'day6-airport-arrival',
      'day6-transport',
      'day6-hotel-checkin',
    ])
  })

  it('a night\'s supplements and the guide\'s bed follow the night itself', () => {
    const ids = sortByItineraryFlow([
      line('day3-guide-bed', 'accommodation', 3),
      line('day3-hotel-supp-view_nile', 'accommodation', 3),
      line('day3-hotel', 'accommodation', 3),
    ], x => x).map(x => x.id)
    expect(ids).toEqual(['day3-hotel', 'day3-hotel-supp-view_nile', 'day3-guide-bed'])
  })

  it('the guide\'s own meals and tickets sit beside the customers\'', () => {
    expect(flowRank(line('day4-lunch', 'meal', 4))).toBeLessThan(flowRank(line('day4-guide-lunch', 'meal', 4)))
    expect(flowRank(line('day4-guide-lunch', 'meal', 4))).toBeLessThan(flowRank(line('day4-dinner', 'meal', 4)))
    expect(flowRank(line('day4-ticket-flight', 'flight', 4))).toBeLessThan(flowRank(line('day4-guide-ticket', 'flight', 4)))
  })
})

describe('across the trip', () => {
  it('orders by day first, and lines with no day come last', () => {
    const ids = sortByItineraryFlow([
      line('rooming-adjustment', 'accommodation', null),
      line('day2-hotel', 'accommodation', 2),
      line('day1-breakfast', 'meal', 1),
      line('day10-lunch', 'meal', 10),
    ], x => x).map(x => x.id)
    expect(ids).toEqual(['day1-breakfast', 'day2-hotel', 'day10-lunch', 'rooming-adjustment'])
  })

  it('keeps the programme order of two lines with the same place in the day', () => {
    const ids = sortByItineraryFlow([
      line('entrance-karnak', 'entrance', 2),
      line('entrance-luxor-temple', 'entrance', 2),
    ], x => x).map(x => x.id)
    expect(ids).toEqual(['entrance-karnak', 'entrance-luxor-temple'])
  })
})

describe('isBookableLine — what travels into a quote', () => {
  it('a priced line and a line with no rate are real services', () => {
    expect(isBookableLine({})).toBe(true)
    expect(isBookableLine({ unpriced: true, issue: 'No standard hotel rate for "Abu Simbel".' })).toBe(true)
  })

  it('an included meal, a free site and an unmatched sight are breakdown-only', () => {
    expect(isBookableLine({ included: true, issue: 'Included aboard the cruise' })).toBe(false)
    expect(isBookableLine({ included: true, issue: 'Free entry' })).toBe(false)
    expect(isBookableLine({ issue: 'No entrance fee matched.' })).toBe(false)
  })
})
