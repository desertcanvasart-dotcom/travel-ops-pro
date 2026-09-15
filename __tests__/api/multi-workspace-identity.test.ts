// ============================================
// One identity, many workspaces
// ============================================
// organization_members is keyed (org_id, user_id), so belonging to two
// agencies was always representable. The SESSION could not say which one a
// request meant: getCurrentOrgId took whichever membership was oldest, so a
// second membership was invisible and everything filed under it unreachable.
// That is the deferred G1 gate, and it is why the invitation route refused any
// email the project had ever seen — the operator hit exactly that on a
// sandbox where they were the only member.
//
// Two properties matter here and they pull against each other:
//
//   SAFETY   the active-workspace cookie must never grant access to an org
//            you are not a member of. It selects among memberships you hold;
//            it is not a claim to hold one. Anyone can edit a cookie.
//   INERTIA  ~147 callers resolve their org through this one function. A
//            single-workspace user must see no behavioural change whatsoever.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ALICE = 'aaaa1111-0000-0000-0000-00000000000a'
const ORG_ATS = 'org-ats'
const ORG_NILE = 'org-nile'
const ORG_STRANGER = 'org-stranger'

// Memberships: Alice is in two workspaces, ATS first.
const MEMBERSHIPS = [
  { org_id: ORG_ATS, user_id: ALICE, role: 'manager', created_at: '2026-01-01T00:00:00Z', organizations: { name: 'ATS Japan' } },
  { org_id: ORG_NILE, user_id: ALICE, role: 'owner', created_at: '2026-06-01T00:00:00Z', organizations: { name: 'Nile Tours' } },
]

let cookieValue: string | undefined

vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({ get: (n: string) => (n === 'active_org_id' && cookieValue ? { value: cookieValue } : undefined) }),
}))

// The session is Alice; the header path is skipped above so this is the source.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: ALICE } } }) } }),
}))

/** A stand-in organization_members that answers the two shapes the resolver
 *  uses: "is this pair a member" and "the oldest membership". */
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== 'organization_members') throw new Error(`unexpected table ${table}`)
      const filters: Record<string, string> = {}
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: string) => { filters[col] = val; return chain },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          const hits = MEMBERSHIPS.filter(m =>
            Object.entries(filters).every(([k, v]) => (m as any)[k] === v))
          return { data: hits[0] ?? null }
        },
        then: (resolve: (v: unknown) => void) => {
          const hits = MEMBERSHIPS.filter(m =>
            Object.entries(filters).every(([k, v]) => (m as any)[k] === v))
          return Promise.resolve({ data: hits }).then(resolve)
        },
      }
      return chain
    },
  }),
}))

vi.mock('@/lib/auth/verified-user-header', () => ({
  VERIFIED_USER_HEADER: 'x-verified-user',
  verifyVerifiedUserHeader: async () => null,
}))

import { getCurrentOrgId, getMyOrganizations } from '@/lib/auth/current-org'

beforeEach(() => { cookieValue = undefined })

describe('the active-workspace cookie is a preference, never a claim', () => {
  it('is IGNORED for an org the person does not belong to', async () => {
    // THE security property. A cookie is client-controlled; if this returned
    // ORG_STRANGER, every one of the ~147 callers would scope its reads and
    // its inserts to another company's data.
    cookieValue = ORG_STRANGER
    expect(await getCurrentOrgId()).toBe(ORG_ATS)
  })

  it('is ignored when it is not an org id at all', async () => {
    for (const junk of ['', '../../etc', 'null', 'undefined']) {
      cookieValue = junk
      expect(await getCurrentOrgId()).toBe(ORG_ATS)
    }
  })

  it('is honoured for a workspace the person IS in', async () => {
    cookieValue = ORG_NILE
    expect(await getCurrentOrgId()).toBe(ORG_NILE)
  })
})

describe('a user who has only ever had one workspace', () => {
  it('resolves exactly as before — no cookie, oldest membership', async () => {
    // The inertia property: 147 callers must not notice this change.
    expect(await getCurrentOrgId()).toBe(ORG_ATS)
  })
})

describe('getMyOrganizations', () => {
  it('lists every workspace, oldest first, with its own role', async () => {
    const orgs = await getMyOrganizations()
    expect(orgs.map(o => o.org_id)).toEqual([ORG_ATS, ORG_NILE])
    expect(orgs.map(o => o.name)).toEqual(['ATS Japan', 'Nile Tours'])
    // The role is PER WORKSPACE: a manager at one agency may own another.
    expect(orgs.map(o => o.role)).toEqual(['manager', 'owner'])
  })

  it('marks which one the request is acting in, and only one', async () => {
    cookieValue = ORG_NILE
    const orgs = await getMyOrganizations()
    expect(orgs.filter(o => o.active).map(o => o.org_id)).toEqual([ORG_NILE])
  })

  it('falls back to marking the oldest when nothing is chosen', async () => {
    const orgs = await getMyOrganizations()
    expect(orgs.filter(o => o.active).map(o => o.org_id)).toEqual([ORG_ATS])
  })
})
