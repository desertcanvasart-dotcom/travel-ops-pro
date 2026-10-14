// Settings audit (2026-10-14), finding 15: the vocabulary write gate read
// getAuthenticatedUser().role — an arbitrary one of the person's memberships —
// so an admin of one company who is an agent in the other could add, hide,
// reorder, delete and RESET the other company's lists (and the reverse refused
// a real admin). Every write now asks requireRole(['admin']), which reads the
// role in the company the request is acting in.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const writes: string[] = []
function builder() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b, order: () => b, eq: () => b, in: () => b, limit: () => b,
    insert: () => { writes.push('insert'); return b },
    update: () => { writes.push('update'); return b },
    delete: () => { writes.push('delete'); return b },
    single: async () => ({ data: { id: 'v1' }, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (r: (v: unknown) => void) => r({ data: [], error: null }),
  }
  return b
}
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => ({ from: builder, rpc: async () => ({ data: null, error: null }) }) }))

// The stale role: admin in the OTHER company. It must not matter.
vi.mock('@/lib/supabase-secure', () => ({
  getAuthenticatedUser: async () => ({ user: { id: 'me', role: 'admin' }, error: null }),
}))
let activeRole = 'agent'
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentUserId: async () => 'me',
  getCurrentOrgId: async () => 'org-active',
  getCurrentUserRole: async () => activeRole,
  requireRole: async (allowed: string[]) =>
    activeRole === 'owner' || allowed.includes(activeRole)
      ? null
      : new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
}))

import * as list from '@/app/api/vocabulary/route'
import * as item from '@/app/api/vocabulary/[id]/route'
import * as reorder from '@/app/api/vocabulary/reorder/route'
import * as reset from '@/app/api/vocabulary/reset/route'

const req = (method: string, body: unknown) => new NextRequest('http://x', { method, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: 'v1' }) }

beforeEach(() => {
  writes.length = 0
  activeRole = 'agent'
})

describe('vocabulary writes are gated on the role in the active company', () => {
  it('an agent here (admin elsewhere) is refused every write, with the vocabulary message', async () => {
    const results = [
      await list.POST(req('POST', { kind: 'tier', label: 'Gold' })),
      await item.PATCH(req('PATCH', { label: 'x' }), params),
      await item.DELETE(req('DELETE', {}), params),
      await reorder.POST(req('POST', { kind: 'tier', ids: ['v1'] })),
      await reset.POST(req('POST', { kind: 'tier' })),
    ]
    for (const res of results) {
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe(list.WRITE_DENIED)
    }
    expect(writes).toEqual([])
  })

  it('reads stay open to any member', async () => {
    expect((await list.GET()).status).toBe(200)
  })

  it('an admin (or the owner) of the active company gets past the gate', async () => {
    for (const role of ['admin', 'owner']) {
      activeRole = role
      const res = await list.POST(req('POST', { kind: 'tier', label: 'Gold' }))
      expect(res.status).toBe(201)
    }
  })

  it('no vocabulary route gates on getAuthenticatedUser().role any more', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('app/api/vocabulary/route.ts', 'utf8')
    expect(src).not.toMatch(/from '@\/lib\/supabase-secure'/)
    expect(src).toMatch(/requireRole\(\['admin'\]\)/)
  })
})
