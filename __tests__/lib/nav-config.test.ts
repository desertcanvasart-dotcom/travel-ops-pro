// ============================================
// One navigation config, and every address it and the redirects name is real
// ============================================
// lib/nav/config.ts is the only list of links: the sidebar, the Settings
// area, ⌘K and the dashboard's link check all read it. These pin that: every
// link opens a page on disk, the old addresses (lib/nav/redirects.js) no
// longer have pages and land on ones that do, the active-link rule picks the
// most specific item, and the components that render menus write out no
// links of their own. Role parity with the middleware is
// __tests__/api/menu-page-gates.test.ts.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { MAIN_NAV, SETTINGS_NAV, RATE_GROUPS, JUMP_ONLY_PAGES, SETTINGS_HOME, navEntries } from '@/lib/nav/config'
import { activeHref } from '@/lib/nav/active'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const redirects = require('../../lib/nav/redirects.js')
import en from '@/messages/en.json'
import ja from '@/messages/ja.json'

const pageExists = (path: string) => {
  const clean = path.split(/[?#]/)[0].replace(/\/$/, '')
  return existsSync(join(process.cwd(), 'app', clean, 'page.tsx'))
}

describe('every menu link opens a page', () => {
  it('sidebar, rate sheets, Settings, ⌘K-only and the pinned Settings link', () => {
    const missing = [...navEntries().map(e => e.item.href), SETTINGS_HOME.href].filter(h => !pageExists(h))
    expect(missing).toEqual([])
  })

  it('each rate group opens a Rates hub tab', () => {
    for (const g of RATE_GROUPS) expect(g.href).toBe(`/rates#${g.key}`)
  })

  it('every label and Settings description has English and Japanese text', () => {
    const nav = (lang: typeof en) => lang.navigation as Record<string, string>
    const desc = (lang: typeof en) => (lang as unknown as { settingsArea: { desc: Record<string, string> } }).settingsArea.desc
    const keys = new Set<string>([
      ...MAIN_NAV.map(s => s.titleKey),
      ...SETTINGS_NAV.map(g => g.titleKey),
      ...navEntries().map(e => e.item.labelKey),
      ...JUMP_ONLY_PAGES.map(p => p.hintKey),
      ...RATE_GROUPS.map(g => g.labelKey),
    ])
    for (const lang of [en, ja]) {
      expect([...keys].filter(k => !nav(lang)[k])).toEqual([])
      expect(SETTINGS_NAV.flatMap(g => g.items).filter(i => !desc(lang)[i.descKey]).map(i => i.descKey)).toEqual([])
    }
  })

  it('no page is listed twice in one menu', () => {
    const main = MAIN_NAV.flatMap(s => s.items.flatMap(i => (i.children ?? [i]).map(c => c.href)))
    const settings = SETTINGS_NAV.flatMap(g => g.items.map(i => i.href))
    expect(main.length).toBe(new Set(main).size)
    expect(settings.length).toBe(new Set(settings).size)
  })
})

describe('activeHref picks the most specific item', () => {
  const items = [
    { href: '/dashboard' },
    { href: '/invoices' },
    { href: '/invoices?tab=unpaid' },
    { href: '/rates' },
    { href: '/rates/hotels' },
    { href: '/rates#accommodation' },
    { href: '/suppliers', match: ['/airport-staff'] },
    { href: '/settings/content-library' },
    { href: '/settings/content-library/rules' },
  ]
  it('exact path, with and without a query', () => {
    expect(activeHref(items, '/invoices', '')).toBe('/invoices')
    expect(activeHref(items, '/invoices', 'tab=unpaid')).toBe('/invoices?tab=unpaid')
    expect(activeHref(items, '/invoices', '?tab=unpaid&page=2')).toBe('/invoices?tab=unpaid')
    expect(activeHref(items, '/invoices', 'tab=all')).toBe('/invoices')
  })
  it('the longest path the address sits under', () => {
    expect(activeHref(items, '/invoices/abc', '')).toBe('/invoices')
    expect(activeHref(items, '/rates/hotels', '')).toBe('/rates/hotels')
    expect(activeHref(items, '/rates/check', '')).toBe('/rates')
    expect(activeHref(items, '/settings/content-library/rules', '')).toBe('/settings/content-library/rules')
    expect(activeHref(items, '/settings/content-library/abc', '')).toBe('/settings/content-library')
  })
  it('a query-carrying link never claims a sub-page', () => {
    expect(activeHref(items, '/invoices/abc', 'tab=unpaid')).toBe('/invoices')
  })
  it('match paths, then nothing', () => {
    expect(activeHref(items, '/airport-staff', '')).toBe('/suppliers')
    expect(activeHref(items, '/nowhere', '')).toBeNull()
    expect(activeHref(items, '/dashboardish', '')).toBeNull()
  })
  it('a #hash link is a fold, never the current page', () => {
    expect(activeHref([{ href: '/rates#accommodation' }], '/rates', '')).toBeNull()
  })
})

describe('redirects (lib/nav/redirects.js)', () => {
  const moved: Array<[string, string]> = redirects.MOVED

  it('no old address still has a page', () => {
    expect(moved.map(([from]) => from.replace(/\/\*$/, '')).filter(pageExists)).toEqual([])
  })

  it('every destination has a page', () => {
    const destinations = [
      ...moved.map(([, to]) => to.replace(/\/\*$/, '')),
      ...Object.values(redirects.SETTINGS_TABS as Record<string, string>),
      redirects.SETTINGS_HOME,
    ]
    expect(destinations.filter(d => !pageExists(d))).toEqual([])
  })

  it('a moved section keeps its sub-pages (content library items, writing rules)', () => {
    for (const sub of ['rules', '[id]']) {
      expect(existsSync(join(process.cwd(), 'app/settings/content-library', sub, 'page.tsx'))).toBe(true)
    }
  })

  it('all permanent, except bare /settings → Profile; tab rules come before it', () => {
    const list = redirects.nextRedirects() as Array<{ source: string; has?: unknown[]; destination: string; permanent: boolean }>
    const bare = list.findIndex(r => r.source === '/settings' && !r.has)
    expect(list[bare]).toMatchObject({ destination: '/settings/profile', permanent: false })
    expect(list.filter(r => r !== list[bare]).every(r => r.permanent)).toBe(true)
    const tabRules = list.map((r, i) => (r.source === '/settings' && r.has ? i : -1)).filter(i => i >= 0)
    expect(tabRules.length).toBe(Object.keys(redirects.SETTINGS_TABS).length)
    expect(Math.max(...tabRules)).toBeLessThan(bare)
  })

  it('next.config.ts serves the list, and /settings itself redirects too', () => {
    expect(readFileSync('next.config.ts', 'utf8')).toContain('return navRedirects.nextRedirects()')
    const page = readFileSync('app/settings/page.tsx', 'utf8')
    expect(page).toContain("from '@/lib/nav/redirects'")
    expect(page).toContain('redirect(')
  })

  it('nothing in the app still links to an old address', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) { if (e.name !== 'node_modules' && !p.includes('(public)')) walk(p); continue }
        if (!/\.(tsx?|jsx?)$/.test(e.name)) continue
        const src = readFileSync(p, 'utf8')
        for (const [from] of moved) {
          const base = from.replace(/\/\*$/, '')
          if (new RegExp(`(href=|href:|push\\()\\s*["'\`]${base.replace(/\//g, '\\/')}(["'\`/?#])`).test(src)) offenders.push(`${p}: ${base}`)
        }
        if (/["'`]\/settings\?tab=/.test(src)) offenders.push(`${p}: /settings?tab=`)
      }
    }
    for (const d of ['app', 'components', 'lib']) walk(join(process.cwd(), d))
    expect(offenders).toEqual([])
  })
})

describe('only the config lists links', () => {
  // The menus' renderers name no page. The top bar's logo goes home.
  const RENDERERS = ['components/Sidebar.tsx', 'components/nav/TopBar.tsx', 'components/nav/CommandPalette.tsx', 'app/settings/layout.tsx']
  it('the menu renderers write out no hrefs', () => {
    for (const f of RENDERERS) {
      const src = readFileSync(f, 'utf8').replace('<Link href="/dashboard"', '')
      expect(src, f).not.toMatch(/href(=|:\s*)["'`]\//)
      expect(src, f).not.toMatch(/labelKey:\s*'/)
    }
  })
  it('no other file builds a menu of labelKey/href items', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue }
        if (!/\.tsx?$/.test(e.name) || p.endsWith(join('lib', 'nav', 'config.ts'))) continue
        if (/labelKey:\s*'[^']+',\s*href:\s*'\//.test(readFileSync(p, 'utf8'))) offenders.push(p)
      }
    }
    for (const d of ['app', 'components', 'lib']) walk(join(process.cwd(), d))
    expect(offenders).toEqual([])
  })
})
