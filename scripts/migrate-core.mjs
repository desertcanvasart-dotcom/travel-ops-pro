// ============================================
// MIGRATION RUNNER — core logic
// ============================================
// T1 of docs/plans/self-hosting.md. Ported from the sibling (autoura-saas
// scripts/migrate-core.mjs) so the two do not diverge — read that one before
// changing this one.
//
// The convention here was hand-pasting migrations/*.sql into the Supabase SQL
// editor in whatever order somebody remembered. That works exactly once, for
// the person who remembers. This runner makes the same contract executable:
// apply every unrecorded file in order, record it, stop loudly on the first
// failure without recording it.
//
// This module is client-agnostic — the CLI (migrate.mjs) wires a real pg
// client; the tests wire PGlite. A client is anything with
// `query(text, params?) -> Promise<{ rows }>`, allowing multi-statement text.

/**
 * Recorded names tolerate both spellings ('20260203_x' and '20260203_x.sql'),
 * because a human hand-recording a row will not reliably pick one.
 */
export function normalizeName(name) {
  return String(name).replace(/\.sql$/i, '')
}

// ---------------------------------------------------------------------------
// ORDERING
// ---------------------------------------------------------------------------
// The sibling can sort by filename because every one of its migrations carries
// a numeric prefix. This repo cannot: 114 files are date-prefixed
// (20260203_x.sql) and 11 legacy files are bare (create_bookings_tables.sql).
// Digits sort before letters, so a plain sort puts the 11 OLDEST files LAST —
// and two of them (b2b_quotes_itinerary_bridge, add_generation_warnings) are
// not even oldest, they interleave with the dated ones.
//
// Those 11 were renamed to their true dates in the T1 commit, which was safe
// exactly once: no database had ever recorded a migration name, because no
// tracker existed. After a baseline, renaming a file means the tracker holds a
// name no file has, and the runner tries to re-apply schema that is already
// there.
//
// So: filenames are the ordering, and this guard is what keeps that true.
// It refuses to run rather than guess an order that might be wrong.
const DATED = /^(\d{8})_/

export function assertOrderable(fileNames) {
  const undated = fileNames.filter(f => f.endsWith('.sql') && !DATED.test(f))
  if (undated.length > 0) {
    throw new Error(
      `Cannot determine apply order: ${undated.length} migration file(s) have no YYYYMMDD_ prefix.\n` +
        undated.map(f => `  ${f}`).join('\n') +
        `\n\nEvery migration must be named YYYYMMDD_description.sql so that sorting by\n` +
        `name is the apply order. Rename these BEFORE any database is baselined —\n` +
        `once a name is recorded in schema_migrations, renaming its file makes the\n` +
        `runner try to re-apply it. See docs/plans/self-hosting.md (T1).`
    )
  }
}

/** Files not yet recorded, in apply order. */
export function computePending(fileNames, appliedNames) {
  const sqlFiles = [...fileNames].filter(f => f.endsWith('.sql'))
  assertOrderable(sqlFiles)
  const applied = new Set(appliedNames.map(normalizeName))
  return sqlFiles.sort().filter(f => !applied.has(normalizeName(f)))
}

export const TRACKER_BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

/**
 * Recorded migration names.
 *
 * `create: false` is for read-only inspection (--status): it will not bring the
 * tracker into existence as a side effect of being asked a question, and
 * returns null when there is none yet. Anything that WRITES creates it.
 */
export async function loadApplied(client, { create = true } = {}) {
  if (create) {
    await client.query(TRACKER_BOOTSTRAP)
  } else {
    const { rows } = await client.query(
      "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present",
    )
    if (!rows[0]?.present) return null
  }
  const { rows } = await client.query('SELECT name FROM schema_migrations ORDER BY name')
  return rows.map(r => r.name)
}

// ---------------------------------------------------------------------------
// WHICH DATABASE IS THIS?
// ---------------------------------------------------------------------------
// On 2026-08-28 a migration meant for autoura-saas was pasted into
// travel-ops-pro's Supabase project. It failed and rolled back, which was luck
// rather than design — a migration that happened to be valid against both
// schemas would have applied silently to the wrong product.
//
// The two schemas are distinguishable: this product has `organizations`, the
// sibling has `tenants`. Cheap to check, and it catches the one mistake we
// have actually made.
export async function identifyDatabase(client) {
  const { rows } = await client.query(`
    SELECT
      to_regclass('public.organizations') IS NOT NULL AS has_organizations,
      to_regclass('public.tenants')       IS NOT NULL AS has_tenants
  `)
  const { has_organizations: org, has_tenants: tenants } = rows[0] ?? {}
  if (tenants && !org) return { verdict: 'sibling', detail: 'has `tenants`, no `organizations` — this looks like autoura-saas' }
  if (org) return { verdict: 'ours', detail: 'has `organizations`' }
  return { verdict: 'empty', detail: 'neither `organizations` nor `tenants` — an empty or brand-new database' }
}

/**
 * Should this run be allowed to write to this database?
 *
 * Pure, so the refusals are testable rather than only asserted in the CLI.
 *
 * @returns { ok: true } | { ok: false, reason: string }
 */
export function checkTarget(identity, { baseline = false } = {}) {
  if (identity.verdict === 'sibling') {
    return {
      ok: false,
      reason:
        'REFUSING: this looks like autoura-saas, not travel-ops-pro.\n' +
        'These are different products with different schemas. A migration from\n' +
        'this repo does not belong here. Check DATABASE_URL.',
    }
  }
  if (baseline && identity.verdict === 'empty') {
    return {
      ok: false,
      reason:
        'REFUSING to --baseline an empty database.\n' +
        '--baseline records every migration as applied WITHOUT running it. On an\n' +
        'empty database that produces a tracker claiming a schema that is not\n' +
        'there, and no later run will ever build it. Run without --baseline.',
    }
  }
  return { ok: true }
}

/**
 * Apply (or in baseline mode, merely record) every pending migration.
 *
 * @param client   { query(text, params?) }
 * @param files    Array<{ name: string, sql: string }> — ALL repo migrations
 * @param options  { dryRun?, baseline?, log? }
 * @returns { applied: string[], pending: string[], failed?: { name, error } }
 */
export async function runPending(client, files, options = {}) {
  const { dryRun = false, baseline = false, log = () => {} } = options
  // A dry run must not bring the tracker into existence — "what would happen?"
  // is a question, and a question that changes the database is a bad question.
  const appliedNames = (await loadApplied(client, { create: !dryRun })) ?? []
  const byName = new Map(files.map(f => [f.name, f]))
  const pending = computePending(files.map(f => f.name), appliedNames)

  if (dryRun) return { applied: [], pending }

  const applied = []
  for (const name of pending) {
    const file = byName.get(name)
    if (baseline) {
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [normalizeName(name)])
      applied.push(name)
      log(`baseline  ${name}`)
      continue
    }
    try {
      await client.query(file.sql)
    } catch (error) {
      // Stop HERE: later migrations assume this one's schema. Nothing is
      // recorded for the failed file, so a rerun retries it.
      return { applied, pending: pending.slice(applied.length), failed: { name, error } }
    }
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [normalizeName(name)])
    applied.push(name)
    log(`applied   ${name}`)
  }
  return { applied, pending: [] }
}
