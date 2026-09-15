// ============================================
// Which API mutations require which role
// ============================================
// The middleware is the only authorization layer these routes have: they all run
// on the RLS-bypassing service-role client, and almost none of them check a role
// in-route. The gate is a PREFIX list, which is easy to under-fill and gives no
// signal when it is — the rate tables, the staff roster and the customer list
// were all missing from it, so any signed-in account, viewer included, could
// POST/PUT/DELETE them.
//
// This test pins the list to the page-level permissions it is supposed to
// mirror, so a new screen whose API was never gated fails here instead of in
// production.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { roleAllows } from '@/lib/auth/roles'

const source = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8')

/** Re-read the gate out of middleware.ts rather than duplicating it here. */
function mutationPermissions(): Array<{ prefix: string; roles: string[] }> {
  const block = source.match(
    /const API_MUTATION_PERMISSIONS[^=]*=\s*\[([\s\S]*?)\n\]/
  )
  expect(block, 'API_MUTATION_PERMISSIONS not found in middleware.ts').toBeTruthy()
  const entries: Array<{ prefix: string; roles: string[] }> = []
  const re = /\{\s*prefix:\s*'([^']+)',\s*roles:\s*\[([^\]]+)\]\s*\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block![1]))) {
    entries.push({
      prefix: m[1],
      roles: m[2].split(',').map(r => r.trim().replace(/'/g, '')).filter(Boolean),
    })
  }
  return entries
}

function rolesFor(path: string): string[] | null {
  const match = mutationPermissions().find(p => path.startsWith(p.prefix))
  return match ? match.roles : null
}

describe('API mutation gate — coverage', () => {
  // Each of these had NO role gate at all: a viewer could rewrite the cost base
  // the whole pricing engine reads from, or the operating roster.
  it.each([
    '/api/rates/hotels',
    '/api/rates/guides',
    '/api/rates/transportation',
    '/api/rates/entrance-fees',
    '/api/supplier-rates',
    '/api/suppliers',
    '/api/team-members',
    '/api/team-members/abc-123',
    // P2: b2b pricing config is manager+, not the blanket /api/b2b agent+.
    '/api/b2b/pricing-rules',
    '/api/b2b/pricing-rules/abc',
    '/api/b2b/transport-packages',
    '/api/b2b/transport-packages/abc',
  ])('%s is manager-and-above', path => {
    const roles = rolesFor(path)
    expect(roles, `${path} has no entry in API_MUTATION_PERMISSIONS`).not.toBeNull()
    expect(roles).toEqual(expect.arrayContaining(['admin', 'manager']))
    expect(roles).not.toContain('agent')
    expect(roles).not.toContain('viewer')
  })

  it.each([
    '/api/clients',
    '/api/clients/abc-123',
    '/api/itineraries',
    '/api/bookings',
    '/api/whatsapp/send-quote',
    // Missed by the original sweep: a viewer could PUT a quote and bulk-delete
    // a page of them.
    '/api/b2b/quotes',
    '/api/b2b/quotes/abc-123',
    '/api/b2b/quotes/bulk-delete',
    '/api/b2c/quotes',
  ])('%s is agent-and-above', path => {
    const roles = rolesFor(path)
    expect(roles, `${path} has no entry in API_MUTATION_PERMISSIONS`).not.toBeNull()
    expect(roles).toEqual(expect.arrayContaining(['admin', 'manager', 'agent']))
    expect(roles).not.toContain('viewer')
  })

  it('leaves self-service routes ungated so a viewer can still edit their own profile', () => {
    for (const path of ['/api/profile', '/api/user-preferences', '/api/avatar', '/api/notifications']) {
      expect(rolesFor(path), `${path} should not be role-gated`).toBeNull()
    }
  })

  // ---------------------------------------------------------------------
  // The one kind of POST a viewer may make.
  // ---------------------------------------------------------------------
  // The rule is about mutating the AGENCY'S DATA. Choosing which workspace
  // your own session is looking at mutates nothing anybody else can see, and
  // a viewer who belongs to two agencies has to be able to reach the second
  // one — otherwise they are locked into whichever membership is oldest and
  // their invitation to the other was pointless.
  //
  // Each entry needs a reason that is about SESSION state. Anything that
  // writes agency data does not belong here however convenient.
  const VIEWER_MAY_POST: Record<string, string> = {
    '/api/organizations/mine':
      'sets the active-workspace cookie for your own session; the resolver honours it only where the membership is real, so it grants nothing and changes no agency data',
  }

  it('never grants a viewer a mutation', () => {
    for (const entry of mutationPermissions()) {
      if (entry.prefix in VIEWER_MAY_POST) continue
      expect(roleAllows('viewer', entry.roles), `viewer must not pass ${entry.prefix}`).toBe(false)
    }
  })

  it('keeps the viewer exceptions few, real and explained', () => {
    const prefixes = mutationPermissions().map(e => e.prefix)
    for (const [prefix, reason] of Object.entries(VIEWER_MAY_POST)) {
      expect(prefixes, `${prefix} is not a gated route — the exception is stale`).toContain(prefix)
      expect(reason.length, `${prefix} needs a reason about session state`).toBeGreaterThan(60)
      // An exception that no longer grants a viewer anything should be deleted
      // rather than left to imply the hole is still open.
      const entry = mutationPermissions().find(e => e.prefix === prefix)!
      expect(roleAllows('viewer', entry.roles), `${prefix} no longer admits a viewer — remove the exception`).toBe(true)
    }
  })

  it('always lets the owner through', () => {
    for (const entry of mutationPermissions()) {
      expect(roleAllows('owner', entry.roles), `owner must pass ${entry.prefix}`).toBe(true)
    }
  })
})

// ============================================
// A manager sees everything — the PAGE gates
// ============================================
// 2026-09-13: a manager could not open Settings, User Management or the
// Activity Log at all — the pages were admin-only. The line is now: a manager
// may SEE every page; ADMINISTERING the organisation (invites, role changes,
// company identity, integrations) stays admin on the mutations.
function pagePermissions(): Record<string, string[]> {
  const block = source.match(/const ROUTE_PERMISSIONS[^=]*=\s*\{([\s\S]*?)\n\}/)
  expect(block, 'ROUTE_PERMISSIONS not found in middleware.ts').toBeTruthy()
  const perms: Record<string, string[]> = {}
  const re = /'([^']+)':\s*\[([^\]]+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block![1]))) {
    perms[m[1]] = m[2].split(',').map(r => r.trim().replace(/'/g, '')).filter(Boolean)
  }
  return perms
}

describe('page gate — a manager sees everything', () => {
  it.each(['/settings', '/activity', '/users'])('%s opens for a manager', page => {
    const roles = pagePermissions()[page]
    expect(roles, `${page} has no page gate`).toBeTruthy()
    expect(roleAllows('manager', roles)).toBe(true)
    expect(roleAllows('agent', roles)).toBe(false)
    expect(roleAllows('viewer', roles)).toBe(false)
  })

  it('no page gate excludes a manager', () => {
    for (const [page, roles] of Object.entries(pagePermissions())) {
      expect(roleAllows('manager', roles), `manager must open ${page}`).toBe(true)
    }
  })

  it('administering the organisation stays admin: invitations, org identity, integrations', () => {
    for (const path of ['/api/invitations', '/api/organization', '/api/integrations']) {
      const roles = rolesFor(path)
      expect(roles, `${path} has no entry`).not.toBeNull()
      expect(roleAllows('manager', roles!), `manager must not administer ${path}`).toBe(false)
    }
  })

  it('operating settings (email, notifications, WhatsApp-AI) are manager-and-above', () => {
    expect(roleAllows('manager', rolesFor('/api/settings/email')!)).toBe(true)
  })
})

describe('P3 — audit authorship comes from the session, not the body', () => {
  it.each([
    ['app/api/b2b/quotes/[id]/route.ts', 'create_quote_revision'],
    ['app/api/b2c/quotes/[id]/route.ts', 'create_b2c_quote_revision'],
    ['app/api/supplier-invoices/[id]/approve/route.ts', 'approved_by'],
  ])('%s does not stamp authorship from a client-supplied field', file => {
    const code = readFileSync(join(process.cwd(), file), 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(code, `${file} passes a body-supplied changed_by`).not.toMatch(/p_changed_by:\s*body\.changed_by/)
    expect(code, `${file} attributes approval to body.userId`).not.toMatch(/approved_by:\s*body\.userId/)
    expect(code, `${file} should derive the actor from getCurrentUserId`).toContain('getCurrentUserId')
  })
})

describe('P2 — deactivated accounts and financial reads', () => {
  it('the middleware denies ALL API access to a deactivated account (reads included)', () => {
    // The old is_active check lived only inside the mutation block, so GETs
    // skipped it. This must run before the route-specific gates.
    expect(source).toMatch(/isAccountActive/)
    expect(source).toMatch(/isApiRoute && user && !\(await isAccountActive/)
  })

  it('accounting is under the financial read gate', () => {
    const block = source.match(/const FINANCIAL_API_PREFIXES = \[([\s\S]*?)\]/)![1]
    expect(block).toContain("'/api/accounting'")
  })

  it('the specific pricing/transport gates precede the general /api/b2b entry', () => {
    const idx = (s: string) => source.indexOf(s)
    expect(idx("prefix: '/api/b2b/pricing-rules'")).toBeGreaterThan(-1)
    expect(idx("prefix: '/api/b2b/pricing-rules'")).toBeLessThan(idx("prefix: '/api/b2b',"))
    expect(idx("prefix: '/api/b2b/transport-packages'")).toBeLessThan(idx("prefix: '/api/b2b',"))
  })
})

describe('self-auth allowlist', () => {
  const allowlist = source
    .match(/const apiSelfAuthPrefixes = \[([\s\S]*?)\n\s*\]/)![1]
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n')
    .match(/'[^']+'/g)!
    .map(s => s.replace(/'/g, ''))

  // The bug this pins: '/api/whatsapp/status' was on the list and the check is
  // startsWith, so '/api/whatsapp/status-callback' — an unsigned, service-role
  // write endpoint — was exempted from authentication by accident.
  it('does not exempt /api/whatsapp/status, which is not a Twilio endpoint', () => {
    expect(allowlist).not.toContain('/api/whatsapp/status')
    expect(allowlist).toContain('/api/whatsapp/status-callback')
  })

  it('exempts nothing that would swallow another route by prefix', () => {
    for (const a of allowlist) {
      for (const b of allowlist) {
        if (a !== b && b.startsWith(a)) {
          throw new Error(`'${a}' also exempts '${b}' — collapse them or make '${a}' exact`)
        }
      }
    }
  })
})

describe('routes that act on "me" resolve me from the session', () => {
  // The middleware deliberately leaves the self-service routes ungated so a
  // viewer can still edit their own profile. That is only safe while those
  // routes act on the CALLER. /api/avatar/upload took its userId from the
  // request body and then wrote user_profiles.avatar_url for that id on the
  // service-role client, so any signed-in account could replace anyone's
  // avatar — the ungated route plus a trusted body field.
  //
  // The same shape turned up three times, each worse than the last: overwriting
  // someone's avatar, reading their mailbox, and sending mail AS them. All three
  // took an id from the request and handed it to a service-role client or an
  // OAuth token lookup.
  const actOnCaller = [
    'app/api/avatar/upload/route.ts',
    'app/api/email/sync/route.ts',
    'app/api/copilot/drafts/[id]/send/route.ts',
    // P3: send/attribution routes that used to trust a client-supplied user id.
    'app/api/templates/send/route.ts',
  ]

  it.each(actOnCaller)('%s never trusts a user id from the request', file => {
    const src = readFileSync(join(process.cwd(), file), 'utf8')
    const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

    // Both spellings: userId off formData/searchParams, and user_id destructured
    // from a JSON body or read off it directly.
    expect(code, `${file} reads a user id out of the request`).not.toMatch(
      /(formData|searchParams|body)\s*\.\s*get\(\s*['"]user_?[Ii]d['"]/
    )
    expect(code, `${file} reads user_id off the request body`).not.toMatch(
      /=\s*body\.user_id\b/
    )
    expect(code, `${file} destructures user_id out of the request body`).not.toMatch(
      /const\s*\{[^}]*\buser_id\b[^}]*\}\s*=\s*body\b/
    )
    expect(code, `${file} should resolve the caller via getCurrentUserId()`).toContain('getCurrentUserId')
  })
})
