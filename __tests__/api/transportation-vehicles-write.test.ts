// POST /api/rates/transportation writes a vehicles list.
//
// P2 of vehicle bands: the route takes `vehicles` (a list keyed by the
// agency's vehicle types) or the legacy per-vehicle fields, validates the
// keys against Settings → Vocabulary → Vehicle types, and stores the list
// PLUS its mirror into the five legacy columns for readers not yet
// converted. This is what makes a vehicle the agency added (a 4x4, a horse
// carriage) priceable at all.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})
vi.mock('@/lib/suppliers/validate-supplier-fields', () => ({
  validateAndResolveSupplierFields: vi.fn(async (body: Record<string, unknown>) => ({
    ok: true, supplier_id: body.supplier_id ?? null, supplier_name: body.supplier_name ?? null,
  })),
}))
// The agency's vocabulary: the presets plus a 4x4. No transport service
// types → the route keeps its built-in intercity rule.
vi.mock('@/lib/vocabulary-server', () => ({
  vocabularyItemsForCurrentOrg: vi.fn(async (kind: string) =>
    kind === 'vehicle_type'
      ? ['sedan', 'minivan', 'van', 'minibus', 'bus', '4x4'].map(key => ({ key, label: key, meta: {} }))
      : []),
}))

import { POST } from '@/app/api/rates/transportation/route'

const post = async (body: Record<string, unknown>) => {
  const res = await POST({ json: async () => body } as never)
  return { status: res.status, json: await res.json() }
}
const rows = async () => (await (createMockClient().from('transportation_rates') as never as { select: (c: string) => Promise<{ data: Record<string, unknown>[] | null }> }).select('*')).data ?? []

const base = { supplier_id: null, service_type: 'city_tour', city: 'Luxor', duration: 'full_day' }

beforeEach(() => { setMockTables({ transportation_rates: [] }) })

describe('POST /api/rates/transportation — the vehicles list', () => {
  it('stores a list with an agency-added vehicle and mirrors the presets into the legacy columns', async () => {
    const { status } = await post({ ...base, service_code: 'LXR-4X4', vehicles: [
      { key: 'sedan', rate_eur: 45, rate_non_eur: null, capacity_min: 1, capacity_max: 2 },
      { key: '4x4', rate_eur: 85, rate_non_eur: null, capacity_min: 1, capacity_max: 6 },
    ] })
    expect(status).toBe(201)
    const [row] = await rows()
    expect((row.vehicles as { key: string }[]).map(v => v.key)).toEqual(['sedan', '4x4'])
    expect(row.sedan_rate_eur).toBe(45)
    expect(row.sedan_rate_non_eur).toBe(45) // "same as EUR" mirrored
    expect(row.minivan_rate_eur).toBeNull()  // an absent preset is cleared
    expect('4x4_rate_eur' in row).toBe(false) // a custom vehicle lives only in the list
  })

  it('refuses a vehicle the agency has not defined, naming the allowed keys', async () => {
    const { status, json } = await post({ ...base, service_code: 'LXR-TUK', vehicles: [
      { key: 'tuk_tuk', rate_eur: 10, rate_non_eur: null, capacity_min: 1, capacity_max: 2 },
    ] })
    expect(status).toBe(400)
    expect(json.error).toMatch(/tuk_tuk/)
    expect(json.error).toMatch(/4x4/)
    expect(await rows()).toEqual([])
  })

  it('still accepts the legacy shape (older clients, the importer) and builds the list from it', async () => {
    const { status } = await post({ ...base, service_code: 'LXR-LEGACY', sedan_rate_eur: 40, bus_rate_eur: 140, bus_capacity_min: 25, bus_capacity_max: 45 })
    expect(status).toBe(201)
    const [row] = await rows()
    expect(row.vehicles).toEqual([
      { key: 'sedan', rate_eur: 40, rate_non_eur: null, capacity_min: 1, capacity_max: 2 },
      { key: 'bus', rate_eur: 140, rate_non_eur: null, capacity_min: 25, capacity_max: 45 },
    ])
    expect(row.sedan_rate_eur).toBe(40)
  })

  it('a list that prices nothing is refused', async () => {
    const { status, json } = await post({ ...base, service_code: 'LXR-EMPTY', vehicles: [{ key: 'sedan', rate_eur: '', capacity_min: 1, capacity_max: 2 }] })
    expect(status).toBe(400)
    expect(json.error).toMatch(/at least one vehicle/i)
  })
})
