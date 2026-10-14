// ============================================
// Every menu screen is gated on the server to the roles the menu shows it to
// ============================================
// The side menu hides an item from roles that should not use it, but hiding a
// link is not access control: the middleware's page gate (ROUTE_PERMISSIONS)
// is. Two drifts were common. A screen missing from ROUTE_PERMISSIONS opens
// for any signed-in member, viewer included — e.g. /copilot-analytics, which
// the menu shows to agents and above. And an entry broader than the menu
// (/itineraries open to agents while the menu shows it to managers) leaves the
// screen one typed URL away.
//
// This test derives each menu item's roles from components/nav/navigation-
// config.ts and the server's from middleware.ts, the way each applies them,
// and requires them to agree. KNOWN_GAPS lists the screens whose menu group
// has not been audited yet; each group's audit removes its own lines. It is
// exact, so a fixed gap must be deleted from it and a new gap fails.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { navigationConfig } from '@/components/nav/navigation-config'

const ALL_ROLES = ['admin', 'manager', 'agent', 'viewer']
const source = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8')

/** ROUTE_PERMISSIONS re-read out of middleware.ts, in declaration order. */
function routePermissions(): Array<[string, string[]]> {
  const block = source.match(/const ROUTE_PERMISSIONS[^=]*=\s*\{([\s\S]*?)\n\}/)
  expect(block, 'ROUTE_PERMISSIONS not found in middleware.ts').toBeTruthy()
  const body = block![1].split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  const entries: Array<[string, string[]]> = []
  const re = /'([^']+)':\s*\[([^\]]*)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    entries.push([m[1], m[2].split(',').map(r => r.trim().replace(/'/g, '')).filter(Boolean)])
  }
  return entries
}

/** The roles the middleware lets onto `path` — its own matching rule. */
function serverRoles(path: string): string[] {
  const match = routePermissions().find(([route]) => path === route || path.startsWith(route + '/'))
  return match ? match[1] : ALL_ROLES
}

/** Every menu screen with the roles that see it (owner aside: it passes both). */
function menuScreens(): Array<{ path: string; roles: string[] }> {
  const screens: Array<{ path: string; roles: string[] }> = []
  for (const section of navigationConfig) {
    for (const item of section.items) {
      const roles = (item.roles ?? section.roles ?? ALL_ROLES).filter(r => r !== 'owner')
      for (const href of [item.href, ...(item.children ?? []).map(c => c.href)]) {
        const path = href.split('#')[0]
        if (!screens.some(s => s.path === path)) screens.push({ path, roles })
      }
    }
  }
  return screens
}

const sorted = (roles: string[]) => [...roles].sort().join(',')

// Screens not yet audited, as "path: menu=… server=…". Each group's audit
// fixes its gaps and deletes its lines here.
const KNOWN_GAPS: string[] = []

describe('menu screens are gated on the server to the menu roles', () => {
  it('no screen lets in a role the menu hides it from, or keeps out one it shows it to', () => {
    const gaps = menuScreens()
      .filter(s => sorted(s.roles) !== sorted(serverRoles(s.path)))
      .map(s => `${s.path}: menu=${sorted(s.roles)} server=${sorted(serverRoles(s.path))}`)
    expect(gaps).toEqual(KNOWN_GAPS)
  })
})

describe('Finance: invoices are staff-only to read, expenses are manager-and-above to write', () => {
  const mw = readFileSync('middleware.ts', 'utf8')
  it('/api/invoices is in STAFF_ONLY_API_PREFIXES', () => {
    const block = mw.slice(mw.indexOf('const STAFF_ONLY_API_PREFIXES'))
    expect(block.slice(0, block.indexOf(']\n'))).toContain("'/api/invoices'")
  })
  it('/api/expenses mutations do not admit agents', () => {
    expect(mw).toMatch(/prefix: '\/api\/expenses', roles: \['admin', 'manager'\]/)
  })
})

describe('Finance: the supplier-bill parser follows the Bills screen', () => {
  it('is in FINANCIAL_API_PREFIXES', () => {
    const mw = readFileSync('middleware.ts', 'utf8')
    const block = mw.slice(mw.indexOf('const FINANCIAL_API_PREFIXES'))
    expect(block.slice(0, block.indexOf(']\n'))).toContain("'/api/ai/parse-supplier-invoice'")
  })
})
