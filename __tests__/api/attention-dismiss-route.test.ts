// POST / DELETE /api/dashboard/attention/dismiss: staff only, scoped to the
// caller's organisation, and a dismissal is one row per item (upsert).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: { upserts: any[]; deletes: Array<Record<string, unknown>> } = { upserts: [], deletes: [] }
let role = 'agent'

vi.mock('@/lib/auth/current-org', () => ({
  requireRole: async (allowed: string[]) => allowed.includes(role) ? null : new Response(null, { status: 403 }),
}))
vi.mock('@/lib/auth/org-auth', () => ({
  orgAuth: async () => ({
    error: null, status: 200, org_id: 'org-1', user: { id: 'u1' },
    supabase: {
      from: () => {
        const filters: Record<string, unknown> = {}
        const q: any = {
          upsert: async (row: any, opts: any) => { calls.upserts.push({ row, opts }); return { error: null } },
          delete: () => q,
          eq: (k: string, v: unknown) => { filters[k] = v; return q },
          then: (r: any) => { calls.deletes.push({ ...filters }); return r({ error: null }) },
        }
        return q
      },
    },
  }),
}))

import { POST, DELETE } from '@/app/api/dashboard/attention/dismiss/route'

const req = (method: string, body: unknown) => new Request('http://x', { method, body: JSON.stringify(body) }) as never

beforeEach(() => { calls.upserts = []; calls.deletes = []; role = 'agent' })

describe('dismiss', () => {
  it('stores the item for the organisation, once per item', async () => {
    const res = await POST(req('POST', { key: 'balance_due:b1', fingerprint: '[]' }))
    expect(res.status).toBe(200)
    expect(calls.upserts[0].row).toMatchObject({ org_id: 'org-1', item_key: 'balance_due:b1', fingerprint: '[]', dismissed_by: 'u1' })
    expect(calls.upserts[0].opts).toEqual({ onConflict: 'org_id,item_key' })
  })
  it('refuses a missing or oversized key', async () => {
    expect((await POST(req('POST', { fingerprint: '[]' }))).status).toBe(400)
    expect((await POST(req('POST', { key: 'x'.repeat(501), fingerprint: '[]' }))).status).toBe(400)
    expect(calls.upserts).toEqual([])
  })
  it('a viewer cannot change the office’s list', async () => {
    role = 'viewer'
    expect((await POST(req('POST', { key: 'k', fingerprint: '' }))).status).toBe(403)
    expect((await DELETE(req('DELETE', { key: 'k' }))).status).toBe(403)
    expect(calls.upserts).toEqual([])
    expect(calls.deletes).toEqual([])
  })
})

describe('undo', () => {
  it('removes only this organisation’s dismissal of the item', async () => {
    expect((await DELETE(req('DELETE', { key: 'balance_due:b1' }))).status).toBe(200)
    expect(calls.deletes[0]).toEqual({ org_id: 'org-1', item_key: 'balance_due:b1' })
  })
})
