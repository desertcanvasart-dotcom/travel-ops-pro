// ============================================
// The stored inbox is staff-only, and hidden threads are the owner's
// ============================================
// Middleware role-gates PAGES, not /api/* — so while /inbox was
// admin/manager/agent, the APIs beneath it served every stored email body to
// ANY authenticated account, viewer included. And what those tables hold is
// the operator's connected Gmail: after the scoping fix that is
// correspondence, but before it (and in the hidden backlog) it was their
// whole mailbox — live 2FA codes included.
//
// Source-level pin, in the style of dashboard-org-scope.test.ts: cheap, and
// it fails the moment somebody removes a gate or adds an ungated read.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const READ_ROUTES = [
  'app/api/email/conversations/route.ts',
  'app/api/email/messages/route.ts',
  'app/api/unified/conversations/route.ts',
]

describe('stored-mail read routes', () => {
  for (const route of READ_ROUTES) {
    const src = readFileSync(join(process.cwd(), route), 'utf8')

    it(`${route} role-gates its GET like the /inbox page`, () => {
      // The gate must sit inside GET, before any query runs. Match the exact
      // roles the page allows — drift between page and API is how this
      // happened the first time.
      const get = src.slice(src.indexOf('export async function GET'))
      const gateAt = get.indexOf("requireRole(['admin', 'manager', 'agent'])")
      const queryAt = get.indexOf('.from(')
      expect(gateAt, `${route}: GET does not call requireRole`).toBeGreaterThan(-1)
      expect(gateAt, `${route}: the gate must run before the first query`).toBeLessThan(queryAt)
    })
  }

  it('include_hidden reveals only the session user’s own hidden threads', () => {
    const src = readFileSync(join(process.cwd(), READ_ROUTES[0]), 'utf8')
    // The or-filter that scopes hidden rows to the owner. If this line goes,
    // include_hidden=true once again hands any staff account the operator's
    // hidden personal mail — which on this install is 136 threads.
    expect(src).toContain('and(is_hidden.eq.true,user_id.eq.')
  })

  it('nothing un-hides a conversation as a side effect of activity', () => {
    const src = readFileSync(join(process.cwd(), READ_ROUTES[0]), 'utf8')
    // Un-hide exists exactly once: the explicit PATCH action. The POST path
    // used to flip is_hidden back on any update — a 2FA sender writing again
    // would have resurfaced the thread for the whole team.
    const flips = src.split('is_hidden = false').length - 1 + (src.split('is_hidden: false').length - 1)
    const patchUnhide = src.includes("action === 'unhide'")
    expect(patchUnhide).toBe(true)
    // POST create path legitimately inserts is_hidden: false for NEW rows;
    // count the writes and pin the total so a new flip shows up here.
    expect(flips, 'is_hidden:false writes — new-row inserts plus the one explicit unhide').toBeLessThanOrEqual(3)
  })
})
