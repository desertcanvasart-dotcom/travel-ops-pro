// Rates › Accommodation audit (hotels, cruises, sleeping trains, hotel
// services), the route half. Two companies' fixtures: company A must not
// save, or be shown, company B's supplier or ship; duplicates are keyed on
// what really makes a contract different; a delete that would strand a
// reference is refused with the reason; removing every period sticks and a
// backwards period is refused.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null }))

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient(), supabaseServer: createMockClient() }))
vi.mock('@/lib/supabase-actor', () => ({ createActorAdminClient: () => createMockClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => 'u1',
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/i18n/server-messages', () => ({ tServer: async (key: string) => key }))

import * as hotels from '@/app/api/rates/hotels/route'
import * as hotelById from '@/app/api/rates/hotels/[id]/route'
import * as cruises from '@/app/api/rates/cruises/route'
import * as cruiseById from '@/app/api/rates/cruises/[id]/route'
import * as sleepers from '@/app/api/rates/sleeping-trains/route'
import * as sleeperById from '@/app/api/rates/sleeping-trains/[id]/route'
import * as services from '@/app/api/rates/hotel-services/route'
import * as serviceById from '@/app/api/rates/hotel-services/[id]/route'
import * as resourceHotelById from '@/app/api/resources/hotels/[id]/route'
import * as propertyById from '@/app/api/suppliers/[id]/properties/[propertyId]/route'
import { seasonsForRow } from '@/lib/rates/rate-seasons'

const json = (body: unknown) => ({ json: async () => body }) as never
const get = (url: string) => new NextRequest(url)
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })
const rows = async (table: string) => ((await (createMockClient().from(table) as any).select('*')).data ?? []) as Record<string, any>[]

const period = (from: string, to: string, ppd = 80) => ({
  name: '', from, to,
  rates: { pp_double_eur: ppd, single_supp_eur: 20, triple_red_eur: 5, pp_double_non_eur: ppd, single_supp_non_eur: 20, triple_red_non_eur: 5 },
})

const HOTEL = {
  id: 'h1', org_id: 'org-a', service_code: 'ACC-CAI-1', property_name: 'Nile View', property_type: 'hotel',
  city: 'Cairo', tier: 'standard', board_basis: 'BB', supplier_id: 'sa', is_active: true,
  rate_valid_from: null, rate_valid_to: null,
  seasons: [period('2026-01-01', '2026-12-31')],
  low_season_from: '2026-01-01', low_season_to: '2026-12-31', pp_double_eur: 80,
  // The pre-migration high window the form re-sends from the row.
  high_season_from: '2025-10-01', high_season_to: '2026-04-30', high_pp_double_eur: 120,
}

beforeEach(() => {
  ctx.orgId = 'org-a'
  setMockTables({
    suppliers: [
      { id: 'sa', org_id: 'org-a', name: 'A Hotels' },
      { id: 'sa2', org_id: 'org-a', name: 'A Direct' },
      { id: 'sb', org_id: 'org-b', name: 'B Hotels' },
    ],
    supplier_properties: [
      { id: 'ship-a', org_id: 'org-a', supplier_id: 'sa', property_type: 'ship', name: 'A Ship' },
      { id: 'ship-b', org_id: 'org-b', supplier_id: 'sb', property_type: 'ship', name: 'B Ship' },
      { id: 'hotel-a-other', org_id: 'org-a', supplier_id: 'sa2', property_type: 'hotel', name: 'Other Supplier Hotel' },
    ],
    accommodation_rates: [structuredClone(HOTEL)],
    nile_cruises: [
      { id: 'c-a', org_id: 'org-a', cruise_code: 'C-A', ship_name: 'B Ship', property_id: 'ship-b', route_name: 'Luxor to Aswan' },
    ],
    sleeping_train_rates: [
      { id: 's1', org_id: 'org-a', service_code: 'SLP-1', origin_city: 'Giza', destination_city: 'Luxor', cabin_type: 'single', rate_oneway_eur: 100, supplier_id: 'sa', rate_valid_from: '2026-01-01', rate_valid_to: '2026-12-31', is_active: true },
    ],
    hotel_staff_rates: [],
    tour_days: [],
    tour_templates: [],
    itinerary_services: [],
  })
})

describe('finding 1 — another company\'s supplier is refused on hotel services and sleepers', () => {
  it('POST /api/rates/hotel-services with B\'s supplier is a 400 and writes nothing', async () => {
    const res = await services.POST(json({ service_type: 'porter', hotel_category: 'standard', rate_eur: 10, supplier_id: 'sb' }))
    expect(res.status).toBe(400)
    expect(await rows('hotel_staff_rates')).toHaveLength(0)
  })

  it('POST /api/rates/hotel-services drops id / created_at / unknown keys (finding 22)', async () => {
    const res = await services.POST(json({ id: 'forced', created_at: '2000-01-01', bogus: 1, service_type: 'porter', hotel_category: 'standard', rate_eur: 10, supplier_id: 'sa' }))
    expect(res.status).toBe(200)
    const [row] = await rows('hotel_staff_rates')
    expect(row.id).not.toBe('forced')
    expect(row.created_at).toBeUndefined()
    expect(row.bogus).toBeUndefined()
    expect(row.supplier_id).toBe('sa')
    expect(row.org_id).toBe('org-a')
  })

  it('PUT /api/rates/hotel-services/:id with B\'s supplier is a 400', async () => {
    setMockTables({ suppliers: [{ id: 'sb', org_id: 'org-b' }], hotel_staff_rates: [{ id: 'hs', org_id: 'org-a', service_type: 'porter', supplier_id: null }] })
    const res = await serviceById.PUT(json({ service_type: 'porter', supplier_id: 'sb' }), params({ id: 'hs' }))
    expect(res.status).toBe(400)
    expect((await rows('hotel_staff_rates'))[0].supplier_id).toBeNull()
  })

  it('PUT /api/rates/sleeping-trains/:id with B\'s supplier is a 400 and the row is unchanged', async () => {
    const res = await sleeperById.PUT(json({ supplier_id: 'sb' }), params({ id: 's1' }))
    expect(res.status).toBe(400)
    expect((await rows('sleeping_train_rates'))[0].supplier_id).toBe('sa')
  })

  it('POST /api/rates/sleeping-trains with B\'s supplier is a 400', async () => {
    const res = await sleepers.POST(json({ origin_city: 'Giza', destination_city: 'Aswan', cabin_type: 'single', rate_oneway_eur: 90, supplier_id: 'sb' }))
    expect(res.status).toBe(400)
    expect(await rows('sleeping_train_rates')).toHaveLength(1)
  })
})

describe('finding 19 — a sleeper validity that ends before it starts is refused', () => {
  it('POST', async () => {
    const res = await sleepers.POST(json({ origin_city: 'Giza', destination_city: 'Aswan', cabin_type: 'single', rate_oneway_eur: 90, rate_valid_from: '2026-05-01', rate_valid_to: '2026-04-01' }))
    expect(res.status).toBe(400)
  })
  it('PUT with only Valid To, against the stored Valid From', async () => {
    const res = await sleeperById.PUT(json({ rate_valid_to: '2025-12-31' }), params({ id: 's1' }))
    expect(res.status).toBe(400)
    expect((await rows('sleeping_train_rates'))[0].rate_valid_to).toBe('2026-12-31')
  })
  it('PUT with a negative fare is refused', async () => {
    const res = await sleeperById.PUT(json({ rate_oneway_eur: -5 }), params({ id: 's1' }))
    expect(res.status).toBe(400)
  })
})

describe('finding 2 — the legacy /api/resources/hotels and the joined supplier', () => {
  it('PUT /api/resources/hotels/:id with B\'s supplier is a 400', async () => {
    const res = await resourceHotelById.PUT(json({ supplier_id: 'sb' }), params({ id: 'h1' }))
    expect(res.status).toBe(400)
    expect((await rows('accommodation_rates'))[0].supplier_id).toBe('sa')
  })

  it('GET /api/rates/hotels shows no supplier for a row joined to another company\'s', async () => {
    setMockTables({
      suppliers: [],
      accommodation_rates: [
        { ...structuredClone(HOTEL), supplier: { id: 'sb', name: 'B Hotels', contact_phone: '+20 B', org_id: 'org-b' } },
        { ...structuredClone(HOTEL), id: 'h2', supplier: { id: 'sa', name: 'A Hotels', org_id: 'org-a' } },
      ],
    })
    const body = await (await hotels.GET(get('http://x/api/rates/hotels'))).json()
    expect(body.data.find((r: any) => r.id === 'h1').supplier).toBeNull()
    expect(body.data.find((r: any) => r.id === 'h2').supplier).toEqual({ id: 'sa', name: 'A Hotels' })
  })
})

describe('finding 3 — a cruise never stores a property_id the resolver refused', () => {
  it('POST with "No supplier" and B\'s ship stores property_id null', async () => {
    const res = await cruises.POST(json({
      id: 'forced-id', cruise_code: 'NEW-1', ship_name: 'Some Ship', ship_category: 'standard',
      embark_city: 'Luxor', disembark_city: 'Aswan', route_name: 'Luxor to Aswan', duration_nights: 4,
      cabin_type: 'standard', supplier_id: '__none__', property_id: 'ship-b', seasons: [],
    }))
    expect(res.status).toBe(200)
    const row = (await rows('nile_cruises')).find(r => r.cruise_code === 'NEW-1')!
    expect(row.property_id).toBeNull()
    // Finding 14: the raw body is no longer spread.
    expect(row.id).not.toBe('forced-id')
  })

  it('PUT with B\'s ship id never writes it', async () => {
    const res = await cruiseById.PUT(json({ property_id: 'ship-b', supplier_id: '__none__' }), params({ id: 'c-a' }))
    expect(res.status).toBe(200)
    expect((await rows('nile_cruises'))[0].property_id).toBeNull()
    // With our supplier, the ship resolves to OUR property by name.
    await cruiseById.PUT(json({ property_id: 'ship-b', supplier_id: 'sa', ship_name: 'A Ship' }), params({ id: 'c-a' }))
    expect((await rows('nile_cruises'))[0].property_id).toBe('ship-a')
  })

  it('renaming B\'s ship leaves company A\'s cruise rows alone, and A\'s rows do not block B\'s delete', async () => {
    ctx.orgId = 'org-b'
    const put = await propertyById.PUT(json({ name: 'B Ship Renamed' }), params({ id: 'sb', propertyId: 'ship-b' }))
    expect(put.status).toBe(200)
    expect((await rows('nile_cruises'))[0].ship_name).toBe('B Ship')
    const del = await propertyById.DELETE(json({}), params({ id: 'sb', propertyId: 'ship-b' }))
    expect(del.status).toBe(200)
  })
})

describe('finding 4 / 13 — duplicates keyed on what makes a contract different', () => {
  const hotelBody = { property_name: 'nile view', city: 'Cairo', tier: 'standard', board_basis: 'BB', supplier_id: 'sa', property_type: 'hotel', seasons: [period('2026-01-01', '2026-12-31')] }

  it('the identical hotel is a 409 naming the real key', async () => {
    const res = await hotels.POST(json(hotelBody))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/board basis/)
  })

  it('another board basis, supplier or validity is a new rate', async () => {
    expect((await hotels.POST(json({ ...hotelBody, board_basis: 'HB' }))).status).toBe(200)
    expect((await hotels.POST(json({ ...hotelBody, supplier_id: 'sa2', service_code: 'X2' }))).status).toBe(200)
    expect((await hotels.POST(json({ ...hotelBody, rate_valid_from: '2027-01-01', rate_valid_to: '2027-12-31', service_code: 'X3' }))).status).toBe(200)
  })

  it('the same cruise twice is a 409 the second time (route_name, not `route`)', async () => {
    const body = {
      cruise_code: 'DUP-1', ship_name: 'A Ship', ship_category: 'standard', embark_city: 'Luxor', disembark_city: 'Aswan',
      route_name: 'Luxor to Aswan', duration_nights: 4, cabin_type: 'standard', supplier_id: 'sa', seasons: [],
    }
    expect((await cruises.POST(json(body))).status).toBe(200)
    const again = await cruises.POST(json({ ...body, cruise_code: 'DUP-2' }))
    expect(again.status).toBe(409)
    // A 3-night sailing of the same ship is another rate.
    expect((await cruises.POST(json({ ...body, cruise_code: 'DUP-3', duration_nights: 3 }))).status).toBe(200)
  })

  it('GET ?route= filters on route_name', async () => {
    const body = await (await cruises.GET(get('http://x/api/rates/cruises?route=Luxor%20to%20Aswan'))).json()
    expect(body.success).toBe(true)
    expect(body.data.map((r: any) => r.id)).toEqual(['c-a'])
  })
})

describe('finding 5 — a rate in use is not deleted', () => {
  it('a hotel a tour day uses is a 409 with the reason', async () => {
    setMockTables({ accommodation_rates: [structuredClone(HOTEL)], tour_days: [{ id: 'td', accommodation_id: 'h1' }], tour_templates: [], itinerary_services: [] })
    const res = await hotelById.DELETE(json({}), params({ id: 'h1' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/1 tour day.*untick Active/)
    expect(await rows('accommodation_rates')).toHaveLength(1)
  })

  it('a ship a programme day names is a 409', async () => {
    setMockTables({
      nile_cruises: [{ id: 'c-a', org_id: 'org-a' }], tour_days: [], itinerary_services: [],
      tour_templates: [{ id: 't', org_id: 'org-a', itinerary: [{ day: 2, property_by_tier: { standard: 'c-a' } }] }],
    })
    const res = await cruiseById.DELETE(json({}), params({ id: 'c-a' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/1 programme/)
  })

  it('a hotel service a Pricing Grid line names is a 409; an unused one deletes', async () => {
    setMockTables({
      hotel_staff_rates: [{ id: 'hs1', org_id: 'org-a' }, { id: 'hs2', org_id: 'org-a' }], tour_days: [], tour_templates: [],
      itinerary_services: [{ id: 'is', notes: '__grid:slot:hotel_service|rate_id:hs1' }],
    })
    expect((await serviceById.DELETE(json({}), params({ id: 'hs1' }))).status).toBe(409)
    expect((await serviceById.DELETE(json({}), params({ id: 'hs2' }))).status).toBe(200)
  })
})

describe('finding 7 / 11 — periods: clearing sticks, a backwards period is refused', () => {
  const editBody = { ...HOTEL, seasons: [] as unknown[] }

  it('PUT seasons: [] saves no periods, and the old windows do not come back', async () => {
    const res = await hotelById.PUT(json(editBody), params({ id: 'h1' }))
    expect(res.status).toBe(200)
    const saved = (await rows('accommodation_rates'))[0]
    expect(saved.seasons).toEqual([])
    expect(seasonsForRow(saved, 'accommodation')).toEqual([])
    expect(saved.pp_double_eur).toBeNull()
  })

  it('PUT with one backwards period is a 400 and the row keeps its periods', async () => {
    const res = await hotelById.PUT(json({ ...HOTEL, seasons: [period('2026-01-01', '2026-03-31'), period('2026-06-01', '2026-05-01')] }), params({ id: 'h1' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/ends .* before it starts/)
    expect((await rows('accommodation_rates'))[0].seasons).toHaveLength(1)
  })

  it('PUT with a negative period rate or legacy column is a 400', async () => {
    const neg = period('2026-01-01', '2026-12-31', -10)
    expect((await hotelById.PUT(json({ ...HOTEL, seasons: [neg] }), params({ id: 'h1' }))).status).toBe(400)
    expect((await hotelById.PUT(json({ ...HOTEL, high_pp_double_eur: -1 }), params({ id: 'h1' }))).status).toBe(400)
  })

  it('a cruise PUT with seasons: [] clears its legacy windows too', async () => {
    setMockTables({ suppliers: [], nile_cruises: [{ id: 'c1', org_id: 'org-a', ship_name: 'X', low_season_start: '2026-01-01', low_season_end: '2026-12-31', rate_low_double_eur: 90 }] })
    expect((await cruiseById.PUT(json({ seasons: [] }), params({ id: 'c1' }))).status).toBe(200)
    expect(seasonsForRow((await rows('nile_cruises'))[0], 'cruise')).toEqual([])
  })
})

describe('finding 12 — a property of the same company but another supplier is not linked', () => {
  it('a hotel rate under supplier sa cannot link sa2\'s hotel by id', async () => {
    const res = await hotelById.PUT(json({ ...HOTEL, property_id: 'hotel-a-other' }), params({ id: 'h1' }))
    expect(res.status).toBe(200)
    expect((await rows('accommodation_rates'))[0].property_id).not.toBe('hotel-a-other')
  })
})
