// ============================================
// P1b — b2b partners / pricing-rules / transport-packages are org-scoped
// ============================================
// These tables gained org_id in 20260825_b2b_partner_pricing_transport_org_id.sql.
// The routes run on the service-role client, so an explicit org filter on every
// read and mutation, and an org_id stamp on every insert, is the only tenant
// boundary. NOT NULL means a forgotten stamp is a 23502 in production.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (f: string) =>
  readFileSync(join(ROOT, f), 'utf8').split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')

const ROUTES = [
  'app/api/b2b/partners/route.ts',
  'app/api/b2b/partners/[id]/route.ts',
  'app/api/b2b/pricing-rules/route.ts',
  'app/api/b2b/transport-packages/route.ts',
  'app/api/b2b/transport-packages/[id]/route.ts',
]

describe('P1b routes are org-scoped', () => {
  it.each(ROUTES)('%s resolves org from the session and scopes with it', file => {
    const code = read(file)
    expect(code, `${file} never calls getCurrentOrgId`).toMatch(/getCurrentOrgId\s*\(/)
    expect(code, `${file} resolves org but never filters/stamps org_id`).toMatch(/org_id/)
  })

  const INSERTERS: Array<[string, string]> = [
    ['app/api/b2b/partners/route.ts', 'b2b_partners'],
    ['app/api/b2b/pricing-rules/route.ts', 'b2b_pricing_rules'],
    ['app/api/b2b/transport-packages/route.ts', 'b2b_transport_packages'],
  ]
  it.each(INSERTERS)('%s stamps org_id on insert (NOT NULL → 23502 otherwise)', (file, table) => {
    const code = read(file)
    const block = code.match(new RegExp(`\\.from\\('${table}'\\)[\\s\\S]{0,120}?\\.insert\\(\\{[\\s\\S]{0,600}`))
    expect(block, `could not find the ${table} insert in ${file}`).toBeTruthy()
    expect(block![0], `${file} inserts into ${table} without org_id`).toMatch(/org_id\s*:/)
  })

  it('partner deletion fails CLOSED when the reference lookup errors', () => {
    const code = read('app/api/b2b/partners/[id]/route.ts')
    // The ref check must read its error and refuse on it, not proceed.
    expect(code).toMatch(/data:\s*quotes,\s*error:\s*refErr/)
    expect(code).toMatch(/if\s*\(refErr\)/)
  })
})
