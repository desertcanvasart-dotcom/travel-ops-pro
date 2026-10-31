// ============================================
// The docs agree with themselves — and with the pages on disk
// ============================================
// The /docs index and the docs sidebar each carried their own copy of the
// table of contents. They drifted (different order, and at audit time
// different membership) — filed as AUT-L04, "the docs sidebar omits several
// entries the index shows". Both now render app/(public)/docs/toc.ts; this
// test pins that single list to the page directories on disk, in both
// directions, so adding a doc page without listing it (or listing one that
// does not exist) fails here instead of on a customer.
import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORIES, DOC_PAGES, adjacentDocs } from '@/app/(public)/docs/toc'
import { MAIN_NAV, SETTINGS_NAV } from '@/lib/nav/config'
import en from '@/messages/en.json'

const DOCS_DIR = join(process.cwd(), 'app/(public)/docs')

const tocHrefs = CATEGORIES.flatMap(c => c.items.map(i => i.href))
const pageDirs = readdirSync(DOCS_DIR)
  .filter(e => statSync(join(DOCS_DIR, e)).isDirectory())
  .map(d => `/docs/${d}`)

describe('docs table of contents', () => {
  it('every doc page on disk is listed', () => {
    expect(pageDirs.filter(d => !tocHrefs.includes(d))).toEqual([])
  })

  it('every listed entry has a page on disk', () => {
    expect(tocHrefs.filter(h => !pageDirs.includes(h))).toEqual([])
  })

  it('every page directory holds a page.tsx', () => {
    expect(pageDirs.filter(d => !existsSync(join(DOCS_DIR, d.replace('/docs/', ''), 'page.tsx')))).toEqual([])
  })

  it('no entry is listed twice', () => {
    expect(tocHrefs.length).toBe(new Set(tocHrefs).size)
  })

  it('the sidebar has no list of its own — both renderers import the TOC', () => {
    // The drift class this file exists for: a second copy appearing in either
    // renderer. Each must import from ./toc and define no CATEGORIES/NAV list.
    for (const file of ['layout.tsx', 'page.tsx']) {
      const src = readFileSync(join(DOCS_DIR, file), 'utf8')
      expect(src, `${file} must import the shared TOC`).toContain("from './toc'")
      expect(src, `${file} must not define its own list`).not.toMatch(/const (CATEGORIES|NAV_ITEMS)\s*[:=]/)
    }
  })
})

// ============================================
// The docs follow the app's side menu
// ============================================
// The docs groups drifted from the menu: when Communicate moved to second
// place in the menu it stayed eighth in the docs, and four menu items had no
// page at all. These pin the docs to lib/nav/config.ts: the sidebar's
// groups, then one Settings group for the whole Settings area.
describe('docs table of contents follows the app menu', () => {
  const navLabels = en.navigation as Record<string, string>

  it('the docs groups are the menu groups, in menu order, with the menu labels', () => {
    const docsGroups = CATEGORIES.filter(c => c.menuSection).map(c => [c.menuSection, c.label])
    const menuGroups = [...MAIN_NAV.map(s => [s.key, navLabels[s.titleKey]]), ['settings', navLabels.settings]]
    expect(docsGroups).toEqual(menuGroups)
  })

  it('Getting Started comes first and is the only docs-only group', () => {
    expect(CATEGORIES.filter(c => !c.menuSection).map(c => c.label)).toEqual(['Getting Started'])
    expect(CATEGORIES[0].label).toBe('Getting Started')
  })

  it('every menu item is documented by a page in its own group', () => {
    const uncovered: string[] = []
    for (const section of MAIN_NAV) {
      const group = CATEGORIES.find(c => c.menuSection === section.key)
      const covered = new Set(group?.items.flatMap(i => i.covers ?? []) ?? [])
      for (const item of section.items) {
        for (const href of [item.href, ...(item.children ?? []).map(c => c.href)]) {
          if (!covered.has(href)) uncovered.push(`${section.key}: ${href}`)
        }
      }
    }
    expect(uncovered).toEqual([])
  })

  it('every Settings page is documented', () => {
    // Mostly in the Settings group; message templates and the staff directory
    // are sidebar items too, and are documented there (Communicate, Contacts).
    const covered = new Set(CATEGORIES.flatMap(c => c.items.flatMap(i => i.covers ?? [])))
    const uncovered = SETTINGS_NAV.flatMap(g => g.items.map(i => i.href)).filter(href => !covered.has(href))
    expect(uncovered).toEqual([])
  })

  it('every route a page claims to cover is a real app page', () => {
    const missing = DOC_PAGES.flatMap(p => p.covers ?? [])
      .map(route => route.split('#')[0])
      .filter(route => !existsSync(join(process.cwd(), 'app', route, 'page.tsx')))
    expect(missing).toEqual([])
  })
})

// ============================================
// Previous / next come from the table of contents
// ============================================
// 39 pages hand-coded their own previous/next links. They followed an old
// menu order with stale titles, 20 pages had none, and two pointed at each
// other (tasks ⇄ notifications). The layout now renders one pager for every
// page, from the table of contents.
describe('docs pager', () => {
  it('walks every page once, in table-of-contents order', () => {
    const walked: string[] = []
    let href: string | undefined = DOC_PAGES[0].href
    while (href) {
      walked.push(href)
      href = adjacentDocs(href)?.next?.href
    }
    expect(walked).toEqual(tocHrefs)
  })

  it('links each page to its neighbours both ways', () => {
    for (const [i, page] of DOC_PAGES.entries()) {
      const adjacent = adjacentDocs(page.href)!
      expect(adjacent.prev?.href ?? null).toBe(DOC_PAGES[i - 1]?.href ?? null)
      expect(adjacent.next?.href ?? null).toBe(DOC_PAGES[i + 1]?.href ?? null)
    }
  })

  it('has nothing for a path outside the table of contents', () => {
    expect(adjacentDocs('/docs')).toBeNull()
  })

  it('the docs layout renders it, and no page carries its own', () => {
    expect(readFileSync(join(DOCS_DIR, 'layout.tsx'), 'utf8')).toContain('<DocsPager href={pathname} />')
    const handCoded = pageDirs.filter(d => {
      const src = readFileSync(join(DOCS_DIR, d.replace('/docs/', ''), 'page.tsx'), 'utf8')
      return /Next:\s/.test(src) || src.includes('border-t border-gray-200 flex justify-between')
    })
    expect(handCoded).toEqual([])
  })
})
