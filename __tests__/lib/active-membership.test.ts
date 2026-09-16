// One identity, many workspaces: the role gate and the data scope must pick
// the SAME membership, or an admin in one agency who is a viewer in another
// can switch to the second and clear every admin-only gate there. The rule
// is a pure function (lib/auth/active-org.ts); this pins the rule and pins
// that both callers actually use it.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACTIVE_ORG_COOKIE, byOldestMembership, pickActiveMembership } from '@/lib/auth/active-org'

const first = { org_id: 'org-first', role: 'admin', created_at: '2026-01-01T00:00:00Z' }
const second = { org_id: 'org-second', role: 'viewer', created_at: '2026-06-01T00:00:00Z' }
const oldestFirst = [first, second]

describe('pickActiveMembership', () => {
  it('honours the cookie where the membership is real', () => {
    expect(pickActiveMembership(oldestFirst, 'org-second')).toBe(second)
  })

  it('returns the role IN THAT workspace, not the oldest one', () => {
    expect(pickActiveMembership(oldestFirst, 'org-second')?.role).toBe('viewer')
  })

  it('falls back to the oldest membership with no cookie', () => {
    expect(pickActiveMembership(oldestFirst, undefined)).toBe(first)
    expect(pickActiveMembership(oldestFirst, null)).toBe(first)
    expect(pickActiveMembership(oldestFirst, '')).toBe(first)
  })

  it('ignores a cookie naming a workspace the person is not in — it is a preference, not a claim', () => {
    expect(pickActiveMembership(oldestFirst, 'org-somebody-elses')).toBe(first)
  })

  it('is null for a person with no membership at all', () => {
    expect(pickActiveMembership([], 'org-first')).toBeNull()
  })
})

describe('both callers apply the one rule', () => {
  const middleware = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8')
  const currentOrg = readFileSync(join(process.cwd(), 'lib/auth/current-org.ts'), 'utf8')

  it('middleware resolves the role through pickActiveMembership with the active-org cookie', () => {
    const at = middleware.indexOf('const membershipRole = async')
    expect(at).toBeGreaterThan(-1)
    const block = middleware.slice(at, middleware.indexOf('return membershipRolePromise', at))
    expect(block, 'the role gate must pick the membership for the ACTIVE workspace').toContain('pickActiveMembership(')
    expect(block).toContain('ACTIVE_ORG_COOKIE')
    expect(block, 'limit(1) on the oldest membership is the bug this test exists for').not.toContain('.limit(1)')
  })

  it('getCurrentOrgId resolves the workspace through the same rule', () => {
    const at = currentOrg.indexOf('export async function getCurrentOrgId')
    const block = currentOrg.slice(at, currentOrg.indexOf('\n}\n', at))
    expect(block).toContain('pickActiveMembership(')
  })

  it('the cookie name is shared, not retyped', () => {
    expect(ACTIVE_ORG_COOKIE).toBe('active_org_id')
    expect(middleware).not.toContain("'active_org_id'")
    expect(currentOrg).not.toContain("'active_org_id'")
  })
})

describe('memberships created in the same transaction', () => {
  // created_at is not unique — a script or an accept flow that writes two
  // memberships in one transaction gives them the same timestamp to the
  // microsecond. SQL may then return equal rows in either order, and
  // middleware and getCurrentOrgId() issue SEPARATE queries: one could
  // authorise with an admin role while the other scoped the request to the
  // workspace where the person is only a viewer.
  const sameInstant = '2026-03-01T12:00:00Z'
  const adminSomewhere = { org_id: 'org-bbb', role: 'admin', created_at: sameInstant }
  const viewerElsewhere = { org_id: 'org-aaa', role: 'viewer', created_at: sameInstant }

  it('picks the same membership whichever order the rows arrive in', () => {
    const one = pickActiveMembership([adminSomewhere, viewerElsewhere], null)
    const other = pickActiveMembership([viewerElsewhere, adminSomewhere], null)
    expect(one).toEqual(other)
  })

  it('breaks the tie on org_id, so the choice is a property of the data', () => {
    expect(pickActiveMembership([adminSomewhere, viewerElsewhere], null)?.org_id).toBe('org-aaa')
  })

  it('still prefers the older membership when the timestamps differ', () => {
    expect(pickActiveMembership([second, first], null)).toBe(first)
  })

  it('sorts oldest first regardless of the order given', () => {
    expect([second, first].sort(byOldestMembership).map(m => m.org_id)).toEqual(['org-first', 'org-second'])
  })

  it('treats a missing timestamp as the oldest rather than throwing', () => {
    const noDate = { org_id: 'org-zzz', role: 'admin' }
    expect(pickActiveMembership([first, noDate], null)).toBe(noDate)
  })
})

describe('both queries order the same way', () => {
  const middleware = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8')
  const currentOrg = readFileSync(join(process.cwd(), 'lib/auth/current-org.ts'), 'utf8')

  // Belt and braces: the rule sorts its own input, so these cannot actually
  // diverge any more — but a membership list the switcher SHOWS in an
  // unstable order is its own small bug.
  for (const [name, src] of [['middleware.ts', middleware], ['lib/auth/current-org.ts', currentOrg]] as const) {
    it(`${name} breaks the created_at tie in SQL too`, () => {
      const orders = src.match(/\.order\('created_at'[^)]*\)\s*\n\s*\.order\('org_id'/g) ?? []
      const createdAtOrders = src.match(/\.order\('created_at'/g) ?? []
      expect(orders.length, 'every created_at ordering needs the org_id tie-break after it').toBe(createdAtOrders.length)
    })
  }
})
