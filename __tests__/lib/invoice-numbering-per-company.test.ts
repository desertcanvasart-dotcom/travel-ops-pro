// Invoice numbers are each company's own series (migration 20261225, pinned on
// Postgres in __tests__/migrations/invoice-receipt-numbers-per-company.test.ts).
// This is the application side: the counter function when it exists, and when
// it is missing (or the old nextval helper never was) the company's own highest
// number read as a number — never the install-wide sequence and never another
// company's invoices.
import { describe, it, expect, vi } from 'vitest'
import { nextDocumentNumber } from '@/lib/document-numbering'

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))

/** A client whose invoices table holds `rows`, answering only for the org asked about. */
function client(opts: { rpc?: { data?: unknown; error?: { code?: string; message?: string } | null }; rows: Array<{ org_id: string; invoice_number: string }> }) {
  const rpc = vi.fn(async (_fn: string, _args: unknown) => ({ data: opts.rpc?.data ?? null, error: opts.rpc?.error ?? null }))
  const scanned: string[] = []
  const from = vi.fn(() => {
    let org = ''
    let like = ''
    const b: any = {
      select: () => b,
      eq: (_c: string, v: string) => { org = v; scanned.push(v); return b },
      like: (_c: string, v: string) => { like = v.replace('%', ''); return b },
      order: () => b,
      range: async (f: number, t: number) => ({
        data: opts.rows.filter(r => r.org_id === org && r.invoice_number.startsWith(like)).slice(f, t + 1),
        error: null,
      }),
    }
    return b
  })
  return { supabase: { rpc, from } as any, rpc, from, scanned }
}

const args = (supabase: unknown, orgId = 'org-a') => ({
  supabase: supabase as never, prefix: 'INV', sequenceName: 'invoice_number_seq', table: 'invoices', column: 'invoice_number',
  orgId, counterRpc: 'next_invoice_number', year: 2026,
})

describe('invoice numbers per company', () => {
  it("draws the next number from the company's counter, with the company and year", async () => {
    const c = client({ rpc: { data: 'INV-2026-007' }, rows: [] })
    expect(await nextDocumentNumber(args(c.supabase))).toBe('INV-2026-007')
    expect(c.rpc).toHaveBeenCalledWith('next_invoice_number', { p_org: 'org-a', p_year: 2026 })
    // the shared sequence is not asked
    expect(c.rpc).not.toHaveBeenCalledWith('nextval', expect.anything())
  })

  it('two companies each start at 001 and 002 of their own', async () => {
    const rows = [{ org_id: 'org-b', invoice_number: 'INV-2026-001' }, { org_id: 'org-b', invoice_number: 'INV-2026-002' }, { org_id: 'org-b', invoice_number: 'INV-2026-003' }]
    const missing = { code: 'PGRST202', message: 'Could not find the function' }
    const a = client({ rpc: { error: missing }, rows })
    // A has none of its own: the other company's volume is invisible to it.
    expect(await nextDocumentNumber(args(a.supabase, 'org-a'))).toBe('INV-2026-001')
    expect(a.scanned).toEqual(['org-a'])
    const b = client({ rpc: { error: missing }, rows })
    expect(await nextDocumentNumber(args(b.supabase, 'org-b'))).toBe('INV-2026-004')
  })

  it('works when the counter function (and the old nextval helper) are missing: the 1,000th follows the 999th', async () => {
    const rows = [
      { org_id: 'org-a', invoice_number: 'INV-2026-999' },
      { org_id: 'org-a', invoice_number: 'INV-2026-998-DEP' },
      { org_id: 'org-a', invoice_number: 'INV-2026-100' },
      { org_id: 'org-b', invoice_number: 'INV-2026-5000' },
      { org_id: 'org-a', invoice_number: 'INV-2025-9999' },
    ]
    for (const error of [{ code: 'PGRST202', message: 'missing' }, { code: '42883', message: 'missing' }]) {
      const c = client({ rpc: { error }, rows })
      expect(await nextDocumentNumber(args(c.supabase))).toBe('INV-2026-1000')
    }
  })

  it('a real error from the counter is raised, not hidden behind a guess', async () => {
    const c = client({ rpc: { error: { code: '42501', message: 'permission denied' } }, rows: [] })
    await expect(nextDocumentNumber(args(c.supabase))).rejects.toThrow(/permission denied/)
  })

  it('the invoice route asks for the company’s counter', async () => {
    const { readFileSync } = await import('node:fs')
    const route = readFileSync('app/api/invoices/route.ts', 'utf8')
    expect(route).toContain("counterRpc: 'next_invoice_number'")
    expect(route).toContain('orgId,')
  })
})
