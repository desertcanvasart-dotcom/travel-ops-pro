// The supplier CSV import matches a row to this company's supplier by
// supplier_code first, then (no code in the row) by name, and UPDATES the
// match. It used to match by name only and never update: a renamed
// supplier's row previewed "ready" and then failed at commit on
// UNIQUE(org_id, supplier_code) as a bare "Could not insert". Every clash is
// now in the preview. The sheet also carries the commission and a guide's
// languages, which export → delete → re-import used to lose.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Papa from 'papaparse'
import { setMockTables, createMockClient } from '../_mock-supabase'
import {
  planSupplierImport, prepareSupplierRows, supplierCsvHeaders, supplierCsvRow, SUPPLIER_CSV_COLUMNS,
  type SupplierCsvRow,
} from '@/lib/suppliers/import-csv'

vi.mock('@/lib/supabase-actor', () => ({ createActorAdminClient: () => createMockClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return { getCurrentOrgId: async () => 'org-a', noOrgResponse: () => NextResponse.json({}, { status: 403 }) }
})
vi.mock('@/lib/vocabulary-server', () => ({ supplierTypesForCurrentOrg: async () => [] }))

import { POST } from '@/app/api/suppliers/import/route'

const parse = (csv: string) => Papa.parse<SupplierCsvRow>(csv, {
  header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, '_'),
})
const plan = (csv: string, existing: { id: string; name: string; supplier_code?: string; type?: string }[]) => {
  const p = parse(csv)
  const prepared = prepareSupplierRows(p.data)
  return { prepared, plan: planSupplierImport(prepared.ready, existing, new Set(p.meta.fields ?? [])) }
}

const ROSTER = [
  { id: 's1', name: 'Nile Palace', supplier_code: 'SUP-0001', type: 'hotel' },
  { id: 's2', name: 'Sam', supplier_code: 'SUP-0002', type: 'guide' },
]

describe('planSupplierImport', () => {
  it('matches by code first: a renamed supplier is updated, not inserted', () => {
    const { plan: p } = plan('name,supplier_code,roles,city\nNile Palace Hotel,SUP-0001,hotel,Luxor\n', ROSTER)
    expect(p.toInsert).toEqual([])
    expect(p.toUpdate).toEqual([expect.objectContaining({ id: 's1', matchedBy: 'code', patch: expect.objectContaining({ name: 'Nile Palace Hotel', city: 'Luxor', type: 'hotel' }) })])
    expect(p.toUpdate[0].patch).not.toHaveProperty('supplier_code')
  })

  it('then by name, when the row has no code', () => {
    const { plan: p } = plan('name,roles\nsam,guide\n', ROSTER)
    expect(p.toUpdate).toEqual([expect.objectContaining({ id: 's2', matchedBy: 'name' })])
  })

  it('a new name with a new code is added', () => {
    const { plan: p } = plan('name,supplier_code,roles\nAswan Boats,SUP-0099,transport\n', ROSTER)
    expect(p.toInsert.map(r => r.name)).toEqual(['Aswan Boats'])
  })

  it('reports clashes in the preview', () => {
    const { prepared, plan: p } = plan(
      'name,supplier_code,roles\n' +
      'Sam,SUP-0050,guide\n' +          // Sam is on file as SUP-0002
      'Sam,SUP-0001,guide\n',           // the same name again: a row error before matching
      ROSTER,
    )
    expect(p.toInsert).toEqual([])
    expect(p.toUpdate).toEqual([])
    expect(p.clashes.map(c => c.line)).toEqual([2])
    expect(prepared.errors.map(e => e.line)).toEqual([3])
    expect(p.clashes[0].message).toMatch(/already on file as SUP-0002; the file gives SUP-0050/)
  })

  it('a name two suppliers share needs the code', () => {
    const { plan: p } = plan('name,roles\nSam,guide\n', [...ROSTER, { id: 's3', name: 'Sam', supplier_code: 'SUP-0003' }])
    expect(p.clashes[0].message).toMatch(/2 suppliers are named "Sam"/)
  })

  it('renaming onto another supplier’s name is a clash', () => {
    const { plan: p } = plan('name,supplier_code,roles\nSam,SUP-0001,hotel\n', ROSTER)
    expect(p.clashes[0].message).toMatch(/Code SUP-0001 belongs to "Nile Palace", but "Sam"/)
  })

  it('the same code twice in one file is a row error', () => {
    const { prepared } = plan('name,supplier_code,roles\nA,SUP-0100,hotel\nB,sup-0100,hotel\n', [])
    expect(prepared.errors).toEqual([{ line: 3, name: 'B', message: 'Supplier code sup-0100 is also on line 2' }])
  })

  it('an update writes only the columns the file carries', () => {
    const { plan: p } = plan('name,roles\nSam,guide\n', ROSTER)
    expect(Object.keys(p.toUpdate[0].patch).sort()).toEqual(['name', 'type', 'types'])
  })
})

describe('commission and languages travel with the supplier', () => {
  it('export → re-import carries them', () => {
    const supplier = { name: 'Karim', types: ['guide'], supplier_code: 'SUP-0007', status: 'active', default_commission_rate: 12.5, commission_type: 'payable', languages: ['japanese', 'english'] }
    const csv = Papa.unparse({ fields: supplierCsvHeaders(), data: [SUPPLIER_CSV_COLUMNS.map(c => supplierCsvRow(supplier)[c.name])] })
    const [row] = prepareSupplierRows(parse(csv).data, new Set(['guide'])).ready
    expect(row.row).toMatchObject({ default_commission_rate: 12.5, commission_type: 'payable', languages: ['japanese', 'english'] })
  })

  it('a commission outside 0–100 is a row error', () => {
    const out = prepareSupplierRows(parse('name,roles,default_commission_rate\nX,shop,150\n').data, new Set(['shop']))
    expect(out.errors[0].message).toMatch(/0 to 100/)
  })
})

describe('POST /api/suppliers/import', () => {
  beforeEach(() => {
    setMockTables({ suppliers: [
      { id: 's1', org_id: 'org-a', name: 'Nile Palace', supplier_code: 'SUP-0001', type: 'hotel', types: ['hotel'] },
      { id: 's2', org_id: 'org-a', name: 'Sam', supplier_code: 'SUP-0002', type: 'guide', types: ['guide'] },
    ] })
  })
  const post = async (csvData: string, dryRun: boolean) =>
    (await POST({ json: async () => ({ csvData, dryRun }) } as never)).json()

  it('a code clash is in the dry-run preview, and the commit does what the preview said', async () => {
    const csv = 'name,supplier_code,roles\nSam,SUP-0050,guide\nNile Palace Hotel,SUP-0001,hotel\nNew Co,,shop\n'
    const preview = await post(csv, true)
    expect(preview.errors.map((e: any) => e.line)).toEqual([2])
    expect(preview.updates.map((u: any) => u.name)).toEqual(['Nile Palace Hotel'])
    expect(preview.ready).toBe(1)

    const done = await post(csv, false)
    expect([done.inserted, done.updated, done.insertErrors]).toEqual([1, 1, []])
    const rows = ((await (createMockClient().from('suppliers') as any).select('*')).data ?? []) as any[]
    expect(rows.find(r => r.id === 's1').name).toBe('Nile Palace Hotel')
    expect(rows.find(r => r.id === 's2').supplier_code).toBe('SUP-0002')
  })
})
