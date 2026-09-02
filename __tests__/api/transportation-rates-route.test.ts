import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient, type MockTables } from '../_mock-supabase'

// Route-level tests for POST /api/rates/transportation natural-key dedup.
//
// Regression: the dedup key originally omitted service_code, but live data
// legitimately holds many rows per coarse key (city/service_type/duration/area
// or origin/destination) that differ only by service_code — e.g. 15 named
// Aswan city_tour routes, 4 Cairo→Alexandria intercity variants. Posting a new
// named route used to UPDATE an arbitrary existing variant (existing[0])
// instead of inserting, silently corrupting that route's rates. The key must
// match transportRateKey() in app/api/cron/data-invariants/route.ts:
// service_code case-insensitive, null/'' as a single identity.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})

// Supplier resolution is exercised elsewhere; here it just passes fields
// through so the dedup logic under test sees them unchanged.
vi.mock('@/lib/suppliers/validate-supplier-fields', () => ({
  validateAndResolveSupplierFields: vi.fn(async (body: any) => ({
    ok: true,
    supplier_id: body.supplier_id ?? null,
    supplier_name: body.supplier_name ?? null,
  })),
}))

import { POST } from '@/app/api/rates/transportation/route'

function makeRequest(body: Record<string, any>) {
  return { json: async () => body } as any
}

async function post(body: Record<string, any>) {
  const res = await POST(makeRequest(body))
  return { status: res.status, json: await res.json() }
}

// The mock has no raw-table accessor; read back through an unfiltered query.
async function rowsViaQuery(): Promise<any[]> {
  const { data } = await (createMockClient().from('transportation_rates') as any).select('*')
  return data ?? []
}

const ASWAN_TOURS: MockTables['transportation_rates'] = [
  {
    id: 't-docks', supplier_id: null, service_type: 'city_tour', service_code: 'ASWAN-NORTH-DOCKS',
    city: 'Aswan', origin_city: null, destination_city: null, duration: 'full_day', area: null,
    route_name: 'Aswan North Docks', sedan_rate_eur: 40,
  },
  {
    id: 't-highdam', supplier_id: null, service_type: 'city_tour', service_code: 'ASWAN-HIGH-DAM-HOTEL',
    city: 'Aswan', origin_city: null, destination_city: null, duration: 'full_day', area: null,
    route_name: 'Aswan High Dam Hotel', sedan_rate_eur: 55,
  },
]

const INTERCITY_VARIANTS: MockTables['transportation_rates'] = [
  {
    id: 't-cai-alex-1', supplier_id: null, service_type: 'intercity', service_code: 'CAI-ALEX-DIRECT',
    city: null, origin_city: 'Cairo', destination_city: 'Alexandria', duration: null, area: null,
    sedan_rate_eur: 120,
  },
  {
    id: 't-cai-alex-2', supplier_id: null, service_type: 'intercity', service_code: 'CAI-ALEX-VIA-WADI',
    city: null, origin_city: 'Cairo', destination_city: 'Alexandria', duration: null, area: null,
    sedan_rate_eur: 150,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  setMockTables({ transportation_rates: structuredClone(ASWAN_TOURS), suppliers: [] })
})

describe('POST /api/rates/transportation — service_code is part of the natural key', () => {
  it('inserts a new named route instead of clobbering an existing coarse-key match', async () => {
    const { status, json } = await post({
      service_type: 'city_tour', city: 'Aswan', duration: 'full_day',
      service_code: 'ASWAN-PHILAE-TEMPLE', sedan_rate_eur: 60,
    })

    expect(status).toBe(201)
    expect(json.updated).toBe(false)
    expect(json.data.service_code).toBe('ASWAN-PHILAE-TEMPLE')

    const rows = await rowsViaQuery()
    expect(rows).toHaveLength(3)
    // The pre-existing named routes keep their own rates.
    expect(rows.find((r) => r.id === 't-docks').sedan_rate_eur).toBe(40)
    expect(rows.find((r) => r.id === 't-highdam').sedan_rate_eur).toBe(55)
  })

  it('refuses an exact duplicate (case-insensitive service_code) with the existing row — never updates', async () => {
    const { status, json } = await post({
      service_type: 'city_tour', city: 'Aswan', duration: 'full_day',
      service_code: 'aswan-high-dam-hotel', sedan_rate_eur: 70,
    })

    expect(status).toBe(409)
    expect(json.success).toBe(false)
    expect(json.existing.id).toBe('t-highdam')

    const rows = await rowsViaQuery()
    expect(rows).toHaveLength(2)
    // The original keeps its rate: a create never rewrites a row.
    expect(rows.find((r) => r.id === 't-highdam').sedan_rate_eur).toBe(55)
    // The sibling named route is untouched.
    expect(rows.find((r) => r.id === 't-docks').sedan_rate_eur).toBe(40)
  })

  it('inserts a new intercity variant alongside existing same-city-pair variants', async () => {
    setMockTables({ transportation_rates: structuredClone(INTERCITY_VARIANTS), suppliers: [] })

    const { status, json } = await post({
      service_type: 'intercity', origin_city: 'Cairo', destination_city: 'Alexandria',
      service_code: 'CAI-ALEX-COASTAL', sedan_rate_eur: 140,
    })

    expect(status).toBe(201)
    expect(json.updated).toBe(false)
    const rows = await rowsViaQuery()
    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.id === 't-cai-alex-1').sedan_rate_eur).toBe(120)
    expect(rows.find((r) => r.id === 't-cai-alex-2').sedan_rate_eur).toBe(150)
  })

  it('refuses to overwrite the intercity variant whose service_code matches', async () => {
    setMockTables({ transportation_rates: structuredClone(INTERCITY_VARIANTS), suppliers: [] })

    const { status, json } = await post({
      service_type: 'intercity', origin_city: 'Cairo', destination_city: 'Alexandria',
      service_code: 'CAI-ALEX-VIA-WADI', sedan_rate_eur: 160,
    })

    expect(status).toBe(409)
    expect(json.existing.id).toBe('t-cai-alex-2')
    const rows = await rowsViaQuery()
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.id === 't-cai-alex-2').sedan_rate_eur).toBe(150)
    expect(rows.find((r) => r.id === 't-cai-alex-1').sedan_rate_eur).toBe(120)
  })

  it('still detects the duplicate when no service_code is sent and the generated code matches — and refuses it', async () => {
    // generateServiceCode('Aswan', city_tour, full_day) -> ASWAN-FULL-CTOUR
    setMockTables({
      transportation_rates: [
        {
          id: 't-generated', supplier_id: null, service_type: 'city_tour', service_code: 'ASWAN-FULL-CTOUR',
          city: 'Aswan', origin_city: null, destination_city: null, duration: 'full_day', area: null,
          sedan_rate_eur: 45,
        },
      ],
      suppliers: [],
    })

    const { status, json } = await post({
      service_type: 'city_tour', city: 'Aswan', duration: 'full_day', sedan_rate_eur: 50,
    })

    expect(status).toBe(409)
    expect(json.existing.id).toBe('t-generated')
    const rows = await rowsViaQuery()
    expect(rows).toHaveLength(1)
    expect(rows[0].sedan_rate_eur).toBe(45)
  })
})
