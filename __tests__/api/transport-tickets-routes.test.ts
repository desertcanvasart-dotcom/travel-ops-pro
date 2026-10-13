// Rates › Transport & Tickets — the write and delete routes the four screens
// use (audit 2026-10, suppliers-audit-transport):
//   #2  a supplier_id on any write must be the company's own; a list never
//       shows another company's supplier
//   T1  the Transportation form's create refuses a duplicate (409)
//   T2  "No supplier / Direct booking" saves as no supplier
//   T5  the tiles' counts come from the server, over every rate
//   F2  the flight edit route sanitizes periods and refreshes the base columns
//   F4  the flight key includes flight number and supplier
//   R3  the train edit route validates
//   A2  the airport key includes direction
//   #3  a rate something uses is not deleted
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})
vi.mock('@/lib/supabase-server', async () => {
  const mock = await import('../_mock-supabase')
  return { createServerClient: () => mock.createMockClient(), supabaseServer: mock.createMockClient() }
})
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => 'org-1',
    getCurrentUserId: async () => 'u1',
    getCurrentUserRole: async () => 'admin',
    requireRole: async () => null,
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/vocabulary-server', () => ({
  vocabularyItemsForCurrentOrg: vi.fn(async (kind: string) =>
    kind === 'vehicle_type' ? ['sedan', 'minivan', 'van', 'minibus', 'bus'].map(key => ({ key, label: key, meta: {} })) : []),
  vehicleBandsForOrg: vi.fn(async () => []),
  supplierTypesForCurrentOrg: vi.fn(async () => []),
}))
vi.mock('@/lib/i18n/server-messages', () => ({
  getServerLocale: vi.fn(async () => 'en'),
  lookupServerMessage: vi.fn((_l: string, key: string) => key),
  tServer: vi.fn(async (key: string) => key),
}))
// The company prices in USD. EUR 1 = USD 1.08 = EGP 54. No network.
vi.mock('@/lib/rates/fx-source', () => ({
  fetchRunExchangeRates: async () => ({ base: 'EUR', date: '2026-10-01', rates: { EUR: 1, USD: 1.08, EGP: 54 } }),
}))

import { GET as getResources, POST as postResource } from '@/app/api/resources/transportation/route'
import { PUT as putResource, DELETE as deleteResource } from '@/app/api/resources/transportation/[id]/route'
import { PUT as putTransportRates } from '@/app/api/rates/transportation/route'
import { POST as postFlight, PUT as putFlights } from '@/app/api/rates/flights/route'
import { PUT as putFlight, DELETE as deleteFlight } from '@/app/api/rates/flights/[id]/route'
import { POST as postTrain } from '@/app/api/rates/trains/route'
import { PUT as putTrain } from '@/app/api/rates/trains/[id]/route'
import { POST as postAirport } from '@/app/api/rates/airport-services/route'
import { PUT as putAirport, DELETE as deleteAirport } from '@/app/api/rates/airport-services/[id]/route'
import { ownSupplierOnRows } from '@/lib/rates/own-supplier-embed'
import { describeRateBlockers } from '@/lib/rates/rate-delete-blockers'
import { makeDayTourVehicleFinder } from '@/lib/rates/day-tour-vehicle'

const req = (body: unknown, url = 'http://x/api') => {
  const u = new URL(url)
  return { json: async () => body, nextUrl: u, url } as never
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const call = async (p: Promise<Response>) => {
  const res = await p
  return { status: res.status, json: await res.json() }
}
const insert = async (table: string, row: Record<string, unknown>) => {
  await (createMockClient().from(table) as never as { insert: (r: unknown) => Promise<unknown> }).insert(row)
}
const rows = async (table: string) =>
  ((await (createMockClient().from(table) as never as { select: (c: string) => Promise<{ data: Record<string, unknown>[] | null }> }).select('*')).data ?? [])

const OWN = 'sup-own'
const FOREIGN = 'sup-foreign'
const vehicles = [{ key: 'sedan', rate_eur: 30, rate_non_eur: null, capacity_min: 1, capacity_max: 2 }]
const transportBody = (over: Record<string, unknown> = {}) => ({
  service_type: 'airport_transfer', city: 'Cairo', supplier_id: OWN, supplier_name: 'Own Cars', vehicles, ...over,
})

beforeEach(() => {
  setMockTables({
    suppliers: [
      { id: OWN, name: 'Own Cars', org_id: 'org-1' },
      { id: FOREIGN, name: 'Other Company Cars', org_id: 'org-2' },
    ],
    transportation_rates: [],
    flight_rates: [],
    train_rates: [],
    airport_staff_rates: [],
    itinerary_services: [],
    tour_templates: [],
    tour_variation_services: [],
    b2b_pricing_rules: [],
    org_vocabularies: [],
  })
})

// ============================================
// /api/resources/transportation — the screen's own routes
// ============================================
describe('Transportation Rates form (/api/resources/transportation)', () => {
  it('T2: "No supplier / Direct booking" saves, as no supplier', async () => {
    const { status, json } = await call(postResource(req(transportBody({ supplier_id: '__none__', supplier_name: '' }))))
    expect(status).toBe(201)
    expect(json.supplier_id).toBeNull()
  })

  it('#2: another company’s supplier is refused on create and on edit; nothing is written', async () => {
    const bad = await call(postResource(req(transportBody({ supplier_id: FOREIGN }))))
    expect(bad.status).toBe(400)
    expect(await rows('transportation_rates')).toHaveLength(0)

    const ok = await call(postResource(req(transportBody())))
    expect(ok.status).toBe(201)
    const edit = await call(putResource(req(transportBody({ supplier_id: FOREIGN, service_code: ok.json.service_code })), ctx(ok.json.id)))
    expect(edit.status).toBe(400)
    expect((await rows('transportation_rates'))[0].supplier_id).toBe(OWN)
  })

  it('#2: the partial-update route (Align bands) refuses another company’s supplier too', async () => {
    const ok = await call(postResource(req(transportBody())))
    const { status } = await call(putTransportRates(req({ id: ok.json.id, supplier_id: FOREIGN })))
    expect(status).toBe(400)
    expect((await rows('transportation_rates'))[0].supplier_id).toBe(OWN)
  })

  it('T1: a second save of the same service — even under a typed code — is a 409 naming the first', async () => {
    const first = await call(postResource(req(transportBody())))
    expect(first.status).toBe(201)
    const again = await call(postResource(req(transportBody({ service_code: 'CAIRO-APT-2', vehicles: [{ ...vehicles[0], rate_eur: 40 }] }))))
    expect(again.status).toBe(409)
    expect(again.json.existing.id).toBe(first.json.id)
    // A clashing code is a clear 409 too, not the database's unique error.
    const clash = await call(postResource(req(transportBody({ supplier_id: '__none__', service_code: first.json.service_code }))))
    expect(clash.status).toBe(409)
    expect(clash.json.error).toMatch(/already used/)
    expect(await rows('transportation_rates')).toHaveLength(1)
  })

  it('T1: another supplier, another route name, or another validity window is a different rate', async () => {
    await call(postResource(req(transportBody())))
    expect((await call(postResource(req(transportBody({ supplier_id: '__none__', service_code: 'C2' }))))).status).toBe(201)
    expect((await call(postResource(req(transportBody({ route_name: 'Cairo Airport → Giza', service_code: 'C3' }))))).status).toBe(201)
    expect((await call(postResource(req(transportBody({ rate_valid_from: '2027-01-01', rate_valid_to: '2027-12-31', service_code: 'C4' }))))).status).toBe(201)
    // The route name the form sends is stored (it was dropped).
    expect((await rows('transportation_rates')).some(r => r.route_name === 'Cairo Airport → Giza')).toBe(true)
  })

  it('T5: the summary counts every rate of the company, whatever the list shows', async () => {
    setMockTables({
      suppliers: [],
      transportation_rates: [
        { id: 'a', city: 'Cairo', is_active: true, supplier_id: OWN, org_id: 'org-1' },
        { id: 'b', city: 'cairo', is_active: false, supplier_id: null, org_id: 'org-1' },
        { id: 'c', city: 'Luxor', is_active: true, supplier_id: OWN, org_id: 'org-1' },
        { id: 'z', city: 'Aswan', is_active: true, supplier_id: null, org_id: 'org-2' },
      ],
    })
    const { json } = await call(getResources(req(null, 'http://x/api/resources/transportation?summary=1')))
    expect(json).toEqual({ total: 3, active: 2, inactive: 1, cities: 2, linked: 2 })
  })

  it('#3: a rate a priced trip line uses is not deleted; an unused one is', async () => {
    const used = await call(postResource(req(transportBody())))
    const free = await call(postResource(req(transportBody({ supplier_id: '__none__', service_code: 'FREE' }))))
    await insert('itinerary_services', { id: 'line-1', notes: `__grid:slot:d1|rate_id:${used.json.id}__sedan` })
    const blocked = await call(deleteResource(req(null), ctx(used.json.id)))
    expect(blocked.status).toBe(409)
    expect(blocked.json.error).toMatch(/1 priced trip lines/)
    expect((await call(deleteResource(req(null), ctx(free.json.id)))).status).toBe(200)
    expect((await rows('transportation_rates')).map(r => r.id)).toEqual([used.json.id])
  })
})

describe('#2: a list shows a supplier only when it is the company’s own', () => {
  it('drops another company’s embed and strips the org from the kept one', () => {
    const out = ownSupplierOnRows([
      { id: 'r1', supplier: { id: OWN, name: 'Own Cars', contact_email: 'a@own', org_id: 'org-1' } },
      { id: 'r2', supplier: { id: FOREIGN, name: 'Other', contact_email: 'b@other', org_id: 'org-2' } },
      { id: 'r3', supplier: null },
    ], 'org-1')
    expect(out[0].supplier).toEqual({ id: OWN, name: 'Own Cars', contact_email: 'a@own' })
    expect(out[1].supplier).toBeNull()
    expect(out[2].supplier).toBeNull()
  })

  it('the refusal names what uses the rate', () => {
    expect(describeRateBlockers([{ label: 'tour programmes', count: 2 }, { label: 'B2B pricing rules', count: 0 }]))
      .toBe('This rate is used by 2 tour programmes — deactivate it instead of deleting it.')
    expect(describeRateBlockers([{ label: 'x', count: 0 }])).toBeNull()
  })
})

// ============================================
// Flights
// ============================================
describe('Flight Rates (/api/rates/flights)', () => {
  const period = (from: string, to: string, fare: number | '', extra: Record<string, unknown> = {}) =>
    ({ name: '', from, to, rates: { base_rate_eur: fare, tax_eur: 20, ...extra } })
  const flightBody = (over: Record<string, unknown> = {}) => ({
    route_from: 'cai', route_to: 'lxr', airline: 'EgyptAir', cabin_class: 'economy', flight_number: 'MS0101',
    supplier_id: OWN, seasons: [period('2026-01-01', '2026-12-31', 100)], ...over,
  })

  it('F2: the edit route refreshes the base columns from the first period, and keeps a blank guide fare blank', async () => {
    const created = await call(postFlight(req(flightBody())))
    expect(created.status).toBe(201)
    expect(created.json.data).toMatchObject({ base_rate_eur: 100, guide_rate: null })
    const id = created.json.data.id
    // The form posts the base columns as loaded (100) beside the edited period (150).
    const edit = await call(putFlight(req({ ...flightBody(), base_rate_eur: 100, seasons: [period('2026-01-01', '2026-12-31', 150, { guide_rate: '' })] }), ctx(id)))
    expect(edit.status).toBe(200)
    const [row] = await rows('flight_rates')
    expect(row).toMatchObject({ base_rate_eur: 150, tax_eur: 20, rate_valid_from: '2026-01-01', guide_rate: null })
    expect((row.seasons as Array<{ rates: Record<string, unknown> }>)[0].rates.guide_rate).toBeNull()
  })

  it('F2: the edit route refuses a negative fare, too many periods, and another company’s supplier', async () => {
    const { json } = await call(postFlight(req(flightBody())))
    const id = json.data.id
    expect((await call(putFlight(req({ tax_eur: -5 }), ctx(id)))).status).toBe(400)
    const seven = Array.from({ length: 7 }, (_, i) => period(`2026-0${i + 1}-01`, `2026-0${i + 1}-20`, 100))
    expect((await call(putFlight(req({ seasons: seven }), ctx(id)))).status).toBe(400)
    expect((await call(putFlight(req({ supplier_id: FOREIGN }), ctx(id)))).status).toBe(400)
    expect((await call(putFlights(req({ id, supplier_id: FOREIGN })))).status).toBe(400)
    expect((await rows('flight_rates'))[0].supplier_id).toBe(OWN)
  })

  it('#2: a create with another company’s supplier is refused', async () => {
    expect((await call(postFlight(req(flightBody({ supplier_id: FOREIGN }))))).status).toBe(400)
    expect(await rows('flight_rates')).toHaveLength(0)
  })

  it('F4: a second flight number on the route is its own fare; the same flight and supplier is a 409', async () => {
    expect((await call(postFlight(req(flightBody())))).status).toBe(201)
    expect((await call(postFlight(req(flightBody({ flight_number: 'MS0103' }))))).status).toBe(201)
    expect((await call(postFlight(req(flightBody({ supplier_id: '__none__' }))))).status).toBe(201)
    const dup = await call(postFlight(req(flightBody())))
    expect(dup.status).toBe(409)
    expect(await rows('flight_rates')).toHaveLength(3)
  })

  it('#3: a fare a programme day picked is not deleted', async () => {
    const { json } = await call(postFlight(req(flightBody())))
    await insert('tour_templates', { id: 'tpl', org_id: 'org-1', itinerary: [{ day: 2, transport_type: 'flight', transport_rate_id: json.data.id }] })
    const res = await call(deleteFlight(req(null), ctx(json.data.id)))
    expect(res.status).toBe(409)
    expect(res.json.error).toMatch(/1 tour programmes/)
  })
})

// ============================================
// Trains
// ============================================
describe('Train Rates (/api/rates/trains)', () => {
  const trainBody = (over: Record<string, unknown> = {}) => ({
    origin_city: 'Cairo', destination_city: 'Luxor', class_type: 'first_class', rate_eur: 75, supplier_id: OWN, ...over,
  })

  it('R3: the edit route refuses a negative fare or guide fare, and another company’s supplier', async () => {
    const { json } = await call(postTrain(req(trainBody())))
    const id = json.data.id
    expect((await call(putTrain(req({ rate_eur: -1 }), ctx(id)))).status).toBe(400)
    expect((await call(putTrain(req({ guide_rate: -1 }), ctx(id)))).status).toBe(400)
    expect((await call(putTrain(req({ supplier_id: FOREIGN }), ctx(id)))).status).toBe(400)
    expect((await rows('train_rates'))[0]).toMatchObject({ rate_eur: 75, supplier_id: OWN })
  })

  it('R1: a cleared fare is stored blank (not priced), never 0; a cleared guide fare is blank', async () => {
    const { json } = await call(postTrain(req(trainBody({ rate_eur: '', guide_rate: '' }))))
    expect(json.data.rate_eur).toBeNull()
    expect(json.data.guide_rate ?? null).toBeNull()
    await call(putTrain(req({ rate_eur: '', guide_rate: '' }), ctx(json.data.id)))
    expect((await rows('train_rates'))[0]).toMatchObject({ rate_eur: null, guide_rate: null })
  })

  it('#2: a create with another company’s supplier is refused', async () => {
    expect((await call(postTrain(req(trainBody({ supplier_id: FOREIGN }))))).status).toBe(400)
    expect(await rows('train_rates')).toHaveLength(0)
  })
})

// ============================================
// Airport assistants
// ============================================
describe('Airport Assistants (/api/rates/airport-services)', () => {
  const airportBody = (over: Record<string, unknown> = {}) => ({
    airport_code: 'CAI', service_type: 'meet_greet', direction: 'arrival', rate_eur: 25, supplier_id: OWN, service_code: 'AIR-CAI-MG-ARR', ...over,
  })

  it('A2: a departure after an arrival for the same service and supplier is its own rate', async () => {
    expect((await call(postAirport(req(airportBody())))).status).toBe(200)
    expect((await call(postAirport(req(airportBody({ direction: 'departure', service_code: 'AIR-CAI-MG-DEP' }))))).status).toBe(200)
    expect((await call(postAirport(req(airportBody({ service_code: 'AIR-CAI-MG-ARR-2' }))))).status).toBe(409)
    expect(await rows('airport_staff_rates')).toHaveLength(2)
  })

  it('#2: another company’s supplier is refused on create and on edit', async () => {
    expect((await call(postAirport(req(airportBody({ supplier_id: FOREIGN }))))).status).toBe(400)
    const { json } = await call(postAirport(req(airportBody())))
    expect((await call(putAirport(req({ supplier_id: FOREIGN }), ctx(json.data.id)))).status).toBe(400)
    expect((await rows('airport_staff_rates'))[0].supplier_id).toBe(OWN)
  })

  it('#3: a rate a variation service uses is not deleted', async () => {
    const { json } = await call(postAirport(req(airportBody())))
    await insert('tour_variation_services', { id: 'vs', rate_id: json.data.id })
    expect((await call(deleteAirport(req(null), ctx(json.data.id)))).status).toBe(409)
    expect(await rows('airport_staff_rates')).toHaveLength(1)
  })
})

// ============================================
// T6 — the B2B day-tour vehicle finder converts currency
// ============================================
describe('T6: the day-tour vehicle finder prices in the quote’s currency', () => {
  it('an EGP 2,700 sedan is USD 54, not 2,700 dollars', async () => {
    setMockTables({
      transportation_rates: [{
        id: 'dt', org_id: 'org-1', service_code: 'LXR-TOUR', service_type: 'day_tour', city: 'Luxor', duration: 'full_day',
        rate_currency: 'EGP', is_active: true, vehicles: [{ key: 'sedan', rate_eur: 2700, rate_non_eur: null, capacity_min: 1, capacity_max: 2 }],
      }],
      exchange_rates: [],
    })
    const find = makeDayTourVehicleFinder('org-1', 'USD')
    expect(await find('Luxor', 2, true)).toEqual({ rate: 54, vehicle: 'Sedan' })
  })
})
