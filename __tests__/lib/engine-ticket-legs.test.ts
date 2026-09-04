import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

// Ticket legs — flights, day trains, sleeping trains (2026-09-04). A marked
// day rides a per-person ticket instead of a road vehicle. Operator rules:
// flights always economy; several rows on a route need the day to NAME the
// train (exactly one auto-resolves, more is a hole, never a guess); the
// sleeping-train ticket is the night's bed (solo pays the Single gap); the
// throughout guide rides at guide_rate ?? customer fare and sleeps in a
// Single. Cairo and Giza are one station city. No station transfers.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing, collectTicketLegs, resolveTicketRow } from '@/lib/auto-pricing-service'

const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'English', marginPercent: 0, numPax: 2 }

const day = (n: number, city: string, over: Record<string, unknown> = {}) => ({
  day: n, title: `Day ${n}`, city, overnight_city: city,
  accommodation_type: 'none',
  meals: { breakfast: 'none', lunch: 'none', dinner: 'none' },
  attractions: [],
  services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false },
  ...over,
})

/** Rows carry no rate_currency → they are already in the run currency. */
const tables = (over: Record<string, unknown> = {}) => {
  const t = fullRateTables() as any
  t.flight_rates = [
    { id: 'fl-1', route_from: 'Cairo', route_to: 'Luxor', cabin_class: 'economy', airline: 'EgyptAir', base_rate_eur: 100, base_rate_non_eur: 100, tax_eur: 20, tax_non_eur: 20, guide_rate: null, is_active: true },
  ]
  t.train_rates = [
    { id: 'tr-1', origin_city: 'Cairo', destination_city: 'Luxor', class_type: 'First Class', operator_name: 'Watania', rate_eur: 75, guide_rate: 30, is_active: true },
  ]
  t.sleeping_train_rates = [
    { id: 'sl-ht', origin_city: 'Giza', destination_city: 'Luxor', cabin_type: 'Half Twin', operator_name: 'Watania', supplier_id: 'sup-w', rate_oneway_eur: 120, guide_rate: null, is_active: true },
    { id: 'sl-sg', origin_city: 'Giza', destination_city: 'Luxor', cabin_type: 'Single', operator_name: 'Watania', supplier_id: 'sup-w', rate_oneway_eur: 170, guide_rate: 90, is_active: true },
  ]
  return { ...t, ...over }
}

const withDays = (days: unknown[], over: Record<string, unknown> = {}) => {
  const t = tables(over)
  t.tour_templates[0].itinerary = days
  return t
}

const line = (r: any, id: string) => (r.services ?? []).find((s: any) => s.id === id)
const legHoles = (r: any) => (r.holes ?? []).filter((h: any) => /flight_rates|train_rates|sleeping_train_rates/.test(h.lookupAttempted ?? ''))

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('collectTicketLegs', () => {
  it('flight/train legs run previous→this city; a sleeper boards tonight and wakes in the next city', () => {
    const legs = collectTicketLegs([
      { day: 1, city: 'Cairo' },
      { day: 2, city: 'Luxor', transport_type: 'flight' },
      { day: 3, city: 'Luxor', transport_type: 'sleeping_train', transport_rate_id: 'sl-ht' },
      { day: 4, city: 'Cairo' },
    ] as any)
    expect(legs).toEqual([
      { day: 2, mode: 'flight', from: 'Cairo', to: 'Luxor', rateId: undefined },
      { day: 3, mode: 'sleeping_train', from: 'Luxor', to: 'Cairo', rateId: 'sl-ht' },
    ])
  })

  it('an unmarked city change is NOT a ticket leg (road, as always)', () => {
    expect(collectTicketLegs([{ day: 1, city: 'Cairo' }, { day: 2, city: 'Luxor' }] as any)).toEqual([])
  })
})

describe('resolveTicketRow — named, else exactly one, never a guess', () => {
  const rows = [{ id: 'a' }, { id: 'b' }] as any[]
  it('names win', () => expect(resolveTicketRow(rows, 'b').row?.id).toBe('b'))
  it('a missing name is reported, not replaced', () => expect(resolveTicketRow(rows, 'ghost')).toMatchObject({ row: null, namedMissing: true }))
  it('exactly one auto-resolves', () => expect(resolveTicketRow([rows[0]], undefined).row?.id).toBe('a'))
  it('several without a name is ambiguous', () => expect(resolveTicketRow(rows, undefined).ambiguous).toHaveLength(2))
})

describe('flight legs', () => {
  it('prices fare + tax per person and suppresses the road intercity line', async () => {
    setMockTables(withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'flight' })]))
    const r = await calculateAutoPricing(BASE)
    expect(line(r, 'day2-ticket-flight')).toMatchObject({ unitCost: 120, isPerPax: true, serviceType: 'flight' })
    expect((r.services ?? []).find((s: any) => s.id === 'day2-transport' && /intercity/i.test(s.notes ?? ''))).toBeUndefined()
    expect(legHoles(r)).toEqual([])
  })

  it('a route with no economy row is a hole naming Rates → Flights', async () => {
    setMockTables(withDays([day(1, 'Cairo'), day(2, 'Aswan', { transport_type: 'flight' })]))
    const r = await calculateAutoPricing(BASE)
    expect(line(r, 'day2-ticket-flight')).toBeUndefined()
    expect(legHoles(r).some((h: any) => /No economy flight rate for Cairo → Aswan/.test(h.message))).toBe(true)
  })
})

describe('day-train legs', () => {
  it('exactly one row auto-resolves; the guide rides at his guide_rate in throughout mode', async () => {
    setMockTables(withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'train' })]))
    const r = await calculateAutoPricing({ ...BASE, guideMode: 'throughout' })
    expect(line(r, 'day2-ticket-train')).toMatchObject({ unitCost: 75, isPerPax: true })
    expect(line(r, 'day2-guide-ticket')).toMatchObject({ unitCost: 30, isPerPax: false })
  })

  it('two trains on one route without a pick is a hole that lists them; naming one resolves it', async () => {
    const second = { id: 'tr-2', origin_city: 'Cairo', destination_city: 'Luxor', class_type: 'First Class', operator_name: 'OldLine', rate_eur: 90, is_active: true }
    let t = withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'train' })])
    t.train_rates.push(second)
    setMockTables(t)
    const ambiguous = await calculateAutoPricing(BASE)
    expect(line(ambiguous, 'day2-ticket-train')).toBeUndefined()
    expect(legHoles(ambiguous).some((h: any) => /2 trains serve/.test(h.message) && /Watania/.test(h.message) && /OldLine/.test(h.message))).toBe(true)

    t = withDays([day(1, 'Cairo'), day(2, 'Luxor', { transport_type: 'train', transport_rate_id: 'tr-2' })])
    t.train_rates.push(second)
    setMockTables(t)
    const named = await calculateAutoPricing(BASE)
    expect(line(named, 'day2-ticket-train')).toMatchObject({ unitCost: 90 })
  })
})

describe('sleeping-train legs', () => {
  const sleeperDays = [
    day(1, 'Cairo', { transport_type: 'sleeping_train', overnight_kind: 'train' }),
    day(2, 'Luxor'),
  ]

  it('the ticket is the bed: Half Twin per person, solo pays the Single gap, Cairo boards at Giza', async () => {
    setMockTables(withDays(sleeperDays))
    const r = await calculateAutoPricing(BASE)
    expect(line(r, 'day1-ticket-sleeper')).toMatchObject({ unitCost: 120, isPerPax: true })
    expect(line(r, 'day1-hotel')).toBeUndefined()
    // The night joined accommodationNights with singleSupp 50 (170 − 120).
    expect((r.accommodationNights ?? []).some((n: any) => n.ppd === 120 && n.singleSupp === 50)).toBe(true)
    expect(legHoles(r)).toEqual([])
  })

  it('the throughout guide sleeps in a Single at its guide_rate', async () => {
    setMockTables(withDays(sleeperDays))
    const r = await calculateAutoPricing({ ...BASE, guideMode: 'throughout' })
    expect(line(r, 'day1-guide-ticket')).toMatchObject({ unitCost: 90, serviceName: expect.stringContaining('Single') })
  })

  it('a route with no rows is a hole naming Rates → Sleeping Trains', async () => {
    const t = withDays(sleeperDays)
    t.sleeping_train_rates = []
    setMockTables(t)
    const r = await calculateAutoPricing(BASE)
    expect(legHoles(r).some((h: any) => /Sleeping Trains/.test(h.message))).toBe(true)
  })
})
