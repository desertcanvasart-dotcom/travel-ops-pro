import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

// Route-level guard for POST /api/rates/trains and /api/rates/sleeping-trains.
//
// THE INCIDENT (2026-08-31 and 2026-09-02, prod): the create routes deduped on
// (origin, destination, class-or-cabin, supplier) and UPDATED the match. That
// key had no train and no validity period, so recording the Talgo price for
// Cairo→Qena replaced the ENR price, and recording the VIP Train price replaced
// the Talgo one. Thirteen "create" requests produced zero inserts. The row
// count never moved, so to the operator the prices simply "vanished".
//
// Two rules, each pinned below for BOTH tables:
//   1. A different train, or a different validity period, on the same route
//      is a NEW row. The existing row's price is untouched.
//   2. An exact full-key duplicate is a 409 carrying the existing row — the
//      create route never updates anything.

vi.mock('@/lib/supabase-actor', async () => {
  const mock = await import('../_mock-supabase')
  return { createActorAdminClient: () => mock.createMockClient() }
})

// The resolver's propertyId path: a given id is the train, with its name.
vi.mock('@/lib/suppliers/resolve-property', () => ({
  resolveRateProperty: vi.fn(async (_client: unknown, opts: { propertyId?: string | null }) =>
    opts.propertyId
      ? { property_id: opts.propertyId, name: opts.propertyId === 'prop-talgo' ? 'Talgo' : 'VIP Train' }
      : { property_id: null }
  ),
}))

vi.mock('@/lib/suppliers/operator-name', () => ({
  operatorNameForSupplier: vi.fn(async (_client: unknown, supplierId: string | null | undefined, fallback?: string | null) =>
    supplierId ? 'Egyptian National Railways (ENR)' : (fallback ?? null)
  ),
}))

import { POST as postTrain } from '@/app/api/rates/trains/route'
import { POST as postSleeper } from '@/app/api/rates/sleeping-trains/route'

const ENR = 'sup-enr'

function makeRequest(body: Record<string, unknown>) {
  return { json: async () => body } as any
}

async function call(handler: (req: any) => Promise<Response>, body: Record<string, unknown>) {
  const res = await handler(makeRequest(body))
  return { status: res.status, json: await res.json() }
}

// The mock has no raw-table accessor; read back through an unfiltered query.
async function rows(table: string): Promise<any[]> {
  const { data } = await (createMockClient().from(table) as any).select('*')
  return data ?? []
}

// Exactly the row the Talgo price lived in before the VIP Train price was
// created over it (rate_audit_log, record 1e992a7e, 2026-09-02 01:35:07).
const TALGO_QENA = {
  id: 'row-talgo-qena', service_code: 'TRN-GVXXCU',
  origin_city: 'Cairo', destination_city: 'Qena', class_type: 'First Class',
  rate_eur: 90, rate_currency: 'USD',
  supplier_id: ENR, property_id: 'prop-talgo', operator_name: 'Egyptian National Railways (ENR)',
  rate_valid_from: '2026-08-31', rate_valid_to: '2027-08-31', is_active: true,
}

const WATANIA = 'sup-watania'
const WATANIA_SINGLE = {
  id: 'row-watania-single', service_code: 'SLP-A',
  origin_city: 'Giza', destination_city: 'Luxor', cabin_type: 'single',
  rate_oneway_eur: 120, supplier_id: WATANIA, property_id: 'prop-nile-express',
  operator_name: 'Watania Sleeping Trains',
  rate_valid_from: '2026-09-01', rate_valid_to: '2027-08-31', is_active: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  setMockTables({
    train_rates: [structuredClone(TALGO_QENA)],
    sleeping_train_rates: [structuredClone(WATANIA_SINGLE)],
  })
})

describe('POST /api/rates/trains — the natural key is the full identity of a rate', () => {
  it('a second TRAIN on the same route inserts; the first train keeps its price (the incident)', async () => {
    const { status, json } = await call(postTrain, {
      origin_city: 'Cairo', destination_city: 'Qena', class_type: 'First Class',
      rate_eur: 65, supplier_id: ENR, property_id: 'prop-vip',
      rate_valid_from: '2026-08-31', rate_valid_to: '2027-08-31',
    })

    expect(status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.updated).toBe(false)

    const all = await rows('train_rates')
    expect(all).toHaveLength(2)
    expect(all.find((r) => r.id === 'row-talgo-qena').rate_eur).toBe(90)
    expect(all.find((r) => r.id === 'row-talgo-qena').property_id).toBe('prop-talgo')
    expect(all.find((r) => r.property_id === 'prop-vip').rate_eur).toBe(65)
  })

  it('the same train for a different validity period inserts (next season is a new row)', async () => {
    const { status } = await call(postTrain, {
      origin_city: 'Cairo', destination_city: 'Qena', class_type: 'First Class',
      rate_eur: 95, supplier_id: ENR, property_id: 'prop-talgo',
      rate_valid_from: '2027-09-01', rate_valid_to: '2028-08-31',
    })

    expect(status).toBe(201)
    const all = await rows('train_rates')
    expect(all).toHaveLength(2)
    expect(all.find((r) => r.id === 'row-talgo-qena').rate_eur).toBe(90)
  })

  it('an exact duplicate is a 409 that names the existing row, and updates nothing', async () => {
    const { status, json } = await call(postTrain, {
      origin_city: 'cairo', destination_city: 'QENA', class_type: 'First Class',
      rate_eur: 999, supplier_id: ENR, property_id: 'prop-talgo',
      rate_valid_from: '2026-08-31', rate_valid_to: '2027-08-31',
    })

    expect(status).toBe(409)
    expect(json.success).toBe(false)
    expect(json.existing?.id).toBe('row-talgo-qena')
    expect(json.error).toContain('Talgo')
    expect(json.error).toContain('Cairo')
    expect(json.error).toContain('2026-08-31')

    const all = await rows('train_rates')
    expect(all).toHaveLength(1)
    expect(all[0].rate_eur).toBe(90)
  })

  it('a rate with no train named is its own identity, distinct from one with a train', async () => {
    const { status } = await call(postTrain, {
      origin_city: 'Cairo', destination_city: 'Qena', class_type: 'First Class',
      rate_eur: 70, supplier_id: ENR, property_id: null,
      rate_valid_from: '2026-08-31', rate_valid_to: '2027-08-31',
    })
    expect(status).toBe(201)
    expect(await rows('train_rates')).toHaveLength(2)
  })
})

describe('POST /api/rates/sleeping-trains — same rules, same key shape', () => {
  it('a second train on the same route and cabin inserts; the first keeps its price', async () => {
    const { status, json } = await call(postSleeper, {
      origin_city: 'Giza', destination_city: 'Luxor', cabin_type: 'single',
      rate_oneway_eur: 140, supplier_id: WATANIA, property_id: 'prop-other-train',
      rate_valid_from: '2026-09-01', rate_valid_to: '2027-08-31',
    })

    expect(status).toBe(201)
    expect(json.updated).toBe(false)
    const all = await rows('sleeping_train_rates')
    expect(all).toHaveLength(2)
    expect(all.find((r) => r.id === 'row-watania-single').rate_oneway_eur).toBe(120)
  })

  it('a different validity period inserts', async () => {
    const { status } = await call(postSleeper, {
      origin_city: 'Giza', destination_city: 'Luxor', cabin_type: 'single',
      rate_oneway_eur: 150, supplier_id: WATANIA, property_id: 'prop-nile-express',
      rate_valid_from: '2027-09-01', rate_valid_to: '2028-08-31',
    })
    expect(status).toBe(201)
    expect(await rows('sleeping_train_rates')).toHaveLength(2)
  })

  it('an exact duplicate is a 409 and updates nothing', async () => {
    const { status, json } = await call(postSleeper, {
      origin_city: 'Giza', destination_city: 'Luxor', cabin_type: 'single',
      rate_oneway_eur: 999, supplier_id: WATANIA, property_id: 'prop-nile-express',
      rate_valid_from: '2026-09-01', rate_valid_to: '2027-08-31',
    })

    expect(status).toBe(409)
    expect(json.existing?.id).toBe('row-watania-single')
    const all = await rows('sleeping_train_rates')
    expect(all).toHaveLength(1)
    expect(all[0].rate_oneway_eur).toBe(120)
  })
})

describe('the create routes contain no update path at all', () => {
  // The bug class is "a create that updates". Pin it at the source level so
  // a future refactor cannot quietly bring the branch back.
  it('neither route calls .update() on its own table', async () => {
    const fs = await import('node:fs')
    for (const f of ['app/api/rates/trains/route.ts', 'app/api/rates/sleeping-trains/route.ts']) {
      const src = fs.readFileSync(f, 'utf8')
      const postBody = src.slice(src.indexOf('export async function POST'))
      expect(postBody, `${f} POST must not update`).not.toMatch(/\.update\(/)
      expect(postBody).toContain('whereNullable(existingQuery, \'property_id\'')
      expect(postBody).toContain('whereNullable(existingQuery, \'rate_valid_from\'')
    }
  })
})
