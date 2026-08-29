// The migration runner (T1 of docs/plans/self-hosting.md), driven end-to-end
// against a real Postgres via PGlite — not mocks, because the thing worth
// proving is that a failure leaves the database and the tracker agreeing with
// each other.
//
// The contract, in one line: apply every unrecorded file in name order, record
// each only AFTER it succeeds, stop on the first failure without recording it.
import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import {
  assertOrderable,
  computePending,
  identifyDatabase,
  checkBaselineSafety,
  checkTarget,
  isBaselineFile,
  loadApplied,
  normalizeName,
  runPending,
  type MigrationClient,
} from '@/scripts/migrate-core.mjs'

// PGlite boots a real Postgres per instance — roughly a second each, and slower
// when vitest is running other suites in parallel. The 5s default is a timing
// assumption, not a correctness one, and it started failing on main once a
// second PGlite-backed suite landed alongside this one. Raised deliberately and
// scoped to this file, so a genuine hang elsewhere still fails fast.
vi.setConfig({ testTimeout: 30_000 })

const MIGRATIONS = path.join(process.cwd(), 'migrations')

/**
 * migrate-core speaks to anything with `query(text, params?) -> { rows }`,
 * allowing multi-statement text. PGlite splits those responsibilities across
 * `.query()` (single statement, parameterised) and `.exec()` (multi), so this
 * adapter is what the CLI's `pg.Client` gives us for free.
 */
function adapt(db: PGlite): MigrationClient {
  return {
    async query(text: string, params?: unknown[]) {
      const rows = params
        ? (await db.query(text, params as never[])).rows
        : ((await db.exec(text)).at(-1)?.rows ?? [])
      return { rows: rows as Record<string, unknown>[] }
    },
  }
}

const file = (name: string, sql: string) => ({ name, sql })

describe('normalizeName', () => {
  it('treats a recorded name as the same whether or not it ends in .sql', () => {
    expect(normalizeName('20260203_x.sql')).toBe('20260203_x')
    expect(normalizeName('20260203_x')).toBe('20260203_x')
  })
})

describe('computePending', () => {
  it('returns unapplied files in name order', () => {
    const pending = computePending(
      ['20260203_b.sql', '20260201_a.sql', '20260205_c.sql'],
      ['20260201_a'],
    )
    expect(pending).toEqual(['20260203_b.sql', '20260205_c.sql'])
  })

  it('matches a tracker row recorded with the .sql suffix', () => {
    expect(computePending(['20260201_a.sql'], ['20260201_a.sql'])).toEqual([])
  })

  it('ignores non-.sql entries in the directory', () => {
    expect(computePending(['20260201_a.sql', 'data', 'README.md'], [])).toEqual(['20260201_a.sql'])
  })
})

describe('assertOrderable', () => {
  // The reason this guard exists: 11 files here were named without a date
  // prefix, and digits sort before letters, so a plain sort put the OLDEST
  // files LAST. They were renamed in T1. Nothing must reintroduce the problem.
  it('rejects a migration with no YYYYMMDD_ prefix', () => {
    expect(() => assertOrderable(['20260201_a.sql', 'create_bookings_tables.sql'])).toThrow(
      /create_bookings_tables\.sql/,
    )
  })

  it('names every offending file, so one run fixes them all', () => {
    expect(() => assertOrderable(['add_a.sql', 'add_b.sql'])).toThrow(/add_a\.sql[\s\S]*add_b\.sql/)
  })

  it('accepts dated names', () => {
    expect(() => assertOrderable(['20260201_a.sql', '20260322_b.sql'])).not.toThrow()
  })

  it('EVERY migration in this repo is dated — adding an undated one breaks apply order', () => {
    const names = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql'))
    expect(names.length).toBeGreaterThan(0)
    expect(() => assertOrderable(names)).not.toThrow()
  })
})

describe('runPending', () => {
  it('applies pending files in order and records each one', async () => {
    const db = new PGlite()
    const result = await runPending(adapt(db), [
      file('20260201_a.sql', 'CREATE TABLE a (id int);'),
      file('20260202_b.sql', 'CREATE TABLE b (id int);'),
    ])

    expect(result.failed).toBeUndefined()
    expect(result.applied).toEqual(['20260201_a.sql', '20260202_b.sql'])
    expect(await loadApplied(adapt(db))).toEqual(['20260201_a', '20260202_b'])

    const tables = await db.exec(
      "SELECT to_regclass('public.a') IS NOT NULL AS a, to_regclass('public.b') IS NOT NULL AS b",
    )
    expect(tables.at(-1)?.rows[0]).toEqual({ a: true, b: true })
  })

  it('is a no-op the second time — the same files do not re-apply', async () => {
    const db = new PGlite()
    const files = [file('20260201_a.sql', 'CREATE TABLE a (id int);')]
    await runPending(adapt(db), files)
    const second = await runPending(adapt(db), files)
    expect(second.applied).toEqual([])
    expect(second.pending).toEqual([])
  })

  it('stops at the first failure and does NOT record it', async () => {
    const db = new PGlite()
    const result = await runPending(adapt(db), [
      file('20260201_a.sql', 'CREATE TABLE a (id int);'),
      file('20260202_bad.sql', 'THIS IS NOT SQL;'),
      file('20260203_c.sql', 'CREATE TABLE c (id int);'),
    ])

    expect(result.applied).toEqual(['20260201_a.sql'])
    expect(result.failed?.name).toBe('20260202_bad.sql')
    // The tracker knows only about the file that actually succeeded...
    expect(await loadApplied(adapt(db))).toEqual(['20260201_a'])
    // ...and the migration AFTER the failure never ran, because it would be
    // assuming schema the failed one was supposed to create.
    const c = await db.exec("SELECT to_regclass('public.c') IS NOT NULL AS c")
    expect(c.at(-1)?.rows[0]).toEqual({ c: false })
  })

  it('resumes from the failed file once it is fixed', async () => {
    const db = new PGlite()
    const broken = [
      file('20260201_a.sql', 'CREATE TABLE a (id int);'),
      file('20260202_b.sql', 'THIS IS NOT SQL;'),
    ]
    await runPending(adapt(db), broken)

    const fixed = [broken[0], file('20260202_b.sql', 'CREATE TABLE b (id int);')]
    const result = await runPending(adapt(db), fixed)

    expect(result.applied).toEqual(['20260202_b.sql'])
    expect(await loadApplied(adapt(db))).toEqual(['20260201_a', '20260202_b'])
  })

  it('--dry-run reports pending without touching the database', async () => {
    const db = new PGlite()
    const result = await runPending(adapt(db), [file('20260201_a.sql', 'CREATE TABLE a (id int);')], {
      dryRun: true,
    })

    expect(result.pending).toEqual(['20260201_a.sql'])
    expect(result.applied).toEqual([])
    const a = await db.exec("SELECT to_regclass('public.a') IS NOT NULL AS a")
    expect(a.at(-1)?.rows[0]).toEqual({ a: false })
  })

  it('--baseline records files as applied WITHOUT running their SQL', async () => {
    const db = new PGlite()
    // Deliberately invalid SQL: baseline must never execute it.
    const result = await runPending(adapt(db), [file('20260201_a.sql', 'THIS WOULD FAIL;')], {
      baseline: true,
    })

    expect(result.failed).toBeUndefined()
    expect(await loadApplied(adapt(db))).toEqual(['20260201_a'])
  })

  it('after a baseline, only genuinely new files are pending', async () => {
    const db = new PGlite()
    const existing = [file('20260201_a.sql', 'THIS WOULD FAIL;')]
    await runPending(adapt(db), existing, { baseline: true })

    const withNew = [...existing, file('20260202_new.sql', 'CREATE TABLE n (id int);')]
    const result = await runPending(adapt(db), withNew)

    expect(result.applied).toEqual(['20260202_new.sql'])
  })
})

describe('identifyDatabase', () => {
  // On 2026-08-28 a migration meant for autoura-saas was pasted into this
  // product's Supabase project. It failed and rolled back, which was luck.
  it('recognises this product by its organizations table', async () => {
    const db = new PGlite()
    await db.exec('CREATE TABLE organizations (id int);')
    expect((await identifyDatabase(adapt(db))).verdict).toBe('ours')
  })

  it('recognises the sibling by tenants-without-organizations', async () => {
    const db = new PGlite()
    await db.exec('CREATE TABLE tenants (id int);')
    expect((await identifyDatabase(adapt(db))).verdict).toBe('sibling')
  })

  it('calls a database with neither table empty, not foreign', async () => {
    const db = new PGlite()
    expect((await identifyDatabase(adapt(db))).verdict).toBe('empty')
  })
})

describe('loadApplied read-only mode', () => {
  it('does not create the tracker when asked only to look', async () => {
    const db = new PGlite()
    expect(await loadApplied(adapt(db), { create: false })).toBeNull()

    const present = await db.exec(
      "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present",
    )
    expect(present.at(-1)?.rows[0]).toEqual({ present: false })
  })

  it('reads the tracker once it exists', async () => {
    const db = new PGlite()
    await runPending(adapt(db), [file('20260201_a.sql', 'CREATE TABLE a (id int);')])
    expect(await loadApplied(adapt(db), { create: false })).toEqual(['20260201_a'])
  })

  it('a dry run leaves no tracker behind', async () => {
    const db = new PGlite()
    await runPending(adapt(db), [file('20260201_a.sql', 'CREATE TABLE a (id int);')], {
      dryRun: true,
    })
    const present = await db.exec(
      "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present",
    )
    expect(present.at(-1)?.rows[0]).toEqual({ present: false })
  })
})

describe('checkTarget', () => {
  it('refuses the sibling product outright', () => {
    const verdict = checkTarget({ verdict: 'sibling', detail: '' })
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.reason).toMatch(/autoura-saas/)
  })

  it('refuses to baseline an empty database', () => {
    // Baselining an empty database records a schema as applied without ever
    // building it, and no later run would build it.
    const verdict = checkTarget({ verdict: 'empty', detail: '' }, { baseline: true })
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.reason).toMatch(/REFUSING to --baseline/)
  })

  it('allows a normal run against an empty database — that is a fresh install', () => {
    expect(checkTarget({ verdict: 'empty', detail: '' }, { baseline: false }).ok).toBe(true)
  })

  it('allows both modes against this product', () => {
    expect(checkTarget({ verdict: 'ours', detail: '' }).ok).toBe(true)
    expect(checkTarget({ verdict: 'ours', detail: '' }, { baseline: true }).ok).toBe(true)
  })
})

describe('the baseline must never be APPLIED to a database that has the schema', () => {
  // migrations/20260829_baseline_schema.sql is a pg_dump: bare CREATE TABLE,
  // CREATE POLICY, CREATE INDEX. Running it against production would fail
  // partway and record nothing. On such a database it must be RECORDED.
  const ours = { verdict: 'ours' as const, detail: '' }
  const empty = { verdict: 'empty' as const, detail: '' }
  const BASELINE = '20260829_baseline_schema.sql'

  it('recognises a baseline file by name', () => {
    expect(isBaselineFile(BASELINE)).toBe(true)
    expect(isBaselineFile('20260828_portal_chat.sql')).toBe(false)
    expect(isBaselineFile(null)).toBe(false)
  })

  it('refuses to run it at a database that already has the schema', () => {
    const v = checkBaselineSafety(ours, [BASELINE])
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.reason).toMatch(/--baseline/)
  })

  it('allows RECORDING it there — that is the correct action', () => {
    expect(checkBaselineSafety(ours, [BASELINE], { baseline: true }).ok).toBe(true)
  })

  it('allows running it against an empty database — that is a fresh install', () => {
    expect(checkBaselineSafety(empty, [BASELINE]).ok).toBe(true)
  })

  it('does not interfere when the baseline is already recorded', () => {
    expect(checkBaselineSafety(ours, ['20260901_something_new.sql']).ok).toBe(true)
    expect(checkBaselineSafety(ours, []).ok).toBe(true)
    expect(checkBaselineSafety(ours, null).ok).toBe(true)
  })
})

describe('the squashed migrations directory', () => {
  it('holds the baseline, and the archive is not replayed', () => {
    const top = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql'))
    expect(top.some(isBaselineFile)).toBe(true)

    // The runner reads the top level only, so archive/ is excluded by
    // construction rather than by a filter someone could remove.
    const archive = fs.readdirSync(path.join(MIGRATIONS, 'archive')).filter(f => f.endsWith('.sql'))
    expect(archive.length).toBeGreaterThan(100)
    expect(top).not.toEqual(expect.arrayContaining(archive))
  })

  it('every archived file is still dated, so history stays readable in order', () => {
    const archive = fs.readdirSync(path.join(MIGRATIONS, 'archive')).filter(f => f.endsWith('.sql'))
    expect(() => assertOrderable(archive)).not.toThrow()
  })
})
