import { describe, it, expect } from 'vitest'
import {
  rateValidOn, pickGuideRate, isHalfDayGuiding, pickMealRate, mealCostForGroup, mealVoucherQuantity,
} from '@/lib/pricing/service-rates'
import { resolveAttractions } from '@/lib/pricing/attractions'
import { priceMealLine, priceEntranceLine, mealTypeOfLine } from '@/lib/b2b/variation-service-rates'

// Rates audit, Guides & Services #5–#8 and #2: which guide, meal and fee row
// prices a day, in one pure rule shared by the engine and the B2B calculator.

describe('rateValidOn', () => {
  it('blank ends are open; a date outside the period is refused', () => {
    expect(rateValidOn({}, '2027-01-01')).toBe(true)
    expect(rateValidOn({ rate_valid_from: '2027-01-01' }, '2026-12-31')).toBe(false)
    expect(rateValidOn({ rate_valid_to: '2026-12-31' }, '2027-01-01')).toBe(false)
    expect(rateValidOn({ rate_valid_from: '2027-01-01', rate_valid_to: '2027-12-31' }, '2027-06-01T00:00:00Z')).toBe(true)
    expect(rateValidOn({ rate_valid_to: '2020-01-01' }, null)).toBe(true)
  })
})

describe('pickGuideRate (#5, #6)', () => {
  const g = (id: string, over: Record<string, unknown> = {}) => ({
    id, guide_language: 'japanese', guide_type: 'egyptologist', tour_duration: 'full_day', guide_mode: 'spot', is_active: true, ...over,
  })
  const ask = { language: 'Japanese', grade: 'egyptologist', duration: 'full_day' as const, mode: 'spot' }

  it("prefers the day's city, then a city-less rate, then another city — never database order", () => {
    const rows = [g('lxr', { city: 'Luxor' }), g('any'), g('cai', { city: 'Cairo' })]
    expect(pickGuideRate(rows, { ...ask, city: 'cairo' })?.id).toBe('cai')
    expect(pickGuideRate(rows, { ...ask, city: 'Aswan' })?.id).toBe('any')
    expect(pickGuideRate([g('lxr', { city: 'Luxor' })], { ...ask, city: 'Aswan' })?.id).toBe('lxr')
  })

  it('skips a rate outside its validity, and puts the chosen guide first', () => {
    const rows = [
      g('old', { rate_valid_from: '2026-01-01', rate_valid_to: '2026-12-31' }),
      g('new', { rate_valid_from: '2027-01-01', rate_valid_to: '2027-12-31' }),
      g('mine', { supplier_id: 'sup-1', rate_valid_from: '2027-01-01', rate_valid_to: '2027-12-31' }),
    ]
    expect(pickGuideRate(rows.slice(0, 2), { ...ask, date: '2027-02-01' })?.id).toBe('new')
    expect(pickGuideRate(rows, { ...ask, date: '2027-02-01', supplierId: 'sup-1' })?.id).toBe('mine')
    expect(pickGuideRate(rows.slice(0, 1), { ...ask, date: '2027-02-01' })).toBeNull()
  })

  it('a half-day ask needs a half-day row; the default full-day ask still takes any row of the language', () => {
    const rows = [g('full'), g('half', { tour_duration: 'half_day' })]
    expect(pickGuideRate(rows, { ...ask, duration: 'half_day' })?.id).toBe('half')
    expect(pickGuideRate([g('full')], { ...ask, duration: 'half_day' })).toBeNull()
    expect(pickGuideRate([g('ext', { tour_duration: 'extended' })], ask)?.id).toBe('ext')
  })

  it('a throughout ask never takes a spot rate', () => {
    expect(pickGuideRate([g('spot')], { ...ask, mode: 'throughout' })).toBeNull()
  })
})

describe('isHalfDayGuiding', () => {
  it('only when the trip says so', () => {
    expect(isHalfDayGuiding({}, 'half_day')).toBe(true)
    expect(isHalfDayGuiding({ transport: { duration: 'half_day' } })).toBe(true)
    expect(isHalfDayGuiding({ transport_lines: [{ service_type: 'half_day' }] })).toBe(true)
    expect(isHalfDayGuiding({ transport_lines: [{ service_type: 'half_day' }, { service_type: 'day_tour' }] })).toBe(false)
    expect(isHalfDayGuiding({}, 'multi_day')).toBe(false)
  })
})

describe('pickMealRate and the group cost (#7)', () => {
  const m = (id: string, over: Record<string, unknown> = {}) => ({
    id, meal_type: 'lunch', restaurant_name: id, base_rate_eur: 20, is_active: true, per_person_rate: true, ...over,
  })

  it('one restaurant, never an average: the starred one of the city first', () => {
    const rows = [m('a', { city: 'Cairo', base_rate_eur: 10 }), m('b', { city: 'Cairo', base_rate_eur: 30, is_preferred: true }), m('c', { city: 'Luxor', is_preferred: true })]
    expect(pickMealRate(rows, { mealType: 'lunch', city: 'Cairo' })?.rate).toBe(30)
    expect(pickMealRate(rows, { mealType: 'dinner', city: 'Cairo' })).toBeNull()
  })

  it('a picked rate id wins outright', () => {
    const rows = [m('a', { is_preferred: true }), m('b', { base_rate_eur: 44 })]
    expect(pickMealRate(rows, { mealType: 'lunch', rateId: 'b' })?.rate).toBe(44)
  })

  it('legacy one-row-per-tier columns still price, per person', () => {
    const picked = pickMealRate([{ id: 'x', lunch_rate_eur: 30, dinner_rate_eur: 40 }], { mealType: 'dinner' })
    expect(picked).toMatchObject({ rate: 40, perPerson: true, minimumPax: 1 })
  })

  it('per group once; per person × party, never below the minimum', () => {
    expect(mealCostForGroup({ rate: 300, perPerson: false, minimumPax: 1 }, 7)).toBe(300)
    expect(mealCostForGroup({ rate: 20, perPerson: true, minimumPax: 10 }, 4)).toBe(200)
    expect(mealCostForGroup({ rate: 20, perPerson: true, minimumPax: 10 }, 12)).toBe(240)
    expect(mealVoucherQuantity({ per_person_rate: false }, 6)).toBe(1)
    expect(mealVoucherQuantity({ per_person_rate: true, minimum_pax: 8 }, 3)).toBe(8)
    expect(mealVoucherQuantity({ minimum_pax: null }, 3)).toBe(3)
  })
})

describe('resolveAttractions: an add-on is never charged from wording (#8)', () => {
  const fees = [{ id: 'interior', attraction_name: 'Great Pyramid Interior', eur_rate: 50, non_eur_rate: 50, is_addon: true }]

  it('"Great Pyramid" in the day does not charge the add-on', () => {
    const r = resolveAttractions([{ day: 1, attractions: ['Great Pyramid'] }], fees, new Map(), true)
    expect(r.tickets).toEqual([])
    expect(r.unresolved).toEqual([{ day: 1, text: 'Great Pyramid' }])
  })

  it('nor through an alias', () => {
    const r = resolveAttractions([{ day: 1, attractions: ['ピラミッド内部'] }], fees, new Map([['ピラミッド内部', 'Great Pyramid Interior']]), true)
    expect(r.tickets).toEqual([])
  })

  it('a ticket picked by id still charges it', () => {
    const r = resolveAttractions([{ day: 1, attraction_ids: ['interior'] }], fees, new Map(), true)
    expect(r.tickets.map(t => t.id)).toEqual(['interior'])
  })
})

describe('B2B variation lines (#2)', () => {
  it('a meal line reads meal_rates as it is: base_rate_eur by meal_type, the tier, per group or per person', () => {
    const rows = [
      { id: 'l', tier: 'standard', meal_type: 'lunch', restaurant_name: 'Abou', base_rate_eur: 20, is_active: true },
      { id: 'd', tier: 'standard', meal_type: 'dinner', restaurant_name: 'Deck', base_rate_eur: 300, per_person_rate: false, is_active: true },
      { id: 'x', tier: 'luxury', meal_type: 'lunch', restaurant_name: 'Lux', base_rate_eur: 90, is_active: true },
    ]
    expect(mealTypeOfLine('Dinner cruise')).toBe('dinner')
    expect(priceMealLine(rows, { serviceName: 'Lunch', tier: 'standard', numPax: 4, rateSym: '$' })).toMatchObject({ unitCost: 20, lineTotal: 80, quantityMode: 'per_pax', rateSource: 'meal_rates' })
    expect(priceMealLine(rows, { serviceName: 'Dinner', tier: 'standard', numPax: 4, rateSym: '$' })).toMatchObject({ unitCost: 300, lineTotal: 300, quantityMode: 'fixed' })
    expect(priceMealLine(rows, { serviceName: 'Lunch', rateId: 'x', tier: 'standard', numPax: 2, rateSym: '$' })).toMatchObject({ unitCost: 90 })
  })

  it('no meal rate = null, so the line falls back to its stored cost', () => {
    expect(priceMealLine([], { serviceName: 'Lunch', tier: 'standard', numPax: 2, rateSym: '$' })).toBeNull()
  })

  it('an entrance line prices the fee valid on the date, the picked one first', () => {
    const fees = [
      { id: 'old', attraction_name: 'Karnak Temple', eur_rate: 10, non_eur_rate: 10, rate_valid_to: '2026-12-31' },
      { id: 'new', attraction_name: 'Karnak Temple', eur_rate: 12, non_eur_rate: 12, rate_valid_from: '2027-01-01' },
    ]
    expect(priceEntranceLine(fees, { serviceName: 'Karnak', date: '2027-05-01', numPax: 3, isEurPassport: true, rateSym: '$' }))
      .toMatchObject({ unitCost: 12, lineTotal: 36, rateSource: 'entrance_fees' })
    expect(priceEntranceLine(fees, { serviceName: 'Nowhere', date: '2027-05-01', numPax: 3, isEurPassport: true, rateSym: '$' })).toBeNull()
  })
})
