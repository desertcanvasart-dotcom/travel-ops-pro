// One identity, many workspaces: the role gate and the data scope must pick
// the SAME membership, or an admin in one agency who is a viewer in another
// can switch to the second and clear every admin-only gate there. The rule
// is a pure function (lib/auth/active-org.ts); this pins the rule and pins
// that both callers actually use it.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACTIVE_ORG_COOKIE, pickActiveMembership } from '@/lib/auth/active-org'

const first = { org_id: 'org-first', role: 'admin' }
const second = { org_id: 'org-second', role: 'viewer' }
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
