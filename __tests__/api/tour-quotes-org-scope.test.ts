// ============================================
// B2B quotes stay inside their organisation
// ============================================
// tour_quotes gained org_id in migrations/20260825_tour_quotes_org_id.sql. Two
// things have to hold from here on, and neither is visible in a type-check:
//
//  1. EVERY insert stamps org_id. The column is NOT NULL, so one that forgets
//     fails with 23502 at runtime — which is exactly how client creation went
//     down after the equivalent clients migration. That outage happened because
//     the sweep for insert paths found five of six; the sixth built its REST
//     path as a string and never matched the grep.
//
//  2. EVERY read and mutation is scoped, either by an org_id filter in the
//     statement or by a quoteInOrg() guard at the top of the handler. These
//     routes run on the service-role client, so nothing else stops one
//     organisation reaching another's quotes.
//
// This test reads the routes rather than the database, so it fails in CI at the
// moment someone adds an unscoped query — not in production.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

/** Every source file that touches the table, however it spells the access. */
const touching = walk(join(ROOT, 'app'))
  .concat(walk(join(ROOT, 'lib')))
  .filter(f => readFileSync(f, 'utf8').includes('tour_quotes'))
  .map(f => f.slice(ROOT.length + 1))
  .sort()

// Files where an unscoped query is a deliberate, documented decision.
// b2b/partners/[id] used to be a deliberate exception (partners were global);
// P1b gave b2b_partners an org_id, so it is now scoped like everything else and
// no longer belongs here.
const DELIBERATE: Record<string, string> = {}

describe('tour_quotes — insert paths', () => {
  const inserts = touching.filter(f => {
    const src = readFileSync(join(ROOT, f), 'utf8')
    return /\.from\(\s*['"]tour_quotes['"]\s*\)[\s\S]{0,200}?\.insert\(/.test(src)
  })

  it('are the three we know about — a new one must stamp org_id and be listed here', () => {
    expect(inserts).toEqual([
      'app/api/b2b/quote-from-itinerary/route.ts',
      'app/api/b2b/quotes/route.ts',
      // The order intake's one insert, shared by the operator's paste route
      // and the public /api/public/order-form door (2026-09-04; was
      // app/api/intake/order-form/route.ts until the pipeline was extracted).
      'lib/intake/process-order.ts',
    ])
  })

  it.each(inserts)('%s stamps org_id', file => {
    const src = readFileSync(join(ROOT, file), 'utf8')
    // Greedy window: a lazy match ending at `\n` stops on the line the insert
    // opens on and never sees the fields.
    const block = src.match(/\.from\(\s*['"]tour_quotes['"]\s*\)[\s\S]{0,200}?\.insert\(\{[\s\S]{0,400}/)
    expect(block, `could not find the insert body in ${file}`).toBeTruthy()
    expect(block![0], `${file} inserts a quote without org_id — NOT NULL, so this is a 23502 in production`)
      .toMatch(/org_id\s*:/)
  })
})

describe('tour_quotes — every access is scoped', () => {
  it.each(touching.filter(f => !(f in DELIBERATE)))('%s scopes by org', file => {
    const src = readFileSync(join(ROOT, file), 'utf8')
    const code = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')

    // Either the statements carry an org_id filter, or the handler establishes
    // ownership up front with quoteInOrg(). Both are acceptable; neither being
    // present is not.
    const scoped = /org_id/.test(code) || /quoteInOrg\s*\(/.test(code)
    expect(scoped, `${file} touches tour_quotes with no org filter and no quoteInOrg() guard`).toBe(true)
  })

  it('documents the files that are deliberately unscoped', () => {
    for (const [file, why] of Object.entries(DELIBERATE)) {
      expect(touching, `${file} is listed as deliberate but no longer touches tour_quotes`).toContain(file)
      expect(why.length).toBeGreaterThan(20)
      // The reasoning must live next to the code, not only in this test.
      const src = readFileSync(join(ROOT, file), 'utf8')
      expect(src, `${file} needs a comment explaining why it is unscoped`).toMatch(/DELIBERATELY UNSCOPED/)
    }
  })
})
