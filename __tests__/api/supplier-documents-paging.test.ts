// The supplier voucher list had no paging: GET /api/supplier-documents read
// every voucher of the company at once (cut short by the server's row cap),
// and the page filtered them in the browser. It is now a page of 50, newest
// first, with an exact count, and Newer / Older on the list.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { SUPPLIER_DOCUMENT_PAGE_SIZE, pageRange, supplierDocumentPage } from '@/lib/documents/supplier-document-page'

const db = vi.hoisted(() => {
  const log: { table: string; ops: { op: string; args: unknown[] }[] }[] = []
  const state = { rows: [] as unknown[], count: 0 as number | null }
  function chain(table: string) {
    const entry = { table, ops: [] as { op: string; args: unknown[] }[] }
    log.push(entry)
    const proxy: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: any) => resolve({ data: state.rows, error: null, count: state.count })
        return (...args: unknown[]) => { entry.ops.push({ op: prop, args }); return proxy }
      },
    })
    return proxy
  }
  return { log, state, client: { from: (t: string) => chain(t) } }
})

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => db.client }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-A',
  getCurrentUserId: async () => 'user-1',
  noOrgResponse: () => new Response(null, { status: 403 }),
}))
vi.mock('@/lib/documents/supplier-document-stats', () => ({ supplierDocumentStats: async () => ({ total: 120 }) }))

import { GET } from '@/app/api/supplier-documents/route'

const list = async (qs = '') => (await GET(new Request(`http://x/api/supplier-documents${qs}`) as never)).json()
const listOps = () => db.log.find(e => e.table === 'supplier_documents')!.ops

beforeEach(() => {
  db.log.length = 0
  db.state.rows = [{ id: 'd1' }]
  db.state.count = 120
})

describe('page arithmetic', () => {
  it('50 to a page, from 1; anything else is page 1', () => {
    expect(SUPPLIER_DOCUMENT_PAGE_SIZE).toBe(50)
    expect(pageRange(1)).toEqual([0, 49])
    expect(pageRange(3)).toEqual([100, 149])
    expect(supplierDocumentPage('2')).toBe(2)
    for (const v of [null, '', '0', '-1', 'abc']) expect(supplierDocumentPage(v)).toBe(1)
  })
})

describe('GET /api/supplier-documents', () => {
  it('reads one page with an exact count, newest first in a stable order', async () => {
    const body = await list()
    const ops = listOps()
    expect(ops.find(o => o.op === 'select')!.args[1]).toEqual({ count: 'exact' })
    expect(ops.filter(o => o.op === 'order').map(o => o.args)).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(ops.find(o => o.op === 'range')!.args).toEqual([0, 49])
    expect(body).toMatchObject({ success: true, total: 120, page: 1, pageSize: 50, data: [{ id: 'd1' }] })
  })

  it('?page=3 reads rows 100–149, after the filters', async () => {
    await list('?page=3&status=sent&search=Cairo')
    const ops = listOps()
    expect(ops.find(o => o.op === 'range')!.args).toEqual([100, 149])
    const rangeAt = ops.findIndex(o => o.op === 'range')
    expect(ops.findIndex(o => o.op === 'eq' && o.args[0] === 'status')).toBeLessThan(rangeAt)
    expect(ops.findIndex(o => o.op === 'or')).toBeLessThan(rangeAt)
  })

  it('the total falls back to the rows read when no count comes back', async () => {
    db.state.count = null
    expect((await list()).total).toBe(1)
  })
})

describe('the list page', () => {
  const page = readFileSync('app/documents/supplier/page.tsx', 'utf8')
  it('asks for a page, searches on the server, and has Newer / Older', () => {
    expect(page).toContain("params.append('page', String(page))")
    expect(page).toContain("if (search) params.append('search', search)")
    expect(page).toContain("t('newer')")
    expect(page).toContain("t('older')")
    expect(page).toContain("t('showingRange', { first, last, total })")
  })
})
