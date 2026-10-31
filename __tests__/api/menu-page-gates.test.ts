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
// This test derives each menu item's roles from lib/nav/config.ts — the
// sidebar, the rate sheets, the Settings area, the ⌘K-only pages and the
// pinned Settings link — and the server's from middleware.ts, the way each
// applies them,
// and requires them to agree. KNOWN_GAPS lists the screens whose menu group
// has not been audited yet; each group's audit removes its own lines. It is
// exact, so a fixed gap must be deleted from it and a new gap fails.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { navEntries, SETTINGS_HOME, TABBED_PAGES } from '@/lib/nav/config'

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

/** The tab a link opens, if it names one of a tabbed page's tabs. */
function tabOf(href: string) {
  const [path, query = ''] = href.split('?')
  const page = TABBED_PAGES.find(p => p.path === path)
  const value = page && new URLSearchParams(query).get(page.param)
  return page && value ? page.tabs.find(t => t.value === value) : undefined
}

/** Every menu link with the roles that see it (owner aside: it passes both).
 *  A page listed in two menus (Message templates) is checked in each. A link
 *  to a TAB is held to the tab's roles below, not to the page gate. */
function menuScreens(): Array<{ path: string; roles: string[] }> {
  const entries = [...navEntries().map(e => ({ href: e.item.href, roles: e.roles })), { href: SETTINGS_HOME.href, roles: SETTINGS_HOME.roles ?? null }]
  return entries.filter(e => !tabOf(e.href)).map(e => ({
    path: e.href.split(/[?#]/)[0],
    roles: (e.roles ?? ALL_ROLES).filter(r => r !== 'owner'),
  }))
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

describe('tabbed pages: the page gate is the union of its tabs', () => {
  it('each tabbed page is gated to exactly the roles of its tabs together', () => {
    for (const page of TABBED_PAGES) {
      const union = new Set(page.tabs.flatMap(t => t.roles ?? ALL_ROLES))
      expect(sorted(serverRoles(page.path)), page.path).toBe(sorted([...union]))
    }
  })
  it('a menu link to a tab carries that tab\'s roles', () => {
    for (const e of navEntries()) {
      const tab = tabOf(e.item.href)
      if (tab) expect(sorted(e.roles ?? ALL_ROLES), e.item.href).toBe(sorted(tab.roles ?? ALL_ROLES))
    }
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

describe('Settings: accounting connection and vocabulary writes are admin-only', () => {
  const mw = readFileSync('middleware.ts', 'utf8')
  it('mutation gates', () => {
    expect(mw).toContain("{ prefix: '/api/auth/accounting', roles: ['admin'] }")
    expect(mw).toContain("{ prefix: '/api/vocabulary', roles: ['admin'] }")
  })
  it('accounting status is manager-and-above to read', () => {
    const block = mw.slice(mw.indexOf('const FINANCIAL_API_PREFIXES'))
    expect(block.slice(0, block.indexOf(']\n'))).toContain("'/api/auth/accounting/status'")
  })
})

describe('Settings: activity is logged after the role gate; roster reads admin/manager', () => {
  const mw = readFileSync('middleware.ts', 'utf8')
  it('recordActivity comes after the mutation role check', () => {
    expect(mw.indexOf('recordActivity({')).toBeGreaterThan(mw.indexOf('if (!roleAllows(await membershipRole(user.id), matched.roles))'))
  })
  it('exact-path read gate for the roster, members and invitations', () => {
    expect(mw).toContain("new Set(['/api/profiles', '/api/organization/members', '/api/invitations'])")
  })
})

describe("Settings: an agent's own pages", () => {
  const mw = readFileSync('middleware.ts', 'utf8')
  it('preferences, email and profile admit agents and come before /settings', () => {
    for (const p of ['/settings/preferences', '/settings/email', '/settings/profile']) {
      expect(mw).toContain(`'${p}': ['admin', 'manager', 'agent'],`)
      expect(mw.indexOf(`'${p}':`)).toBeLessThan(mw.indexOf("'/settings': ['admin', 'manager'],"))
    }
  })
})
