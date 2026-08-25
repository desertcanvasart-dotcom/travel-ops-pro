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

  it('never grants a viewer a mutation', () => {
    for (const entry of mutationPermissions()) {
      expect(roleAllows('viewer', entry.roles), `viewer must not pass ${entry.prefix}`).toBe(false)
    }
  })

  it('always lets the owner through', () => {
    for (const entry of mutationPermissions()) {
      expect(roleAllows('owner', entry.roles), `owner must pass ${entry.prefix}`).toBe(true)
    }
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
  const selfService = [
    'app/api/avatar/upload/route.ts',
  ]

  it.each(selfService)('%s never trusts a userId from the request', file => {
    const src = readFileSync(join(process.cwd(), file), 'utf8')
    const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(code, `${file} reads a userId out of the request body`).not.toMatch(
      /(formData|body|searchParams)\s*\.\s*get\(\s*['"]userId['"]/
    )
    expect(code, `${file} should resolve the caller via getCurrentUserId()`).toContain('getCurrentUserId')
  })
})
