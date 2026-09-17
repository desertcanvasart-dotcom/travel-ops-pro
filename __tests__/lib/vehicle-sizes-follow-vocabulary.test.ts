import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { stampVocabularyBands, vehicleBands, vehicleRateForPax, sameVehicleBands } from '@/lib/rates/vehicle-bands'
import { createRateNormalizer } from '@/lib/rates/rate-currency'
import type { ExchangeRates } from '@/lib/currency-service'

// Operator, 2026-09-17:
//   "The transport package form should be aligned with the transportation
//    form — now they are different, and that will cause trouble."
//   "Transportation rates always follow the Vocabulary vehicle sizes."
// A package prices the same `vehicles` list a transportation rate does, both
// forms use one table, and every vehicle's passenger size is the vocabulary's.

const vocab = [
  { key: 'hiace', min_pax: 1, max_pax: 5 },
  { key: 'coaster', min_pax: 6, max_pax: 12 },
  { key: 'bus', min_pax: 13, max_pax: 45 },
]

describe('sizes are the vocabulary\'s', () => {
  it('stamps the vocabulary size on every vehicle it lists; one it does not list keeps its own', () => {
    const stamped = stampVocabularyBands([
      { key: 'bus', rate_eur: 900, rate_non_eur: null, capacity_min: 21, capacity_max: 50 },
      { key: 'hiace', rate_eur: 100, rate_non_eur: null, capacity_min: 1, capacity_max: 3 },
      { key: 'sedan', rate_eur: 60, rate_non_eur: null, capacity_min: 1, capacity_max: 2 },
    ], vocab)
    expect(stamped.map(v => [v.key, v.capacity_min, v.capacity_max])).toEqual([
      ['sedan', 1, 2], ['hiace', 1, 5], ['bus', 13, 45],
    ])
  })

  it('sameVehicleBands tells a re-stamp which rows to write', () => {
    const list = [{ key: 'hiace', rate_eur: 100, rate_non_eur: null, capacity_min: 1, capacity_max: 5 }]
    expect(sameVehicleBands(list, stampVocabularyBands(list, vocab))).toBe(true)
    expect(sameVehicleBands(list, stampVocabularyBands(list, [{ key: 'hiace', min_pax: 1, max_pax: 7 }]))).toBe(false)
  })
})

describe('a transport package prices vehicles like a transportation rate', () => {
  it('reads its list', () => {
    const pkg = { vehicles: [
      { key: 'hiace', rate_eur: 3000, rate_non_eur: null, capacity_min: 1, capacity_max: 5 },
      { key: 'coaster', rate_eur: 6500, rate_non_eur: null, capacity_min: 6, capacity_max: 12 },
    ] }
    expect(vehicleRateForPax(pkg, 2)?.key).toBe('hiace')
    expect(vehicleRateForPax(pkg, 8)?.rate_eur).toBe(6500)
  })

  it('a package read before its list (the five columns): a vehicle with no rate is skipped', () => {
    // The 4D package on production: no sedan price, minivan to 5.
    const legacy = { sedan_rate: 0, sedan_capacity: 3, minivan_rate: 3500, minivan_capacity: 5, van_rate: 5000, van_capacity: 12, minibus_rate: 7000, minibus_capacity: 20, bus_rate: 8000, bus_capacity: 50 }
    expect(vehicleBands(legacy).map(b => [b.key, b.capacity_min, b.capacity_max])).toEqual([
      ['minivan', 4, 5], ['van', 6, 12], ['minibus', 13, 20], ['bus', 21, 50],
    ])
    expect(vehicleRateForPax(legacy, 2)).toMatchObject({ key: 'minivan', rate_eur: 3500 })
  })

  it('an EGP package list converts into the run currency', async () => {
    const RATES = { base: 'USD', rates: { USD: 1, EGP: 50 }, timestamp: 0 } as unknown as ExchangeRates
    const n = createRateNormalizer('USD', { getRates: async () => RATES })
    const [r] = (await n.normalize('b2b_transport_packages', [{ id: 'p', rate_currency: 'EGP', vehicles: [{ key: 'hiace', rate_eur: 3000, rate_non_eur: null, capacity_min: 1, capacity_max: 5 }] }]))!
    expect((r.vehicles as Array<{ rate_eur: number }>)[0].rate_eur).toBe(60)
  })
})

vi.mock('@/lib/vocabulary-server', () => ({
  vocabularyItemsForCurrentOrg: async () => [
    { key: 'hiace', label: 'HIACE', meta: { min_pax: 1, max_pax: 5 } },
    { key: 'bus', label: 'Bus', meta: { min_pax: 13, max_pax: 45 } },
  ],
  vehicleBandsForOrg: async () => [
    { key: 'hiace', min_pax: 1, max_pax: 5 },
    { key: 'bus', min_pax: 13, max_pax: 45 },
  ],
}))

describe('writes and a size changed in Settings', () => {
  beforeEach(() => vi.resetModules())

  it('a save stores the vocabulary size whatever the client sent', async () => {
    const { resolveVehicleWrite } = await import('@/lib/rates/vehicle-bands-server')
    const w = await resolveVehicleWrite({ vehicles: [{ key: 'hiace', rate_eur: 100, capacity_min: 1, capacity_max: 9 }] }, null)
    expect(w).toEqual({ ok: true, patch: { vehicles: [{ key: 'hiace', rate_eur: 100, rate_non_eur: null, capacity_min: 1, capacity_max: 5 }] } })
  })

  it('re-stamps every transportation rate and the org\'s packages, writing only rows that change', async () => {
    const { restampVehicleBands } = await import('@/lib/rates/vehicle-bands-server')
    const tables: Record<string, Array<{ id: string; vehicles: unknown }>> = {
      transportation_rates: [
        { id: 't1', vehicles: [{ key: 'hiace', rate_eur: 100, rate_non_eur: null, capacity_min: 1, capacity_max: 3 }] },
        { id: 't2', vehicles: [{ key: 'bus', rate_eur: 900, rate_non_eur: null, capacity_min: 13, capacity_max: 45 }] },
      ],
      b2b_transport_packages: [
        { id: 'p1', vehicles: [{ key: 'bus', rate_eur: 10000, rate_non_eur: null, capacity_min: 21, capacity_max: 50 }] },
      ],
    }
    const updates: string[] = []
    const client = {
      from: (table: string) => {
        const q: any = {
          select: () => q,
          eq: () => q,
          then: (res: (v: unknown) => void) => res({ data: tables[table], error: null }),
          update: (patch: unknown) => ({ eq: async (_c: string, id: string) => { updates.push(`${table}:${id}:${JSON.stringify(patch)}`); return { error: null } } }),
        }
        return q
      },
    }
    expect(await restampVehicleBands(client as any, 'org')).toBe(2)
    expect(updates.map(u => u.split(':').slice(0, 2).join(':'))).toEqual(['transportation_rates:t1', 'b2b_transport_packages:p1'])
    expect(updates[1]).toContain('"capacity_min":13')
  })
})

describe('one form for vehicle prices', () => {
  it('the transportation form and the package form render the shared table; sizes are not typed', () => {
    for (const f of ['app/rates/transportation/transportation-content.tsx', 'app/b2b/pricing-rules/page.tsx']) {
      expect(readFileSync(f, 'utf8')).toContain('<VehicleRatesTable')
    }
    const table = readFileSync('components/rates/VehicleRatesTable.tsx', 'utf8')
    expect(table).not.toContain('capacity_min: e.target.value')
    expect(readFileSync('app/b2b/pricing-rules/page.tsx', 'utf8')).not.toContain('sedan_rate')
  })

  it('the package routes write the list through the transportation rule, not the five columns', () => {
    for (const f of ['app/api/b2b/transport-packages/route.ts', 'app/api/b2b/transport-packages/[id]/route.ts']) {
      const src = readFileSync(f, 'utf8')
      expect(src).toContain('resolveVehicleWrite')
      expect(src).not.toContain('sedan_rate')
    }
  })

  it('a vehicle size changed in Settings reaches the stored rates', () => {
    expect(readFileSync('app/api/vocabulary/[id]/route.ts', 'utf8')).toContain('restampVehicleBands(supabase, orgId)')
  })
})

describe('meals on a cruise', () => {
  it('read "Included on board"', () => {
    expect(readFileSync('lib/auto-pricing-service.ts', 'utf8')).toContain("return 'Included on board'")
  })
})
