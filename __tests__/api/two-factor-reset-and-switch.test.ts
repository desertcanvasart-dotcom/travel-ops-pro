// Resetting a colleague's two-factor (DELETE /api/organization/members/[userId]/two-factor)
// and the company's "require two-factor" switch (PUT /api/organization).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const S = vi.hoisted(() => ({
  caller: 'owner-1',
  members: [] as Array<{ org_id: string; user_id: string; role: string }>,
  factors: { 'u-mgr': [{ id: 'f1' }, { id: 'f2' }] } as Record<string, Array<{ id: string }>>,
  deleted: [] as string[],
  callerFactors: [] as Array<{ status: string }>,
  orgUpdate: null as null | Record<string, unknown>,
}))

vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1',
  getCurrentUserId: async () => S.caller,
  noOrgResponse: () => new Response(JSON.stringify({ error: 'no org' }), { status: 401 }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: S.caller, factors: S.callerFactors } } }) } }),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { mfa: {
      listFactors: async ({ userId }: { userId: string }) => ({ data: { factors: S.factors[userId] ?? [] }, error: null }),
      deleteFactor: async ({ id }: { id: string }) => { S.deleted.push(id); return { data: null, error: null } },
    } } },
    from(table: string) {
      const q: any = {
        _rows: table === 'organization_members' ? S.members : [],
        select: () => q, eq: () => q, in: () => q,
        update: (patch: Record<string, unknown>) => { S.orgUpdate = patch; return q },
        maybeSingle: async () => ({ data: table === 'organization_members' ? S.members.find(m => m.user_id === S.caller) ?? null : null, error: null }),
        single: async () => ({ data: { id: 'org-1', ...(S.orgUpdate ?? {}) }, error: null }),
        then: (r: any) => r({ data: q._rows, error: null }),
      }
      return q
    },
  }),
}))

import { DELETE } from '@/app/api/organization/members/[userId]/two-factor/route'
import { PUT } from '@/app/api/organization/route'

const reset = (userId: string) => DELETE(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ userId }) })
const team = (callerRole: string, targetRole: string, extra: Array<{ org_id: string; user_id: string; role: string }> = []) => [
  { org_id: 'org-1', user_id: S.caller, role: callerRole },
  { org_id: 'org-1', user_id: 'u-mgr', role: targetRole },
  ...extra,
]

beforeEach(() => { S.caller = 'owner-1'; S.deleted = []; S.callerFactors = []; S.orgUpdate = null })

describe('reset a colleague\'s two-factor', () => {
  it('the owner removes every device on a manager\'s login', async () => {
    S.members = team('owner', 'manager')
    const res = await reset('u-mgr')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, data: { removed: 2 } })
    expect(S.deleted).toEqual(['f1', 'f2'])
  })

  it('an admin resets a manager but not another admin; never their own', async () => {
    S.caller = 'admin-1'
    S.members = team('admin', 'manager')
    expect((await reset('u-mgr')).status).toBe(200)
    S.deleted = []
    S.members = team('admin', 'admin')
    expect((await reset('u-mgr')).status).toBe(403)
    expect((await reset('admin-1')).status).toBe(400)
    expect(S.deleted).toEqual([])
  })

  it('a login that also belongs to another company is refused', async () => {
    S.members = team('owner', 'manager', [{ org_id: 'org-2', user_id: 'u-mgr', role: 'agent' }])
    expect((await reset('u-mgr')).status).toBe(409)
    expect(S.deleted).toEqual([])
  })

  it('someone outside the company is not found', async () => {
    S.members = [{ org_id: 'org-1', user_id: 'owner-1', role: 'owner' }]
    expect((await reset('u-mgr')).status).toBe(404)
  })
})

describe('the company switch', () => {
  const put = (body: unknown) => PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }) as never)

  it('the owner cannot require two-factor before setting up their own', async () => {
    S.members = [{ org_id: 'org-1', user_id: 'owner-1', role: 'owner' }]
    const res = await put({ require_two_factor: true })
    expect(res.status).toBe(409)
    expect(S.orgUpdate).toBeNull()
  })

  it('with their own device set up, the owner switches it on — and off again freely', async () => {
    S.members = [{ org_id: 'org-1', user_id: 'owner-1', role: 'owner' }]
    S.callerFactors = [{ status: 'verified' }]
    expect((await put({ require_two_factor: true })).status).toBe(200)
    expect(S.orgUpdate).toMatchObject({ require_two_factor: true })
    S.callerFactors = []
    expect((await put({ require_two_factor: false })).status).toBe(200)
    expect(S.orgUpdate).toMatchObject({ require_two_factor: false })
  })

  it('an admin cannot change it', async () => {
    S.caller = 'admin-1'
    S.members = [{ org_id: 'org-1', user_id: 'admin-1', role: 'admin' }]
    S.callerFactors = [{ status: 'verified' }]
    expect((await put({ require_two_factor: true })).status).toBe(403)
  })
})
