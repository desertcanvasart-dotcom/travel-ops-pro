// Every <Link href="/something"> and href={'/something'} in the app must land
// on a page that exists. The "Guides" button on Guide Rates pointed at /guides
// for eight months after that page was deleted (404 on click, and a console
// 404 from the RSC prefetch on every visit); nothing in tsc or the build can
// see that a string names a route. This scans for it.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full)
  }
  return out
}

/** Does app/<segment...>/page.tsx exist, treating [param] directories as wildcards? */
function pageExists(route: string): boolean {
  const segments = route.split('/').filter(Boolean)
  let dirs = [path.join(ROOT, 'app')]
  for (const seg of segments) {
    const next: string[] = []
    for (const d of dirs) {
      if (!fs.existsSync(d)) continue
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (!e.isDirectory()) continue
        if (e.name === seg || /^\[.*\]$/.test(e.name)) next.push(path.join(d, e.name))
        else if (/^\(.*\)$/.test(e.name)) {
          // route groups are transparent
          const inner = path.join(d, e.name, seg)
          if (fs.existsSync(inner)) next.push(inner)
        }
      }
    }
    dirs = next
    if (dirs.length === 0) return false
  }
  return dirs.some(d => fs.existsSync(path.join(d, 'page.tsx')) || fs.existsSync(path.join(d, 'route.ts')))
}

describe('internal links', () => {
  it('every static href in app/ and components/ points at a page that exists', () => {
    const offenders: string[] = []
    const files = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]
    // href="/x", href={'/x'}, href={`/x`} and the bare '/x' branches of a ternary inside href={...}
    const hrefAttr = /href=\{?\s*["'`](\/[a-z0-9\-\/]*)(?:[?#][^"'`]*)?["'`]/g
    const ternaryBranch = /[?:]\s*["'`](\/[a-z0-9\-\/]*)(?:[?#][^"'`]*)?["'`]\s*(?=[:\n}])/g
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
      const seen = new Set<string>()
      for (const rx of [hrefAttr]) for (const m of src.matchAll(rx)) seen.add(m[1])
      // ternary branches only matter inside an href={...} expression
      for (const block of src.matchAll(/href=\{([\s\S]*?)\}\s*\n/g)) for (const m of block[1].matchAll(ternaryBranch)) seen.add(m[1])
      for (const route of seen) {
        if (route === '/' || route.startsWith('/api/') || route.startsWith('/_')) continue
        if (!pageExists(route)) offenders.push(`${path.relative(ROOT, file)} → ${route}`)
      }
    }
    expect(offenders, 'links to routes with no app/**/page.tsx').toEqual([])
  })
})
