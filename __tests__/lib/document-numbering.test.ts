import { describe, it, expect, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({}),
}))

import { nextDocumentNumber, insertWithUniqueRetry } from '@/lib/document-numbering'

/**
 * Builds a minimal stub of the SupabaseClient surface our helper actually
 * touches: rpc(name, args) -> { data, error } and the from().select().like().order().limit() chain.
 */
function makeStub(opts: {
  rpc?: { data?: any; error?: any }
  scanRows?: any[]
  scanError?: any
}) {
  return {
    rpc: vi.fn(async (_name: string, _args: any) => ({
      data: opts.rpc?.data ?? null,
      error: opts.rpc?.error ?? null,
    })),
    from: vi.fn(() => ({
      select: () => ({
        like: () => ({
          order: () => ({
            limit: async () => ({
              data: opts.scanRows ?? [],
              error: opts.scanError ?? null,
            }),
          }),
        }),
      }),
    })),
  } as any
}

describe('nextDocumentNumber', () => {
  it('uses the sequence value when the RPC succeeds (1-padded to 3 digits)', async () => {
    const supabase = makeStub({ rpc: { data: 42 } })
    const n = await nextDocumentNumber({ supabase, prefix: 'EXP', sequenceName: 'expense_number_seq', table: 'expenses', column: 'expense_number', year: 2026 })
    expect(n).toBe('EXP-2026-042')
  })

  it('accepts a legitimate sequence value of 0 (M19 truthiness bug)', async () => {
    const supabase = makeStub({ rpc: { data: 0 } })
    const n = await nextDocumentNumber({ supabase, prefix: 'INV', sequenceName: 'invoice_number_seq', table: 'invoices', column: 'invoice_number', year: 2026 })
    expect(n).toBe('INV-2026-000')
  })

  it('falls back to year-scoped MAX when the RPC errors', async () => {
    const supabase = makeStub({
      rpc: { error: { message: 'sequence missing' } },
      scanRows: [{ expense_number: 'EXP-2026-007' }],
    })
    const n = await nextDocumentNumber({ supabase, prefix: 'EXP', sequenceName: 'expense_number_seq', table: 'expenses', column: 'expense_number', year: 2026 })
    expect(n).toBe('EXP-2026-008')
  })

  it('falls back to 001 when no rows exist for the year (no longer hardcoded)', async () => {
    const supabase = makeStub({ rpc: { error: { message: 'x' } }, scanRows: [] })
    const n = await nextDocumentNumber({ supabase, prefix: 'EXP', sequenceName: 'expense_number_seq', table: 'expenses', column: 'expense_number', year: 2027 })
    expect(n).toBe('EXP-2027-001')
  })

  it('parses the numeric portion even when a suffix is present (INV-2026-005-DEP)', async () => {
    const supabase = makeStub({
      rpc: { error: { message: 'x' } },
      scanRows: [{ invoice_number: 'INV-2026-005-DEP' }],
    })
    const n = await nextDocumentNumber({ supabase, prefix: 'INV', sequenceName: 'invoice_number_seq', table: 'invoices', column: 'invoice_number', year: 2026 })
    expect(n).toBe('INV-2026-006')
  })

  it('throws when both the sequence and the fallback scan fail', async () => {
    const supabase = makeStub({
      rpc: { error: { message: 'rpc-down' } },
      scanError: { message: 'db-down' },
    })
    await expect(nextDocumentNumber({ supabase, prefix: 'SI', sequenceName: 'supplier_invoice_number_seq', table: 'supplier_invoices', column: 'internal_reference', year: 2026 })).rejects.toThrow(/Failed to generate SI number/)
  })
})

describe('insertWithUniqueRetry', () => {
  it('returns the first successful insert', async () => {
    const result = await insertWithUniqueRetry({
      generateRow: async () => ({ id: 1 }),
      insert: async () => ({ data: { id: 1 }, error: null }),
    })
    expect(result).toEqual({ data: { id: 1 }, error: null })
  })

  it('retries on 23505 unique_violation and regenerates the row each time', async () => {
    let attempt = 0
    const result = await insertWithUniqueRetry({
      generateRow: async () => ({ n: ++attempt }),
      insert: async (row: any) => {
        if (row.n < 3) return { data: null, error: { code: '23505', message: 'unique_violation' } }
        return { data: { n: row.n }, error: null }
      },
      maxAttempts: 5,
    })
    expect(result.data).toEqual({ n: 3 })
    expect(attempt).toBe(3)
  })

  it('does NOT retry on non-unique errors (returns the error immediately)', async () => {
    let calls = 0
    const result = await insertWithUniqueRetry({
      generateRow: async () => { calls++; return {} },
      insert: async () => ({ data: null, error: { code: '23502', message: 'not_null_violation' } }),
    })
    expect(result.error.code).toBe('23502')
    expect(calls).toBe(1)
  })

  it('gives up after maxAttempts and returns the last error', async () => {
    const result = await insertWithUniqueRetry({
      generateRow: async () => ({}),
      insert: async () => ({ data: null, error: { code: '23505', message: 'unique_violation' } }),
      maxAttempts: 2,
    })
    expect(result.data).toBeNull()
    expect(result.error.code).toBe('23505')
  })
})
