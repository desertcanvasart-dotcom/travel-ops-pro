// Switching workspace must be reachable by everyone who can have two.
//
// The route lives at /api/organizations/mine, and '/api/organizations/mine'
// starts with '/api/organization' — the admin-only prefix. middleware.ts picks
// its rule with .find(), so the FIRST matching prefix wins: without a more
// specific entry ahead of it, a manager, agent or viewer in two agencies is
// told they are not allowed to list or change their own workspace, and the
// second membership stays as unreachable as it was before it existed.
//
// Ordering is invisible in a diff — an entry added alphabetically, or the list
// tidied, breaks this with nothing to show for it. Hence a test.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORG_ROLES } from '@/lib/auth/roles'

const middleware = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8')

describe('/api/organizations/mine', () => {
  it('has its own rule', () => {
    expect(middleware).toContain("'/api/organizations/mine'")
  })

  it('is listed BEFORE the admin-only /api/organization prefix', () => {
    const mine = middleware.indexOf("'/api/organizations/mine'")
    const org = middleware.indexOf("{ prefix: '/api/organization',")
    expect(mine).toBeGreaterThan(-1)
    expect(org).toBeGreaterThan(-1)
    expect(
      mine < org,
      'the specific rule must come first — .find() takes the first match, so /api/organization would gate workspace switching to admins',
    ).toBe(true)
  })

  it('admits every role, because any of them can belong to two agencies', () => {
    // Read the rule's own role list rather than restating it.
    const at = middleware.indexOf("'/api/organizations/mine'")
    const rule = middleware.slice(at, middleware.indexOf('}', at))
    for (const role of ORG_ROLES) {
      expect(rule.includes(`'${role}'`), `${role} cannot reach their own workspace list`).toBe(true)
    }
  })
})
