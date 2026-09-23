// Sweep H12: /api/profiles/[id] took the caller's FIRST membership and never
// asked whether the target was in the same workspace, so an admin anywhere
// could deactivate or delete any account — the owner's included — and the
// delete guard read the profile mirror, which only refused 'admin'.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let caller = { id: 'u-admin', role: 'admin', orgId: 'org-a' }
/** memberships: `${org}:${user}` → role */
let members: Record<string, string> = {}
const writes: { table: string; op: string; vals?: unknown }[] = []
const deleteUser = vi.fn(async () => ({}))

function builder(table: string) {
  const f: Record<string, unknown> = {}
  let op = 'select'
  let vals: unknown
  let neqOrg: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b,
    update: (v: unknown) => { op = 'update'; vals = v; return b },
    delete: () => { op = 'delete'; return b },
    eq: (k: string, v: unknown) => { f[k] = v; return b },
    neq: (_k: string, v: string) => { neqOrg = v; return b },
    single: () => b.maybeSingle(),
    maybeSingle: async () => {
      if (op !== 'select') { writes.push({ table, op, vals }); return { data: { id: f.id }, error: null } }
      if (table === 'organization_members') {
        const role = members[`${f.org_id}:${f.user_id}`]
        return { data: role ? { role } : null, error: null }
      }
      return { data: { id: f.id }, error: null }
    },
    then: (resolve: (v: unknown) => void) => {
      if (op !== 'select') { writes.push({ table, op, vals }); return resolve({ error: null }) }
      // count of the target's memberships outside the caller's org
      const count = Object.keys(members).filter(k => k.endsWith(`:${f.user_id}`) && !k.startsWith(`${neqOrg}:`)).length
      return resolve({ count, error: null })
    },
  }
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: builder, auth: { admin: { deleteUser: (...a: unknown[]) => deleteUser(...(a as [])) } } }),
}))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentUserId: async () => caller.id,
  getCurrentUserRole: async () => caller.role,
  getCurrentOrgId: async () => caller.orgId,
}))

import { PUT, DELETE, GET } from '@/app/api/profiles/[id]/route'

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const put = (id: string, body: unknown) =>
  PUT(new NextRequest(`http://x/api/profiles/${id}`, { method: 'PUT', body: JSON.stringify(body) }), ctx(id))
const del = (id: string) => DELETE(new NextRequest(`http://x/api/profiles/${id}`, { method: 'DELETE' }), ctx(id))

beforeEach(() => {
  caller = { id: 'u-admin', role: 'admin', orgId: 'org-a' }
  members = {
    'org-a:u-admin': 'admin',
    'org-a:u-owner': 'owner',
    'org-a:u-admin2': 'admin',
    'org-a:u-agent': 'agent',
    'org-b:u-stranger': 'agent',
  }
  writes.length = 0
  deleteUser.mockClear()
})

describe('PUT /api/profiles/[id]', () => {
  it('an admin cannot deactivate the owner', async () => {
    expect((await put('u-owner', { is_active: false })).status).toBe(403)
    expect(writes).toEqual([])
  })
  it('an admin cannot deactivate another admin; the owner can', async () => {
    expect((await put('u-admin2', { is_active: false })).status).toBe(403)
    caller = { id: 'u-owner', role: 'owner', orgId: 'org-a' }
    expect((await put('u-admin2', { is_active: false })).status).toBe(200)
  })
  it('nobody in another workspace can be touched', async () => {
    expect((await put('u-stranger', { is_active: false })).status).toBe(404)
    expect(writes).toEqual([])
  })
  it('an admin cannot change their own role or active flag', async () => {
    expect((await put('u-admin', { is_active: false })).status).toBe(403)
  })
  it('an admin still manages an agent, and the role lands on THIS workspace membership', async () => {
    expect((await put('u-agent', { role: 'manager' })).status).toBe(200)
    expect(writes.find(w => w.table === 'organization_members')?.vals).toEqual({ role: 'manager' })
  })
  it('anyone can still edit their own name', async () => {
    caller = { id: 'u-agent', role: 'agent', orgId: 'org-a' }
    expect((await put('u-agent', { full_name: 'A' })).status).toBe(200)
  })
})

describe('DELETE /api/profiles/[id]', () => {
  it('the owner cannot be deleted', async () => {
    expect((await del('u-owner')).status).toBe(403)
    expect(deleteUser).not.toHaveBeenCalled()
  })
  it('a member of another workspace cannot be deleted', async () => {
    expect((await del('u-stranger')).status).toBe(404)
    expect(deleteUser).not.toHaveBeenCalled()
  })
  it('someone who also belongs elsewhere is not deleted globally', async () => {
    members['org-b:u-agent'] = 'agent'
    expect((await del('u-agent')).status).toBe(409)
    expect(deleteUser).not.toHaveBeenCalled()
  })
  it('an admin can delete an agent of this workspace', async () => {
    expect((await del('u-agent')).status).toBe(200)
    expect(deleteUser).toHaveBeenCalledWith('u-agent')
  })
})

describe('GET /api/profiles/[id]', () => {
  it('does not read profiles from another workspace', async () => {
    expect((await GET(new NextRequest('http://x'), ctx('u-stranger'))).status).toBe(404)
  })
})
