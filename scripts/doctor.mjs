#!/usr/bin/env node
// ============================================
// doctor — what is wrong with this install
// ============================================
// T4 of docs/plans/self-hosting.md. The half of the support bundle that works
// when the app does NOT, which is exactly when it matters: it talks to Postgres
// directly and reads the migration files off disk, so it needs neither a
// running server nor anything we host.
//
//   npm run doctor                            # check, print findings
//   npm run doctor -- --bundle                # also write support-bundle.json
//   npm run doctor -- --logs /var/log/app.log # include that log, scrubbed
//
// Reads configuration from the environment, and from .env.local when present.
// It has to: docs/SELF-HOSTING.md tells the operator to run `npm run doctor`,
// which is plain node, which does NOT read .env.local — so on a correctly
// configured install the doctor reported "required environment variables are
// missing" and called a working install broken. Found by standing one up.
// Real environment variables always win; the file only fills in gaps.
//
// IT SENDS NOTHING ANYWHERE. It prints, and optionally writes a file the
// operator reads and then chooses to send. A diagnostic tool that phoned home
// on its own would be a surprise, and surprises here are security bugs.
//
// It sees ONE thing the endpoint cannot: which migrations are PENDING. That
// needs the migration files, and those are not in a built image.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { buildBundle, bundleFindings, reportEnv } from '../lib/support/bundle-core.mjs'
import { JOB_NAMES, SCHEDULED_IN_PROCESS } from '../lib/support/job-names.mjs'
import { computePending, loadApplied } from './migrate-core.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
  } catch {
    return 'unknown'
  }
})()
const MIGRATIONS = path.join(ROOT, 'migrations')

/**
 * Merge .env.local into process.env WITHOUT overriding anything already set.
 *
 * Deliberately minimal: KEY=VALUE, optional surrounding quotes, # comments
 * ignored. Enough for a diagnostic to see the same configuration the app does,
 * and not so much that it becomes a second dotenv implementation to maintain.
 */
function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    const [, key, raw] = m
    if (process.env[key] !== undefined) continue
    process.env[key] = raw.trim().replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

const args = new Set(process.argv.slice(2))
const flagValue = name => {
  const argv = process.argv.slice(2)
  const i = argv.indexOf(name)
  return i === -1 ? null : (argv[i + 1] ?? null)
}

/** Every check prints a pass/fail line, then the findings explain them. */
function line(ok, label, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

async function probeDatabase() {
  const database = {
    reachable: false,
    latencyMs: null,
    migrationsApplied: null,
    migrationsPending: null,
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    // NOT a failure. DATABASE_URL is an operator credential supplied for the
    // command that needs it; docs/SELF-HOSTING.md explicitly says not to leave
    // it in .env.local. Reporting "database unreachable" here would be a false
    // alarm, and worse, would send the reader to check the wrong variables.
    database.notChecked = 'DATABASE_URL was not provided, so migrations and job history were not checked'
    return database
  }

  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: url })
  const started = Date.now()
  try {
    await client.connect()
    const applied = await loadApplied(client, { create: false })
    database.latencyMs = Date.now() - started
    database.reachable = true
    if (applied === null) {
      database.migrationsApplied = 0
      database.error = 'no schema_migrations table — this database has never been baselined'
      return database
    }
    database.migrationsApplied = applied.length
    const files = existsSync(MIGRATIONS)
      ? readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql'))
      : []
    database.migrationsPending = files.length ? computePending(files, applied) : []
  } catch (err) {
    database.latencyMs = Date.now() - started
    database.error = err instanceof Error ? err.message : String(err)
  } finally {
    try {
      await client.end()
    } catch {
      /* already closed */
    }
  }
  return database
}

async function probeJobRuns() {
  const url = process.env.DATABASE_URL
  // Without DATABASE_URL this is unknowable, and "0 of 8 have ever run" would
  // be a claim rather than a measurement. Return null and say so.
  if (!url) return null

  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: url })
  const latest = new Map()
  try {
    await client.connect()
    const { rows } = await client.query(
      'SELECT job_name, started_at, outcome FROM job_runs ORDER BY started_at DESC LIMIT 200'
    )
    for (const row of rows) {
      if (latest.has(row.job_name)) continue
      latest.set(row.job_name, {
        lastRun: row.started_at?.toISOString?.() ?? String(row.started_at),
        lastOutcome: row.outcome ?? 'unfinished',
      })
    }
  } catch {
    // No table, no rows. Every job reports as never run, which is true enough:
    // nothing here has recorded one.
  } finally {
    try {
      await client.end()
    } catch {
      /* already closed */
    }
  }
  return JOB_NAMES.map(name => ({
    name,
    lastRun: latest.get(name)?.lastRun ?? null,
    lastOutcome: latest.get(name)?.lastOutcome ?? null,
    scheduledInProcess: SCHEDULED_IN_PROCESS.includes(name),
  }))
}

/**
 * Can anyone administer this install?
 *
 * Roles come from `organization_members` and nowhere else (lib/auth/roles.ts),
 * and middleware.ts treats no membership as `viewer` — which is allowed one
 * route. An install with no organisation, or one whose organisation has no
 * owner, therefore looks completely healthy from every other check here while
 * being unusable: Settings is admin-only, so the operator cannot even reach the
 * page that would fix it.
 *
 * This lives in the doctor rather than in the support bundle on purpose. The
 * bundle endpoint requires an admin, so on precisely this install it answers
 * 403 — a diagnosis nobody can read is not a diagnosis.
 */
async function probeOwnership() {
  const url = process.env.DATABASE_URL
  if (!url) return null

  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: url })
  try {
    await client.connect()
    const { rows } = await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.organizations) AS orgs,
        (SELECT count(*)::int FROM public.organization_members WHERE role = 'owner') AS owners,
        (SELECT count(*)::int FROM auth.users) AS users,
        (SELECT count(*)::int FROM auth.users u
           LEFT JOIN public.user_profiles p ON p.id = u.id
          WHERE p.id IS NULL) AS users_without_profile
    `)
    return rows[0]
  } catch (err) {
    // A missing table is itself an answer, but not one worth guessing at: the
    // migration check above already reports a schema that is not built.
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    try {
      await client.end()
    } catch {
      /* already closed */
    }
  }
}

function readLogTail(file) {
  if (!file) return []
  try {
    // Scrubbed by redactErrorLines before it goes anywhere near the bundle.
    return readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-200)
  } catch (err) {
    return [`could not read ${file}: ${err instanceof Error ? err.message : err}`]
  }
}

async function main() {
  console.log('Autoura doctor\n')

  const env = reportEnv(process.env)
  line(env.missingRequired.length === 0, 'required environment variables',
    env.missingRequired.length ? `missing: ${env.missingRequired.join(', ')}` : `${env.set.length} set`)

  const database = await probeDatabase()
  if (database.notChecked) {
    console.log(`  skip  database and migrations  — ${database.notChecked}`)
  } else {
    line(database.reachable, 'database reachable',
      database.reachable ? `${database.latencyMs}ms` : (database.error ?? 'unknown'))
    if (database.reachable) {
      line(
        (database.migrationsPending?.length ?? 0) === 0,
        'migrations up to date',
        `${database.migrationsApplied} applied, ${database.migrationsPending?.length ?? '?'} pending`
      )
    }
  }

  const ownership = await probeOwnership()
  if (ownership === null) {
    console.log('  skip  the install has an owner  — needs DATABASE_URL')
  } else if (ownership.error) {
    line(false, 'the install has an owner', ownership.error)
  } else if (ownership.users === 0) {
    // Nobody has signed up yet. That is what a just-migrated install looks
    // like, not a fault — and calling it one would send the operator hunting
    // for a problem that the next thing they do fixes.
    console.log('  ok    the install has an owner  — no accounts yet; the first signup becomes the owner')
  } else {
    line(
      ownership.orgs > 0 && ownership.owners > 0,
      'the install has an owner',
      `${ownership.orgs} organisation(s), ${ownership.owners} owner(s)`
    )
  }

  const crons = await probeJobRuns()
  if (crons === null) {
    console.log('  skip  scheduled jobs  — needs DATABASE_URL')
  } else {
    const ranEver = crons.filter(c => c.lastRun !== null).length
    line(ranEver > 0, 'scheduled jobs have run', `${ranEver} of ${crons.length} have ever run`)
  }

  const bundle = buildBundle({
    generatedAt: new Date().toISOString(),
    version: PKG_VERSION,
    sha: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? 'unknown',
    node: process.version,
    uptimeSeconds: null,
    database,
    env: process.env,
    integrations: {},
    crons: crons ?? [],
    counts: {},
    errors: readLogTail(flagValue('--logs')),
  })

  const findings = [...bundleFindings(bundle)]
  if (ownership && !ownership.error && ownership.users > 0) {
    const pending = database.migrationsPending?.length ?? 0
    if (ownership.orgs === 0) {
      findings.unshift(
        pending > 0
          ? `This install has ${ownership.users} account(s) and no organisation, so nobody can administer it: roles come from organization_members, and no membership means viewer, which is allowed only /dashboard. ${pending} migration(s) are pending — run npm run migrate. 20260831_first_user_bootstrap makes the earliest account the owner.`
          : `This install has ${ownership.users} account(s) and no organisation, so nobody can administer it: roles come from organization_members, and no membership means viewer, which is allowed only /dashboard. Migrations are up to date, which should not leave it in this state — create the organisation and grant ownership directly: INSERT INTO organizations (name) VALUES (''); INSERT INTO organization_members (org_id, user_id, role) VALUES (<that id>, <user id>, 'owner');`
      )
    } else if (ownership.owners === 0) {
      findings.unshift(
        `This install has ${ownership.orgs} organisation(s) and no owner at all. Nobody clears an admin-only gate, so Settings and team management are unreachable. Grant one: INSERT INTO organization_members (org_id, user_id, role) VALUES (<org>, <user>, 'owner').`
      )
    }
    if (ownership.users_without_profile > 0) {
      findings.push(
        `${ownership.users_without_profile} account(s) exist with no user_profiles row. They can sign in and then fail every gate, because the middleware reads is_active from a row that is not there. Applying migrations backfills them.`
      )
    }
  }

  console.log('\nfindings:')
  for (const f of findings) console.log(`  - ${f}`)

  if (args.has('--bundle')) {
    const out = path.join(process.cwd(), 'support-bundle.json')
    writeFileSync(out, JSON.stringify({ bundle, findings }, null, 2))
    console.log(`\nwrote ${out}`)
    console.log('Read it before you send it. Nothing was sent anywhere by this script.')
  }

  // Exit non-zero only for things that make the install unusable, so this can
  // be a smoke check after an upgrade. A stopped scheduler is a finding, not a
  // failed install.
  // An install nobody can administer IS unusable — the same class as a missing
  // variable or an unreachable database, not a finding to read past.
  const unowned =
    ownership &&
    !ownership.error &&
    ownership.users > 0 &&
    (ownership.orgs === 0 || ownership.owners === 0)
  const broken =
    env.missingRequired.length > 0 || (!database.notChecked && !database.reachable) || unowned
  process.exitCode = broken ? 1 : 0
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
