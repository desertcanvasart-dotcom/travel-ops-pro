// ============================================
// The generated types must agree with migrations/
// ============================================
// types/database.types.ts is generated from LIVE PRODUCTION over PostgREST
// (scripts/generate-db-types.mjs), and `--check` is the drift check — but that
// needs the production URL and service-role key, and CI must NEVER hold those:
// this repository is public, and __tests__/ci/workflow-secrets.test.ts exists
// precisely to stop a job reaching for them. So the drift check cannot run in
// CI, and on 2026-09-14 the committed file was found five months behind: it
// contained no `suppliers.supplier_code` at all, no `tipping_rates.city`, and
// four whole tables were missing (org_vocabularies, push_subscriptions,
// staff_links, trip_events).
//
// That matters because __tests__/lib/write-contract.test.ts asserts "every
// column the code WRITES exists in the schema" against this file. Checked
// against a stale copy, that guard can miss real drift and invent false
// positives — a guard reading a stale copy of the answer, which is the same
// disease one level up.
//
// This is the check that CAN run without credentials: replay migrations/ into
// a real Postgres (the same replay `npm run replay:schema` gates CI with) and
// assert the generated types know about everything those migrations build. It
// does not prove production matches the types — only a live query does that —
// but it does catch the failure that actually happened: a generated file left
// behind while migrations moved on.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { replayMigrations, publicTableColumns } from '@/scripts/replay-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

// ---------------------------------------------------------------------------
// EXCEPTIONS
// ---------------------------------------------------------------------------
// A table here is in production but is NOT built by migrations/, so this test
// cannot check it. Each needs a reason that is about the schema, never about
// the test being inconvenient — an exception added to make the numbers look
// better is a lie told to the next person.
const NOT_BUILT_BY_MIGRATIONS = new Map([
  [
    'copilot_knowledge',
    'needs pgvector. Its migration (20260628_copilot_knowledge_rag.sql) is in ' +
      'migrations/archive/ and the baseline deliberately excludes its ' +
      'pgvector-typed objects so the replay runs anywhere — see scripts/replay-core.mjs.',
  ],
])

/** Each table in the generated file, mapped to its Row columns. */
function generatedTables(): Map<string, Set<string>> {
  const src = readFileSync(join(__dirname, '..', '..', 'types', 'database.types.ts'), 'utf8')
  const out = new Map<string, Set<string>>()
  const tableRe = /^ {6}([a-z_0-9]+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm
  let m: RegExpExecArray | null
  while ((m = tableRe.exec(src)) !== null) {
    const cols = new Set<string>()
    for (const line of m[2].split('\n')) {
      const cm = line.match(/^ {10}([a-z_0-9]+)\??:/)
      if (cm) cols.add(cm[1])
    }
    out.set(m[1], cols)
  }
  return out
}

const STALE = 'types/database.types.ts is behind migrations/ — run `npm run types:generate` (needs .env.local). If regenerating does NOT fix it, production is missing a migration, which is the bigger problem.'

let replayed: Map<string, Set<string>>
let generated: Map<string, Set<string>>
let db: { close(): Promise<void> }

beforeAll(async () => {
  const replay = await replayMigrations()
  db = replay.db
  expect(replay.failed, 'migrations/ did not replay cleanly — run `npm run replay:schema`').toEqual([])
  replayed = await publicTableColumns(db)
  generated = generatedTables()
  // Both sides must be substantial, or every assertion below passes vacuously.
  expect(replayed.size, 'the replayed schema is empty').toBeGreaterThan(100)
  expect(generated.size, 'no tables parsed out of the generated types').toBeGreaterThan(100)
})

afterAll(async () => {
  await db?.close()
})

describe('types/database.types.ts against migrations/', () => {
  it('knows every table the migrations build', () => {
    const missing = [...replayed.keys()].filter(t => !generated.has(t))
    expect(missing, `${STALE}\nMissing tables: ${missing.join(', ')}`).toEqual([])
  })

  it('knows every column the migrations add', () => {
    // The one that bit: `suppliers.supplier_code` shipped in migration
    // 20260930 and never reached this file, so the portable supplier key was
    // invisible to every schema-derived test.
    const missing: string[] = []
    for (const [table, columns] of replayed) {
      const known = generated.get(table)
      if (!known) continue // reported by the test above
      for (const c of columns) if (!known.has(c)) missing.push(`${table}.${c}`)
    }
    expect(missing, `${STALE}\nMissing columns: ${missing.join(', ')}`).toEqual([])
  })

  it('claims no table a fresh install would not have, beyond the documented exceptions', () => {
    // The other direction: something in production that no migration builds
    // means a self-hosted install would not get it — the schema and the
    // migration set have diverged.
    const extra = [...generated.keys()].filter(t => !replayed.has(t) && !NOT_BUILT_BY_MIGRATIONS.has(t))
    expect(
      extra,
      `these exist in production but no migration creates them, so a fresh install would not have them: ${extra.join(', ')}`,
    ).toEqual([])
  })

  it('states a reason for every exception, and retires the ones that lapse', () => {
    for (const [table, reason] of NOT_BUILT_BY_MIGRATIONS) {
      expect(reason.length, `${table} needs a real reason`).toBeGreaterThan(40)
      // Once a migration does build it, the exception is a lie — delete it.
      expect(
        replayed.has(table),
        `${table} IS built by migrations now — remove it from NOT_BUILT_BY_MIGRATIONS`,
      ).toBe(false)
    }
  })
})
