// Sweep H8: the generate-documents counter was module-level, so overlapping
// requests skipped or repeated numbers. Each batch now owns its numberer.
// 20261216: numbers are per company — drawn from next_supplier_document_number
// for the caller's org, or (before that migration) counted on from the org's
// OWN highest number, never another company's.
import { describe, it, expect } from 'vitest'
import { createDocumentNumberer } from '@/lib/documents/numberer'

type Row = { org_id: string; document_number: string }

/** supplier_documents as the numberer reads it, with no counter function. */
function db(rows: Row[]) {
  let reads = 0
  const client = {
    from: () => {
      let pattern = ''
      let org: string | null = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        eq: (c: string, v: string) => { if (c === 'org_id') org = v; return b },
        like: (_c: string, p: string) => { pattern = p; return b },
        order: () => b,
        limit: async () => {
          reads++
          const prefix = pattern.replace(/%$/, '')
          const mine = rows
            .filter(r => (org === null || r.org_id === org) && r.document_number.startsWith(prefix))
            .sort((a, b) => b.document_number.localeCompare(a.document_number))
          return { data: mine.slice(0, 1) }
        },
      }
      return b
    },
    // The migration has not run: PostgREST knows no such function.
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'function not found' } }),
  }
  return { client, reads: () => reads }
}
const prefix = (t: string) => ({ transport_voucher: 'TV', guide_assignment: 'GA', hotel_voucher: 'HV' } as Record<string, string>)[t] ?? 'SD'

describe('createDocumentNumberer', () => {
  it('counts on from the highest number, per type, reading each type once', async () => {
    const d = db([{ org_id: 'A', document_number: 'TV-2026-0007' }])
    const next = createDocumentNumberer(d.client, prefix, 'A', 2026)
    expect(await next('transport_voucher')).toBe('TV-2026-0008')
    expect(await next('guide_assignment')).toBe('GA-2026-0001')
    expect(await next('transport_voucher')).toBe('TV-2026-0009')
    expect(d.reads()).toBe(2)
  })
  it('two overlapping batches do not disturb each other', async () => {
    const d = db([{ org_id: 'A', document_number: 'TV-2026-0007' }])
    const a = createDocumentNumberer(d.client, prefix, 'A', 2026)
    const b = createDocumentNumberer(d.client, prefix, 'A', 2026)
    expect(await a('transport_voucher')).toBe('TV-2026-0008')
    expect(await b('transport_voucher')).toBe('TV-2026-0008') // same start: the insert retry resolves the clash
    expect(await a('transport_voucher')).toBe('TV-2026-0009') // not bumped by b
  })
})

describe('numbers are per company', () => {
  it("company B's numbering ignores company A's highest number", async () => {
    const d = db([
      { org_id: 'A', document_number: 'HV-2026-0041' },
      { org_id: 'B', document_number: 'HV-2026-0003' },
    ])
    expect(await createDocumentNumberer(d.client, prefix, 'B', 2026)('hotel_voucher')).toBe('HV-2026-0004')
    expect(await createDocumentNumberer(d.client, prefix, 'A', 2026)('hotel_voucher')).toBe('HV-2026-0042')
  })

  it("draws from the company's counter when the migration has run", async () => {
    const calls: unknown[] = []
    const client = {
      from: () => { throw new Error('no table read when the counter answers') },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args])
        return { data: `${args.p_prefix}-${args.p_year}-0005`, error: null }
      },
    }
    expect(await createDocumentNumberer(client, prefix, 'B', 2026)('hotel_voucher')).toBe('HV-2026-0005')
    expect(calls).toEqual([['next_supplier_document_number', { p_org: 'B', p_prefix: 'HV', p_year: 2026 }]])
  })

  it('a counter failure is an error, not a guess', async () => {
    const client = {
      from: () => { throw new Error('unused') },
      rpc: async () => ({ data: null, error: { code: '57014', message: 'canceling statement' } }),
    }
    await expect(createDocumentNumberer(client, prefix, 'B', 2026)('hotel_voucher')).rejects.toThrow(/canceling/)
  })
})
