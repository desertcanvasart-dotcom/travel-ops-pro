// A view created without `security_invoker` runs with the DEFINER's rights and
// bypasses RLS on its source tables. On 2026-08-21 that put 19 guide records,
// 6 airport-assistant records, 7 itineraries and 26 tour templates in reach of
// the anonymous internet — because `CREATE OR REPLACE VIEW` silently drops the
// option a previous migration had set.
//
// This test used to reconstruct a timeline across 125 migration files and check
// the last word on each view. Since the T3 squash it reads the BASELINE SCHEMA
// instead — a pg_dump of the live database — which is a stronger check for the
// same defect: it asserts what the database actually has, not what the sum of
// the migrations should have produced. The two can disagree, and when they do
// the database is the one that matters.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const BASELINE = path.join(process.cwd(), 'migrations', '20260829_baseline_schema.sql')

/** `CREATE VIEW public.name WITH (...) AS` — pg_dump's rendering. */
const CREATE_VIEW = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi

/** Does this CREATE VIEW statement carry caller-rights, inline, before its AS? */
function isInvoker(sql: string, at: number): boolean {
  const semi = sql.indexOf(';', at)
  const stmt = sql.slice(at, semi === -1 ? undefined : semi + 1)
  const asIdx = stmt.toLowerCase().indexOf(' as')
  // Only the WITH clause between the name and AS counts — a later view's
  // option must not be credited to this one.
  return /security_invoker\s*=\s*(?:on|true|'on'|'true')/i.test(
    stmt.slice(0, asIdx === -1 ? undefined : asIdx),
  )
}

describe('view security_invoker', () => {
  const sql = fs.readFileSync(BASELINE, 'utf8')

  it('the baseline actually contains views (the matcher still matches)', () => {
    expect([...sql.matchAll(CREATE_VIEW)].length).toBeGreaterThan(10)
  })

  it('every view runs under caller rights AFTER the last statement touching it', () => {
    // Last-write-wins, and it matters here: pg_dump emits four of these views
    // TWICE — once bare, then again as CREATE OR REPLACE ... WITH
    // (security_invoker='on') in the _RETURN rule section, because they have
    // circular dependencies. Judging the first occurrence alone reports four
    // false positives; judging the last is what Postgres actually ends up with.
    const lastIsInvoker = new Map<string, boolean>()
    for (const m of sql.matchAll(CREATE_VIEW)) {
      lastIsInvoker.set(m[1], isInvoker(sql, m.index!))
    }
    const definerRights = [...lastIsInvoker.entries()].filter(([, ok]) => !ok).map(([v]) => v)
    expect(
      definerRights,
      'views running with definer rights — they bypass RLS on their source tables',
    ).toEqual([])
  })

  it('a view replaced without the option would still be caught', () => {
    // The dropped-option regression is exactly CREATE OR REPLACE without WITH.
    // Prove last-write-wins does not paper over it.
    const replayed =
      "CREATE VIEW public.x WITH (security_invoker='on') AS SELECT 1;\n" +
      'CREATE OR REPLACE VIEW public.x AS SELECT 1;'
    const seen = new Map<string, boolean>()
    for (const m of replayed.matchAll(CREATE_VIEW)) seen.set(m[1], isInvoker(replayed, m.index!))
    expect(seen.get('x')).toBe(false)
  })

  it('detects the regression it was written for', () => {
    // Guard against the matcher rotting into something that always passes.
    const bad = 'CREATE OR REPLACE VIEW public.guides AS SELECT id FROM suppliers;'
    const good =
      "CREATE OR REPLACE VIEW public.guides WITH (security_invoker = on) AS SELECT id FROM suppliers;"
    const dumped = "CREATE VIEW public.guides WITH (security_invoker='on') AS SELECT id FROM suppliers;"
    expect(isInvoker(bad, 0)).toBe(false)
    expect(isInvoker(good, 0)).toBe(true)
    expect(isInvoker(dumped, 0)).toBe(true)
  })
})
