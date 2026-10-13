// POST and GET /api/itineraries (the in-memory Supabase mock).
//
//   - POST inserted the request body as it came, forcing only org_id: id,
//     total_paid, payment_status, fx_frozen, status, another company's
//     client — any column. It now writes the New Itinerary fields only, as a
//     draft, in the company's currency, and refuses a foreign client,
//     programme or destination.
//   - Its code (ITN-YYYY-NNNN, unique install-wide) was drawn once: a clash
//     was a 500. A clash now draws another.
//   - The list's cards counted only the 100 loaded rows; the counts now come
//     from the server, over the whole company.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@/lib/supabase-server', async () => {
  const mock = await import('../_mock-supabase')
  const client = () => {
    const base = mock.createMockClient()
    return {
      ...base,
      from: (t: string) => {
        const b = base.from(t) as any
        b.range = () => b
        return b
      },
    }
  }
  return { createServerClient: client, supabaseServer: client() }
})
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: vi.fn(async () => 'org-1'),
  getCurrentUserId: vi.fn(async () => 'user-1'),
  noOrgResponse: () => new Response(JSON.stringify({ success: false }), { status: 403 }),
}))

import { GET, POST } from '@/app/api/itineraries/route'
import { insertItineraryWithCode, isItineraryCodeClash, itineraryCode } from '@/lib/itineraries/itinerary-code'

const rows = async (t: string) => ((await (createMockClient().from(t) as any).select('*')).data as any[])
const post = async (body: unknown) => {
  const res = await POST({ json: async () => body } as any)
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  setMockTables({
    itineraries: [], itinerary_versions: [],
    organizations: [{ id: 'org-1', default_currency: 'JPY', rate_currency: 'USD' }],
    clients: [{ id: 'c-own', org_id: 'org-1' }, { id: 'c-other', org_id: 'org-2' }],
    tour_templates: [], destinations: [],
  })
})

describe('POST /api/itineraries writes a new trip, nothing else', () => {
  it('the New Itinerary fields only; a draft at zero; columns the caller should never set are dropped', async () => {
    const { status } = await post({
      client_name: 'Aiko', client_email: 'a@x.jp', trip_name: 'Kyoto', start_date: '2026-12-01', end_date: '2026-12-03',
      num_adults: 2, client_id: 'c-own',
      // none of these may come from the request
      id: 'chosen-id', org_id: 'org-2', status: 'confirmed', total_paid: 999, payment_status: 'paid',
      fx_frozen: { base: 'EUR', rates: {} }, assigned_vehicle_id: 'v-x', total_cost: 123456,
    })
    expect(status).toBe(200)
    const [trip] = await rows('itineraries')
    expect(trip).toMatchObject({ org_id: 'org-1', status: 'draft', total_cost: 0, client_id: 'c-own', total_days: 3, currency: 'JPY' })
    expect(trip.id).not.toBe('chosen-id')
    for (const col of ['total_paid', 'payment_status', 'fx_frozen', 'assigned_vehicle_id']) expect(trip[col], col).toBeUndefined()
    expect(trip.itinerary_code).toMatch(/^ITN-\d{4}-\d{4}$/)
  })

  it("another company's client → 404 and nothing is created", async () => {
    const { status, json } = await post({ client_name: 'X', trip_name: 'Y', client_id: 'c-other' })
    expect(status).toBe(404)
    expect(json.error).toBe('Client not found')
    expect(await rows('itineraries')).toHaveLength(0)
  })

  it('the currency named is kept; an unknown one is refused', async () => {
    expect((await post({ client_name: 'X', trip_name: 'Y', currency: 'EUR' })).status).toBe(200)
    expect((await rows('itineraries'))[0].currency).toBe('EUR')
    expect((await post({ client_name: 'X', trip_name: 'Y', currency: 'DOGE' })).status).toBe(400)
  })

  it("no currency and none set by the company: the company's rate currency, never a constant", async () => {
    setMockTables({ itineraries: [], itinerary_versions: [], organizations: [{ id: 'org-1', default_currency: null, rate_currency: 'USD' }], clients: [] })
    await post({ client_name: 'X', trip_name: 'Y' })
    expect((await rows('itineraries'))[0].currency).toBe('USD')
  })
})

describe('the itinerary code is drawn again when it is taken', () => {
  it('a clash on itinerary_code retries with a new code; another unique clash does not', async () => {
    const codes: string[] = []
    let calls = 0
    const fake = {
      from: () => ({
        insert: (row: { itinerary_code: string }) => ({
          select: () => ({
            single: async () => {
              codes.push(row.itinerary_code)
              calls++
              return calls === 1
                ? { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "itineraries_itinerary_code_key"' } }
                : { data: { id: 'new', itinerary_code: row.itinerary_code }, error: null }
            },
          }),
        }),
      }),
    }
    let n = 0
    const { data, error } = await insertItineraryWithCode(fake, { trip_name: 'x' }, () => `ITN-2026-000${++n}`)
    expect(error).toBeNull()
    expect(data).toMatchObject({ itinerary_code: 'ITN-2026-0002' })
    expect(codes).toEqual(['ITN-2026-0001', 'ITN-2026-0002'])
    expect(isItineraryCodeClash({ code: '23505', message: 'duplicate key value violates unique constraint "idx_itineraries_thread_id_unique"' })).toBe(false)
  })

  it('code shapes', () => {
    expect(itineraryCode(2026, null, 0)).toBe('ITN-2026-1000')
    expect(itineraryCode(2026, 's', 0.9999)).toBe('ITN-S-2026-9999')
  })
})

describe('GET /api/itineraries?counts=true', () => {
  it('counts every trip of the company by status, not the loaded page', async () => {
    const trips = [
      ...Array.from({ length: 3 }, (_, i) => ({ id: `d${i}`, org_id: 'org-1', status: 'draft', created_at: `2026-01-0${i + 1}` })),
      { id: 'c1', org_id: 'org-1', status: 'confirmed', created_at: '2026-02-01' },
      { id: 'x1', org_id: 'org-2', status: 'confirmed', created_at: '2026-02-01' },
    ]
    setMockTables({ itineraries: trips, itinerary_versions: [] })
    const res = await GET({ url: 'http://x/api/itineraries?page=1&limit=2&counts=true' } as any)
    const json = await res.json()
    expect(json.status_counts).toMatchObject({ total: 4, draft: 3, confirmed: 1, cancelled: 0 })
  })

  it('searches and filters on the server', async () => {
    setMockTables({
      itineraries: [
        { id: 'a', org_id: 'org-1', status: 'draft', client_name: 'Suzuki', trip_name: 'Nile', itinerary_code: 'ITN-1', created_at: '1' },
        { id: 'b', org_id: 'org-1', status: 'sent', client_name: 'Tanaka', trip_name: 'Giza', itinerary_code: 'ITN-2', created_at: '2' },
      ],
      itinerary_versions: [],
    })
    const bySearch = await (await GET({ url: 'http://x/api/itineraries?search=tanaka' } as any)).json()
    expect(bySearch.data.map((r: { id: string }) => r.id)).toEqual(['b'])
    const byStatus = await (await GET({ url: 'http://x/api/itineraries?status=draft' } as any)).json()
    expect(byStatus.data.map((r: { id: string }) => r.id)).toEqual(['a'])
  })
})
