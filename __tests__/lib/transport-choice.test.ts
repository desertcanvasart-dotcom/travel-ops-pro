import { vi, describe, it, expect } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

// Several transport rates answering one question (owner 2026-11-18, "cheapest
// plus warning", as autoura-saas #827 — lib/pricing/transport-choice.ts).
//
//   OLD: the first in a fixed order — starred, then the NEWEST contract —
//        silently, whatever the price, whichever company.
//   NEW: exactly one starred → it. Else one company's rates → the cheapest
//        for the group, with a warning naming the others. Else (several
//        companies, none or several starred) → a gap: which company to book
//        is the office's choice, never the price's.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing, transportCacheFromRows, findTransportRateExplained, orderTransportRows } from '@/lib/auto-pricing-service'
import { chooseTransportRate } from '@/lib/pricing/transport-choice'

const v = (rate: number) => [{ key: 'sedan', rate_eur: rate, rate_non_eur: null, capacity_min: 1, capacity_max: 2 }]
const row = (id: string, rate: number, over: Record<string, unknown> = {}) => ({
  id, service_code: `LXR-DAY-${id}`, service_type: 'day_tour', city: 'Luxor', duration: 'full_day', area: null,
  vehicles: v(rate), is_active: true, rate_valid_from: '2026-01-01', rate_valid_to: '2099-12-31',
  supplier_id: 'sup-nile', supplier_name: 'Nile Cars', ...over,
}) as any
const lookup = (rows: any[], pax = 2) => findTransportRateExplained(transportCacheFromRows(rows, '2026-12-01'), {
  serviceType: 'day_tour', city: 'Luxor', duration: 'full_day', area: null as any, pax,
})

// One company, two different rates (named routes) for the same question.
const westBank = row('west', 60, { route_name: 'West Bank day', rate_valid_from: '2026-06-01' }) // newer, dearer
const eastBank = row('east', 45, { route_name: 'East Bank day', rate_valid_from: '2026-01-01' }) // older, cheaper

describe('one company, several rates, none starred', () => {
  it('OLD picked the newest contract; NEW prices the cheapest and names the others', () => {
    // The old pick is still the engine's order (kept for everything else):
    expect(orderTransportRows([eastBank, westBank], '2026-12-01')[0].id).toBe('west')
    const r = lookup([eastBank, westBank])
    expect(r.rate?.id).toBe('east')
    expect(r.rate?.base_rate_eur).toBe(45)
    expect(r.cheapestOf).toEqual({ chosen: 'East Bank day', others: ['West Bank day'], amongStarred: false })
  })

  it('cheapest for THIS group size: a bigger group may cost less on the other rate', () => {
    const a = row('a', 40, { route_name: 'A', vehicles: [{ key: 'sedan', rate_eur: 40, capacity_min: 1, capacity_max: 2 }, { key: 'van', rate_eur: 120, capacity_min: 3, capacity_max: 7 }] })
    const b = row('b', 50, { route_name: 'B', vehicles: [{ key: 'sedan', rate_eur: 50, capacity_min: 1, capacity_max: 2 }, { key: 'van', rate_eur: 90, capacity_min: 3, capacity_max: 7 }] })
    expect(lookup([a, b], 2).rate?.id).toBe('a')
    expect(lookup([a, b], 6).rate?.id).toBe('b')
  })

  it('a rate with no price for the group goes last', () => {
    const noVan = row('a', 40, { route_name: 'A' }) // sedan only: no price for 6
    const van = row('b', 50, { route_name: 'B', vehicles: [{ key: 'van', rate_eur: 90, capacity_min: 1, capacity_max: 7 }] })
    expect(lookup([noVan, van], 6).rate?.id).toBe('b')
  })
})

describe('unchanged', () => {
  it('one rate', () => {
    expect(lookup([westBank]).rate?.id).toBe('west')
    expect(lookup([westBank]).cheapestOf).toBeUndefined()
  })
  it('exactly one starred: the starred one, no warning, even if dearer and another company', () => {
    const starred = row('star', 80, { route_name: 'Usual', is_preferred: true, supplier_id: 'sup-other', supplier_name: 'Other Cars' })
    const r = lookup([eastBank, westBank, starred])
    expect(r.rate?.id).toBe('star')
    expect(r.cheapestOf).toBeUndefined()
    expect(r.companies).toBeUndefined()
  })
  it('one rate in two contract periods is ONE rate: next year’s contract takes over, never the cheaper old one', () => {
    const old = row('old', 30, { route_name: 'Day tour', rate_valid_from: '2026-01-01' })
    const next = row('next', 40, { route_name: 'Day tour', rate_valid_from: '2026-11-01' })
    const r = lookup([old, next])
    expect(r.rate?.id).toBe('next')
    expect(r.cheapestOf).toBeUndefined()
  })
})

describe('several companies', () => {
  const other = row('other', 35, { route_name: 'Day tour', supplier_id: 'sup-other', supplier_name: 'Other Cars' })

  it('OLD priced the first in order; NEW is a gap naming the companies', () => {
    const r = lookup([westBank, other])
    expect(r.rate).toBeNull()
    expect(r.companies?.sort()).toEqual(['Nile Cars', 'Other Cars'])
    expect(r.companiesStarred).toBe(false)
  })

  it('several starred across companies is a gap too', () => {
    const r = lookup([{ ...westBank, is_preferred: true }, { ...other, is_preferred: true }])
    expect(r.rate).toBeNull()
    expect(r.companiesStarred).toBe(true)
  })

  it('several starred of ONE company: the cheapest starred, with a warning', () => {
    const r = lookup([{ ...westBank, is_preferred: true }, { ...eastBank, is_preferred: true }, other])
    expect(r.rate?.id).toBe('east')
    expect(r.cheapestOf?.amongStarred).toBe(true)
  })
})

describe('the rule alone', () => {
  it('no supplier at all counts as one company (direct booking)', () => {
    const a = { id: 'a', route_name: 'A', vehicles: v(50) }
    const b = { id: 'b', route_name: 'B', vehicles: v(40) }
    expect(chooseTransportRate([a, b], 2).rate?.id).toBe('b')
  })
})

// ---------------------------------------------------------------------------
// Through the engine: what the quote shows.
// ---------------------------------------------------------------------------
const BASE = { orgId: 'org-1', templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'English', marginPercent: 0, numPax: 2 }
const tripDay = (n: number, over: Record<string, unknown> = {}) => ({
  day: n, title: `Day ${n}`, city: 'Luxor', overnight_city: 'Luxor', accommodation_type: 'none',
  meals: { breakfast: 'none', lunch: 'none', dinner: 'none' }, attractions: [],
  services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false },
  ...over,
})
function tripWithRates(rates: any[]) {
  const t = fullRateTables() as any
  t.tour_templates[0].itinerary = [tripDay(1, { transport_lines: [{ service_type: 'day_tour' }] })]
  t.transportation_rates = rates.map(r => ({ ...r, org_id: 'org-1' }))
  return t
}

describe('the quote', () => {
  it('one company: the cheapest is priced and the quote warns, naming the rates', async () => {
    setMockTables(tripWithRates([eastBank, westBank]))
    const r: any = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-01' })
    const transport = (r.services ?? []).find((s: any) => s.dayNumber === 1 && s.rateSource === 'transportation_rates')
    expect(transport?.unitCost).toBe(45)
    expect(r.warnings).toContain('Day 1: 2 rates answer full-day vehicle in Luxor (East Bank day, West Bank day). Priced the cheapest, "East Bank day". Star the usual one in Rates → Transportation.')
  })

  it('several companies: no price, a gap that names them', async () => {
    setMockTables(tripWithRates([westBank, row('other', 35, { route_name: 'Day tour', supplier_id: 'sup-other', supplier_name: 'Other Cars' })]))
    const r: any = await calculateAutoPricing({ ...BASE, travelDate: '2026-12-01' })
    const hole = (r.holes ?? []).find((h: any) => h.kind === 'transport' && h.dayNumber === 1)
    expect(hole?.message).toMatch(/^2 companies have a rate for the full-day vehicle in Luxor \((Nile Cars, Other Cars|Other Cars, Nile Cars)\) and none is starred\. Star the one to book/)
    const transport = (r.services ?? []).find((s: any) => s.dayNumber === 1 && s.serviceType === 'transportation')
    expect(transport).toMatchObject({ unpriced: true, lineTotal: 0 })
  })
})
