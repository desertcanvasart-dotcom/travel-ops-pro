#!/usr/bin/env node
// ============================================
// MIGRATION RUNNER — CLI
// ============================================
// T1 of docs/plans/self-hosting.md.
//
// DATABASE_URL is the Postgres connection string of the target Supabase
// project (Dashboard → Settings → Database → Connection string).
//
//   DATABASE_URL=postgres://... node scripts/migrate.mjs             # apply pending
//   DATABASE_URL=postgres://... node scripts/migrate.mjs --status    # list state
//   DATABASE_URL=postgres://... node scripts/migrate.mjs --dry-run   # show pending
//   DATABASE_URL=postgres://... node scripts/migrate.mjs --baseline  # record ALL
//                              # files as applied WITHOUT running them — for a
//                              # database whose schema already matches the repo
//                              # (adopting the runner on an existing install)
//
// Files apply in name order; each carries its own BEGIN/COMMIT; the first
// failure stops the run and is NOT recorded, so a rerun retries it.
//
// Anything that writes (a plain run, or --baseline) first identifies the
// database and asks, unless --yes. --status and --dry-run never write and
// never prompt.

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import readline from 'node:readline/promises'
import { checkTarget, computePending, identifyDatabase, loadApplied, runPending } from './migrate-core.mjs'

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

function redactUrl(url) {
  try {
    const u = new URL(url)
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

async function confirmTarget(client, url, { baseline, assumeYes }) {
  const id = await identifyDatabase(client)

  console.log(`\nTarget: ${redactUrl(url)}`)
  console.log(`        ${id.detail}`)

  const verdict = checkTarget(id, { baseline })
  if (!verdict.ok) {
    console.error(`\n${verdict.reason}`)
    return false
  }

  if (assumeYes) return true

  const action = baseline
    ? 'RECORD all pending migrations as applied, without running them'
    : 'APPLY all pending migrations'
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`\nAbout to ${action}. Continue? [y/N] `)
  rl.close()
  if (answer.trim().toLowerCase() !== 'y') {
    console.log('Aborted.')
    return false
  }
  return true
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL is required (the target Supabase project's Postgres connection string).")
    process.exit(2)
  }

  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: url })
  await client.connect()

  try {
    const fileNames = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()

    if (args.has('--status')) {
      // Read-only: asking "what state is this in?" must not create the tracker.
      const applied = await loadApplied(client, { create: false })
      const id = await identifyDatabase(client)
      console.log(`${redactUrl(url)} — ${id.detail}`)
      if (applied === null) {
        console.log(`No schema_migrations table — this database has never been baselined.`)
        console.log(`${fileNames.length} migration file(s) in the repo, none recorded.`)
        return
      }
      const pending = computePending(fileNames, applied)
      console.log(`${applied.length} recorded, ${pending.length} pending`)
      for (const p of pending) console.log(`  pending  ${p}`)
      return
    }

    const dryRun = args.has('--dry-run')
    const baseline = args.has('--baseline')

    if (!dryRun) {
      const ok = await confirmTarget(client, url, { baseline, assumeYes: args.has('--yes') })
      if (!ok) {
        process.exitCode = 1
        return
      }
    }

    const files = fileNames.map(name => ({
      name,
      sql: readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'),
    }))

    const result = await runPending(client, files, {
      dryRun,
      baseline,
      log: line => console.log(line),
    })

    if (dryRun) {
      console.log(`${result.pending.length} pending`)
      for (const p of result.pending) console.log(`  would apply  ${p}`)
      return
    }
    if (result.failed) {
      console.error(`\nFAILED at ${result.failed.name}:`)
      console.error(result.failed.error.message ?? result.failed.error)
      console.error(
        `\n${result.applied.length} applied before the failure; the failed file was NOT recorded — fix and rerun.`
      )
      process.exit(1)
    }
    console.log(
      result.applied.length === 0
        ? 'Nothing to do — up to date.'
        : `Done: ${result.applied.length} migration(s).`
    )
  } finally {
    await client.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
