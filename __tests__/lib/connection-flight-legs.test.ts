import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'
import { knownAirportCode, legAssistance, sanitizeLegAssist } from '@/lib/pricing/flight-leg'

// NMS803 day 2 (operator, 2026-09-17): land in Cairo on the overnight flight
// from Narita, connect to Luxor, board the ship. A ticket leg now names its
// own route, and a flight says whether each airport gets assistance.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing, collectTicketLegs } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'Japanese', marginPercent: 0, numPax: 2 }
const inTheAir = { day: 1, title: 'Overnight flight', city: '', accommodation_type: 'none', in_transit: true, overnight_kind: 'flight', attractions: [], meals: {}, services: {} }

function tables(days: unknown[]) {
  const t = fullRateTables() as any
  t.tour_templates[0].itinerary = days
  t.tour_templates[0].duration_days = days.length
  t.airport_staff_rates.push({ id: 'air-lxr', airport_code: 'LXR', direction: 'both', rate_eur: 30, is_active: true })
  t.flight_rates = [{ id: 'fl-cai-lxr', route_from: 'Cairo', route_to: 'Luxor', airline: 'EgyptAir', cabin_class: 'economy', base_rate_eur: 120, base_rate_non_eur: 120, tax_eur: 0, is_active: true }]
  t.transportation_rates.push({ ...t.transportation_rates[0], id: 'trn-lxr-airport', service_code: 'LXR-AIRPORT', city: 'Luxor', origin_city: 'Luxor', destination_city: 'Luxor', route_name: 'Luxor Airport Transfer' })
  return t
}
const onDay = (r: any, n: number) => (r.services ?? []).filter((s: any) => s.dayNumber === n)

describe('the route a leg names', () => {
  it('a day\'s own From/To wins over yesterday → today', () => {
    const legs = collectTicketLegs([
      { day: 1, city: '' },
      { day: 2, city: 'Nile Cruise', transport_type: 'flight', leg_from: 'Cairo', leg_to: 'Luxor' },
      { day: 3, city: 'Aswan', transport_type: 'flight' },
    ])
    expect(legs.map(l => [l.day, l.from, l.to])).toEqual([[2, 'Cairo', 'Luxor'], [3, 'Nile Cruise', 'Aswan']])
  })

  it('assistance defaults on for an arrival-day connection, off otherwise; explicit wins', () => {
    expect(legAssistance(undefined, true)).toEqual({ from: true, to: true })
    expect(legAssistance(undefined, false)).toEqual({ from: false, to: false })
    expect(legAssistance({ to: false }, true)).toEqual({ from: true, to: false })
    expect(sanitizeLegAssist({ from: 'yes', to: true })).toEqual({ to: true })
    expect(knownAirportCode('Luxor')).toBe('LXR')
    expect(knownAirportCode('Nile Cruise')).toBeNull()
  })
})

describe('NMS803 day 2: land in Cairo, fly to Luxor, board the ship', () => {
  const day2 = {
    day: 2, title: 'Nile Cruise', city: 'Nile Cruise', overnight_city: 'Nile Cruise', accommodation_type: 'cruise', is_cruise_day: true,
    transport_type: 'flight', leg_from: 'Cairo', leg_to: 'Luxor', attractions: ['Karnak Temple'], meals: {}, services: { guide_required: true },
  }
  const last = { day: 3, title: 'Departure', city: 'Luxor', accommodation_type: 'none', attractions: [], meals: {}, services: {} }

  it('prices the ticket, meet & greet at Cairo, assistance at Luxor and a plain airport transfer in Luxor', async () => {
    setMockTables(tables([inTheAir, day2, last]))
    const lines = onDay(await calculateAutoPricing(BASE), 2)
    const byId = Object.fromEntries(lines.map((s: any) => [s.id, s]))
    expect(byId['day2-ticket-flight']).toMatchObject({ serviceName: 'Domestic Flight Cairo → Luxor (EgyptAir)', unitCost: 120 })
    expect(byId['day2-airport-arrival']).toMatchObject({ serviceName: 'Airport Meet & Greet (CAI)', unitCost: 25 })
    expect(byId['day2-airport-leg-to']).toMatchObject({ serviceName: 'Airport Arrival Assistance (LXR) — Cairo → Luxor', unitCost: 30 })
    // One transfer, at the FINAL airport, plain — the cruise package carries the sightseeing.
    const transport = lines.filter((s: any) => /^day2-transport/.test(s.id))
    expect(transport.map((s: any) => s.serviceName)).toEqual(['Luxor Airport Transfer'])
    // Nothing on the day in the air.
    expect(onDay(await calculateAutoPricing(BASE), 1)).toEqual([])
  })

  it('turning Luxor assistance off removes that line only', async () => {
    setMockTables(tables([inTheAir, { ...day2, leg_assist: { to: false } }, last]))
    const ids = onDay(await calculateAutoPricing(BASE), 2).map((s: any) => s.id)
    expect(ids).toContain('day2-airport-arrival')
    expect(ids).not.toContain('day2-airport-leg-to')
  })
})

describe('the arrival transfer after an overnight flight (was missing)', () => {
  it('day 2 in Cairo gets its airport transfer, not only the Meet & Greet', async () => {
    const t = fullRateTables() as any
    const days = t.tour_templates[0].itinerary
    t.tour_templates[0].itinerary = [inTheAir, ...days.map((d: any, i: number) => ({ ...d, day: i + 2 }))]
    setMockTables(t)
    const names = onDay(await calculateAutoPricing(BASE), 2).map((s: any) => s.serviceName)
    expect(names).toContain('Airport Meet & Greet (CAI)')
    expect(names).toContain('Cairo Airport Transfer')
  })
})

describe('a mid-trip flight keeps today\'s price unless assistance is asked for', () => {
  const trip = (assist?: { from?: boolean; to?: boolean }) => [
    { day: 1, title: 'Cairo', city: 'Cairo', accommodation_type: 'hotel', attractions: [], meals: {}, services: {} },
    { day: 2, title: 'Luxor', city: 'Luxor', accommodation_type: 'hotel', transport_type: 'flight', attractions: [], meals: {}, services: {}, ...(assist ? { leg_assist: assist } : {}) },
    { day: 3, title: 'Departure', city: 'Luxor', accommodation_type: 'none', attractions: [], meals: {}, services: {} },
  ]

  it('no assistance lines by default', async () => {
    setMockTables(tables(trip()))
    const ids = onDay(await calculateAutoPricing(BASE), 2).map((s: any) => s.id)
    expect(ids.some((id: string) => id.includes('airport-leg'))).toBe(false)
  })

  it('ticking both ends prices departure assistance at Cairo and arrival assistance at Luxor', async () => {
    setMockTables(tables(trip({ from: true, to: true })))
    const names = onDay(await calculateAutoPricing(BASE), 2).map((s: any) => s.serviceName)
    expect(names).toContain('Airport Departure Assistance (CAI) — Cairo → Luxor')
    expect(names).toContain('Airport Arrival Assistance (LXR) — Cairo → Luxor')
  })
})
