// Bulk rate CSV: the preview and the commit agree.
//
// The dry run answered success with invalidRows > 0 and the dialog offered
// "Import N Rows" (N = the valid ones); on confirm the server refused the
// WHOLE file and wrote nothing — a sheet with 140 good rows and one unknown
// supplier code imported nothing. Two checks (vehicle bands, money values)
// also ran only at commit, so a sheet the preview passed could still be
// refused. Now every row check runs before the preview, and the commit
// imports exactly the valid rows and names the skipped ones.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
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
  vocabularyItemsForCurrentOrg: vi.fn(async () => []),
  supplierTypesForCurrentOrg: vi.fn(async () => []),
}))
vi.mock('@/lib/i18n/server-messages', () => ({
  getServerLocale: vi.fn(async () => 'en'),
  lookupServerMessage: vi.fn((_l: string, key: string) => key),
}))

import { POST } from '@/app/api/rates/bulk/import/route'

const CSV = [
  'service_code,attraction_name,city,eur_rate,supplier_code,rate_valid_from,rate_valid_to,is_active',
  'ENT-KARNAK,Karnak Temple,Luxor,450,SUP-0001,2026-01-01,2026-12-31,TRUE',
  'ENT-LUXOR,Luxor Temple,Luxor,400,,2026-01-01,2026-12-31,TRUE',
  'ENT-GHOST,Nowhere,Luxor,100,SUP-9999,2026-01-01,2026-12-31,TRUE',
  'ENT-NEG,Valley,Luxor,-5,,2026-01-01,2026-12-31,TRUE',
].join('\n')

const post = async (dryRun: boolean) =>
  (await POST({ json: async () => ({ table: 'entrance_fees', csvData: CSV, dryRun }) } as any)).json()

beforeEach(() => {
  setMockTables({ suppliers: [{ id: 'sup-1', org_id: 'org-1', name: 'SCA', supplier_code: 'SUP-0001' }], entrance_fees: [] })
})

describe('bulk import: preview and commit agree', () => {
  it('the preview names every bad row, including the money check', async () => {
    const preview = await post(true)
    expect(preview.success).toBe(true)
    expect([preview.validRows, preview.invalidRows]).toEqual([2, 2])
    const flagged = JSON.stringify(preview.errors)
    expect(flagged).toContain('supplierCodeNotFound')
    expect(preview.errors.some((e: any) => e.row === 5)).toBe(true)
  })

  it('the commit imports the valid rows and reports the skipped ones', async () => {
    const done = await post(false)
    expect(done.success).toBe(true)
    expect([done.inserted, done.skipped]).toEqual([2, 2])
    expect(done.skippedErrors.map((e: any) => e.row).sort()).toEqual([4, 5])
    const rows = ((await (createMockClient().from('entrance_fees') as any).select('*')).data ?? []) as any[]
    expect(rows.map(r => r.service_code).sort()).toEqual(['ENT-KARNAK', 'ENT-LUXOR'])
    expect(rows.find(r => r.service_code === 'ENT-KARNAK').supplier_id).toBe('sup-1')
  })
})
