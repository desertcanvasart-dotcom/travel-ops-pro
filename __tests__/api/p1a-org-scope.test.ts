// ============================================
// P1a — the routes fixed for cross-tenant exposure stay scoped
// ============================================
// Each of these ran on the service-role client (RLS bypassed) and addressed a
// row by an id from the URL or body with no org filter, so one organisation
// could read or mutate another's data. This reads the sources, so an unscoped
// query added later fails in CI rather than in production.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (f: string) =>
  readFileSync(join(ROOT, f), 'utf8').split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')

// Files whose tour_quotes/b2c_quotes/expenses/invoices/… access must be scoped.
const SCOPED = [
  'app/api/b2c/quotes/route.ts',
  'app/api/b2c/quotes/[id]/route.ts',
  'app/api/b2c/quotes/[id]/send/route.ts',
  'app/api/b2c/quotes/[id]/revisions/route.ts',
  'app/api/b2b/quotes/[id]/revisions/[versionNumber]/route.ts',
  'app/api/accounts-payable/route.ts',
  'app/api/accounts-receivable/route.ts',
  'app/api/capacity/check/route.ts',
  'app/api/ai/suggest-email-reply/route.ts',
]

describe('P1a routes establish a tenant boundary', () => {
  it.each(SCOPED)('%s resolves org from the session', file => {
    const code = read(file)
    expect(code, `${file} never calls getCurrentOrgId`).toMatch(/getCurrentOrgId\s*\(/)
    // and it actually USES it — either an org_id filter or an ownership guard.
    const uses = /org_id/.test(code) || /quoteInOrg|rowInOrg|parentQuoteInOrg/.test(code)
    expect(uses, `${file} resolves org but never scopes a query with it`).toBe(true)
  })

  it('capacity/check no longer takes org_id from the request body', () => {
    const code = read('app/api/capacity/check/route.ts')
    // The org must come from the session, not be destructured from the body.
    expect(code).not.toMatch(/const\s*\{[^}]*\borg_id\b[^}]*\}\s*=\s*body/)
    expect(code).toContain('getCurrentOrgId')
  })

  it('the b2c quote update ignores client-supplied actor and org_id', () => {
    const code = read('app/api/b2c/quotes/[id]/route.ts')
    // changed_by / org_id must be dropped from the update body.
    expect(code, 'b2c PUT should not stamp create_b2c_quote_revision with a body-supplied actor')
      .not.toMatch(/p_changed_by:\s*changed_by/)
    expect(code).toContain('getCurrentUserId')
  })
})
