// Phase 2 of the portable supplier_code work: the code has to travel through
// the rate CSV so a rate re-attaches to its supplier across installs. These
// tests pin the two mechanics that make that safe:
//   1. every supplier-bearing rate config carries a supplier_code column
//      (virtual — resolved to supplier_id on import, never stored);
//   2. batchResolveSuppliers resolves a row by its code, flags an unknown code,
//      and lets the code win over supplier_id / supplier_name.
import { describe, it, expect } from 'vitest'
import { RATE_TABLE_CONFIGS } from '@/lib/bulk-rate-service'
import { batchResolveSuppliers } from '@/lib/suppliers/resolve-supplier'

describe('supplier_code is a column on every supplier-bearing rate config', () => {
  it('sits right after supplier_id, importable and optional', () => {
    for (const [table, cfg] of Object.entries(RATE_TABLE_CONFIGS)) {
      const sid = cfg.columns.findIndex(c => c.name === 'supplier_id')
      const code = cfg.columns.find(c => c.name === 'supplier_code')
      if (sid < 0) {
        // A config with no supplier (fixed_daily_costs) must not get the column.
        expect(code, `${table} has no supplier_id, so no supplier_code`).toBeUndefined()
        continue
      }
      expect(code, `${table} is missing supplier_code`).toBeDefined()
      expect(code!.required, `${table} supplier_code must be optional`).toBe(false)
      expect(code!.exportOnly ?? false, `${table} supplier_code must be importable`).toBe(false)
      expect(cfg.columns[sid + 1].name, `${table} supplier_code should follow supplier_id`).toBe('supplier_code')
    }
  })
})

// A fake suppliers table: one with a code, one whose code differs only in case.
const SUPPLIERS = [
  { id: 'aaaa1111-0000-0000-0000-000000000001', name: 'Nile Cruises Co', supplier_code: 'SUP-0001' },
  { id: 'bbbb2222-0000-0000-0000-000000000002', name: 'Cairo Guides', supplier_code: 'SUP-0002' },
]
const fakeSupabase = {
  from() {
    return { select: async () => ({ data: SUPPLIERS, error: null }) }
  },
} as any

describe('batchResolveSuppliers — resolve by supplier_code', () => {
  it('maps a known code to its supplier id (case-insensitively)', async () => {
    const res = await batchResolveSuppliers(
      [{ supplier_code: 'SUP-0001' }, { supplier_code: 'sup-0002' }],
      fakeSupabase,
    )
    expect(res.resolvedIdByCode.get('sup-0001')).toBe(SUPPLIERS[0].id)
    expect(res.resolvedIdByCode.get('sup-0002')).toBe(SUPPLIERS[1].id)
    expect(res.unknownCodes.size).toBe(0)
  })

  it('flags a code that matches no supplier here', async () => {
    const res = await batchResolveSuppliers([{ supplier_code: 'SIB-999' }], fakeSupabase)
    expect(res.unknownCodes.has('sib-999')).toBe(true)
    expect(res.resolvedIdByCode.size).toBe(0)
  })

  it('lets the code win: a row with both a code and a mismatched name resolves by code', async () => {
    const res = await batchResolveSuppliers(
      [{ supplier_code: 'SUP-0001', supplier_name: 'A Totally Different Name' }],
      fakeSupabase,
    )
    // Resolved by code, and the (unknown) name is never even consulted.
    expect(res.resolvedIdByCode.get('sup-0001')).toBe(SUPPLIERS[0].id)
    expect(res.noMatchNames.size).toBe(0)
  })

  it('still resolves by name when no code is given (unchanged behaviour)', async () => {
    const res = await batchResolveSuppliers([{ supplier_name: 'Cairo Guides' }], fakeSupabase)
    expect(res.resolvedIdByName.get('cairo guides')).toBe(SUPPLIERS[1].id)
  })
})
