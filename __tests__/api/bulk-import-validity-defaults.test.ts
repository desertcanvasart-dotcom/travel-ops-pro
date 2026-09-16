// A sheet row with no validity dates must import. transportation_rates and
// entrance_fees store rate_valid_from/to NOT NULL with no default, the sheet
// marks them optional, and a batch upsert sends a blank cell as NULL — so on
// 2026-09-16 a 143-row transport sheet imported nothing. New rows now get the
// Add form's defaults; a row already in the table keeps its own dates; tables
// where blank dates are allowed are left alone.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A tiny fake of the service client: the existing rows a select sees, and the
// batches the route upserts.
const state = vi.hoisted(() => ({ existing: {} as Record<string, any[]>, upserted: [] as any[] }))
vi.mock('@/lib/supabase-server', () => {
  const query = (rows: any[]) => {
    const q: any = { select: () => q, in: () => q, eq: () => q, ilike: () => q, or: () => q, limit: () => q,
      then: (ok: any, bad: any) => Promise.resolve({ data: rows, error: null }).then(ok, bad) }
    return q
  }
  const client = {
    from: (table: string) => ({
      ...query(state.existing[table] ?? []),
      upsert: async (batch: any[]) => { state.upserted.push(...batch); return { error: null } },
    }),
  }
  return { createServerClient: () => client }
})
vi.mock('@/lib/vocabulary-server', () => ({
  vocabularyItemsForCurrentOrg: vi.fn(async () => []),
  supplierTypesForCurrentOrg: vi.fn(async () => []),
}))
vi.mock('@/lib/i18n/server-messages', () => ({
  getServerLocale: vi.fn(async () => 'en'),
  lookupServerMessage: vi.fn((_l: string, key: string) => key),
}))

import { POST } from '@/app/api/rates/bulk/import/route'

const SHEETS = {
  transportation_rates: {
    header: 'service_code,service_type,city,destination_city,hiace_rate_eur,hiace_capacity_min,hiace_capacity_max,rate_valid_from,rate_valid_to,rate_currency,is_active',
    row: (from = '', to = '') => `LUXOR-TO-ESNA,intercity,Luxor,Esna,4687,1,5,${from},${to},EGP,TRUE`,
    code: 'LUXOR-TO-ESNA',
  },
  entrance_fees: {
    header: 'service_code,attraction_name,city,eur_rate,rate_valid_from,rate_valid_to,rate_currency,is_active',
    row: (from = '', to = '') => `ENT-KARNAK,Karnak Temple,Luxor,450,${from},${to},EGP,TRUE`,
    code: 'ENT-KARNAK',
  },
} as const
type Table = keyof typeof SHEETS

const importCsv = async (table: string, csv: string) =>
  (await POST({ json: async () => ({ table, csvData: csv }) } as any)).json()
const sheet = (t: Table, from?: string, to?: string) => `${SHEETS[t].header}\n${SHEETS[t].row(from, to)}\n`

beforeEach(() => {
  state.existing = {}
  state.upserted = []
  // One fixed instant for the route and the assertion alike.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-16T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe.each(Object.keys(SHEETS) as Table[])('bulk import %s: blank validity dates', table => {
  it('a new row with no dates gets today → open-ended', async () => {
    const json = await importCsv(table, sheet(table))
    expect(json.success).toBe(true)
    expect(state.upserted).toHaveLength(1)
    expect([state.upserted[0].rate_valid_from, state.upserted[0].rate_valid_to]).toEqual(['2026-09-16', '2099-12-31'])
  })

  it('dates in the sheet win', async () => {
    await importCsv(table, sheet(table, '2026-10-01', '2027-09-30'))
    expect([state.upserted[0].rate_valid_from, state.upserted[0].rate_valid_to]).toEqual(['2026-10-01', '2027-09-30'])
  })

  it('an existing row keeps its own dates when the sheet leaves them blank', async () => {
    state.existing[table] = [{ service_code: SHEETS[table].code, rate_valid_from: '2026-01-01', rate_valid_to: '2026-12-31' }]
    await importCsv(table, sheet(table))
    expect([state.upserted[0].rate_valid_from, state.upserted[0].rate_valid_to]).toEqual(['2026-01-01', '2026-12-31'])
  })
})

describe('tables where blank dates are allowed', () => {
  it('accommodation_rates: blank dates stay blank', async () => {
    const csv = 'service_code,property_name,city,rate_valid_from,rate_valid_to,is_active\nHTL-OLD-CATARACT,Old Cataract,Aswan,,,TRUE\n'
    const json = await importCsv('accommodation_rates', csv)
    expect(json.success).toBe(true)
    expect(state.upserted).toHaveLength(1)
    expect(state.upserted[0].rate_valid_from).toBeUndefined()
    expect(state.upserted[0].rate_valid_to).toBeUndefined()
  })
})
