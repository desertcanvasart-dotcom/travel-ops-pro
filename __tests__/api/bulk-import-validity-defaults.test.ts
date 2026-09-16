// A sheet row with no validity dates must import. transportation_rates and
// entrance_fees store rate_valid_from/to NOT NULL with no default, the sheet
// marks them optional, and a batch upsert sends a blank cell as NULL — so on
// 2026-09-16 a 143-row transport sheet imported nothing. New rows now get the
// Add form's defaults; a row already in the table keeps its own dates.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// A tiny fake of the service client: the existing rows a select sees, and the
// batches the route upserts.
const state = vi.hoisted(() => ({ existing: [] as any[], upserted: [] as any[] }))
vi.mock('@/lib/supabase-server', () => {
  const query = (rows: any[]) => {
    const q: any = { select: () => q, in: () => q, eq: () => q, ilike: () => q, or: () => q, limit: () => q,
      then: (ok: any, bad: any) => Promise.resolve({ data: rows, error: null }).then(ok, bad) }
    return q
  }
  const client = {
    from: (table: string) => ({
      ...query(table === 'transportation_rates' ? state.existing : []),
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

const HEADER = 'service_code,service_type,city,destination_city,hiace_rate_eur,hiace_capacity_min,hiace_capacity_max,rate_valid_from,rate_valid_to,rate_currency,is_active'
const importCsv = async (csv: string) =>
  (await POST({ json: async () => ({ table: 'transportation_rates', csvData: csv }) } as any)).json()
const rows = async () => state.upserted

beforeEach(() => { state.existing = []; state.upserted = [] })

describe('bulk import: blank validity dates', () => {
  it('a new row with no dates gets today → open-ended', async () => {
    const json = await importCsv(`${HEADER}\nLUXOR-TO-ESNA,intercity,Luxor,Esna,4687,1,5,,,EGP,TRUE\n`)
    expect(json.success).toBe(true)
    const [row] = await rows()
    expect(row.rate_valid_from).toBe(new Date().toISOString().slice(0, 10))
    expect(row.rate_valid_to).toBe('2099-12-31')
  })

  it('dates in the sheet win', async () => {
    await importCsv(`${HEADER}\nLUXOR-TO-ESNA,intercity,Luxor,Esna,4687,1,5,2026-10-01,2027-09-30,EGP,TRUE\n`)
    const [row] = await rows()
    expect([row.rate_valid_from, row.rate_valid_to]).toEqual(['2026-10-01', '2027-09-30'])
  })

  it('an existing row keeps its own dates when the sheet leaves them blank', async () => {
    state.existing = [{ service_code: 'LUXOR-TO-ESNA', rate_valid_from: '2026-01-01', rate_valid_to: '2026-12-31' }]
    await importCsv(`${HEADER}\nLUXOR-TO-ESNA,intercity,Luxor,Esna,5000,1,5,,,EGP,TRUE\n`)
    const row = (await rows()).find(r => r.service_code === 'LUXOR-TO-ESNA')
    expect([row.rate_valid_from, row.rate_valid_to]).toEqual(['2026-01-01', '2026-12-31'])
  })
})
