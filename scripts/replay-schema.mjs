#!/usr/bin/env node
// ============================================
// FROM-SCRATCH SCHEMA REPLAY
// ============================================
// T3 of docs/plans/self-hosting.md. Builds the entire schema from nothing by
// replaying migrations/*.sql in order against a real Postgres (PGlite), and
// reports exactly how far it gets.
//
//   npm run replay:schema            # summary
//   npm run replay:schema -- --all   # every failure, not just the first few
//
// WHY THIS EXISTS. These migrations were written against a database that
// already existed. Nobody has ever asked them to build one.
//
// Measured 2026-08-29, before any baseline schema existed:
//
//     applied  17 / 125      failed 107      exempt 1
//     102x  relation "..." does not exist
//       5x  function public.user_is_in_org(uuid) does not exist
//
// Those five are cascade — the one migration that defines that function is
// itself among the 102. So EVERY remaining failure has a single cause: there
// is no CREATE TABLE anywhere for itineraries, clients, invoices, payments or
// suppliers. The migration set is a change log, not a schema definition.
//
// The prelude below already removed every environmental excuse; what is left
// is the real gap, and it is the gap a reconstructed baseline closes.
//
// It now models what the RUNNER does, not just what the files say — including
// creating the tracker table first, because that is what a real install has
// when the first migration runs.
//
// THAT IS NOW FIXED and this script is a CI gate. migrations/ holds the
// baseline schema (a pg_dump of production, T3 step 1) plus anything added
// after it; the 125 historical files moved to migrations/archive/ and are never
// replayed. A fresh install is exactly what this script builds.

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import { TRACKER_BOOTSTRAP } from './migrate-core.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = path.join(ROOT, 'migrations')

// ---------------------------------------------------------------------------
// THE SUPABASE PRELUDE
// ---------------------------------------------------------------------------
// A Supabase project hands the schema a few things before any migration runs:
// the `auth` schema, the three API roles, and `auth.users`. A bare Postgres has
// none of them, and without them eight migrations fail for reasons that have
// nothing to do with whether they are correct.
//
// The sibling's answer was to EXEMPT those files. Stubbing is better: an
// exempted migration is never tested at all, whereas a stubbed environment
// still runs it. Only stub what Supabase genuinely provides — anything more and
// the replay stops being evidence about a real install.
const PRELUDE = `
  CREATE SCHEMA IF NOT EXISTS auth;
  -- Supabase installs extensions into their own schema, and the schema dump
  -- refers to extensions.uuid_generate_v4() in column defaults.
  CREATE SCHEMA IF NOT EXISTS extensions;
  DO $$ BEGIN CREATE ROLE anon;          EXCEPTION WHEN duplicate_object THEN END $$;
  DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN END $$;
  DO $$ BEGIN CREATE ROLE service_role;  EXCEPTION WHEN duplicate_object THEN END $$;
  CREATE EXTENSION IF NOT EXISTS pgcrypto    WITH SCHEMA extensions;
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
  -- Supabase's real auth.users has far more columns; migrations here only ever
  -- reference it by id for foreign keys.
  CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    email text
  );
  -- auth.uid() is Supabase's "who is calling", read by 28 of these migrations
  -- inside RLS policies. It reads a request-scoped JWT claim that does not
  -- exist here, so the stub returns NULL — which is exactly what it returns
  -- for an unauthenticated caller. Policies still compile and install; what
  -- this replay proves is that the SCHEMA builds, not that RLS admits the
  -- right people. That needs a different test.
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $fn$ SELECT NULL::uuid $fn$;
`

// ---------------------------------------------------------------------------
// EXEMPTIONS
// ---------------------------------------------------------------------------
// A file here is NOT tested. Each needs a reason that is about the test
// environment, never about the migration being inconvenient — an exemption
// added to make the numbers look better is a lie told to the next person.
// Empty, and that is the goal. The one file that needed an exemption
// (20260628_copilot_knowledge_rag.sql, which requires pgvector) is now in
// migrations/archive/ and is not replayed; the baseline deliberately excludes
// its pgvector-typed objects so this runs anywhere.
const EXEMPT = new Map([])

async function main() {
  const showAll = process.argv.includes('--all')
  const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()

  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } })
  await db.exec(PRELUDE)

  // The RUNNER creates schema_migrations before applying anything, so a real
  // install already has that table when the first migration runs. Replaying
  // without it missed a genuine bug: the baseline dump still contained
  // `CREATE TABLE schema_migrations` (production had been baselined when the
  // dump was taken), and a from-scratch install died on "already exists".
  // A green replay must mean what a real install would do.
  await db.exec(TRACKER_BOOTSTRAP)

  const applied = []
  const failed = []
  const skipped = []

  for (const name of files) {
    if (EXEMPT.has(name)) {
      skipped.push(name)
      continue
    }
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS, name), 'utf8'))
      // Exactly what scripts/migrate-core.mjs does after each file. This used
      // to be a workaround living only here, which is why the harness stayed
      // green while a real install failed on the same session poisoning: the
      // test fixed the problem the product still had. It belongs in the runner,
      // and this line now mirrors it rather than compensating for its absence.
      await db.exec("SELECT pg_catalog.set_config('search_path', 'public', false);")
      applied.push(name)
    } catch (error) {
      failed.push({ name, message: String(error.message).split('\n')[0] })
      // A failed statement poisons the session until the transaction ends.
      // Roll back so the NEXT file is judged on its own merits.
      try {
        await db.exec('ROLLBACK')
      } catch {
        /* nothing open */
      }
    }
  }

  // "N files applied" is weak evidence — an empty file would satisfy it. Count
  // what actually got built, and refuse to call a hollow schema a pass.
  const counts = {}
  for (const [label, query] of [
    ['tables', "SELECT count(*)::int c FROM pg_tables WHERE schemaname = 'public'"],
    ['views', "SELECT count(*)::int c FROM pg_views WHERE schemaname = 'public'"],
    ['indexes', "SELECT count(*)::int c FROM pg_indexes WHERE schemaname = 'public'"],
    ['policies', "SELECT count(*)::int c FROM pg_policies WHERE schemaname = 'public'"],
    [
      'functions',
      "SELECT count(*)::int c FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'",
    ],
  ]) {
    try {
      counts[label] = (await db.query(query)).rows[0].c
    } catch {
      counts[label] = -1
    }
  }

  // Floors, not exact numbers: this must not fail every time somebody adds a
  // table. It exists to catch a baseline that silently stopped short.
  const FLOORS = { tables: 150, views: 15, indexes: 600, policies: 250, functions: 60 }
  const short = Object.entries(FLOORS).filter(([k, min]) => counts[k] < min)

  console.log(`migrations:  ${files.length}`)
  console.log(`applied:     ${applied.length}`)
  console.log(`failed:      ${failed.length}`)
  console.log(`exempt:      ${skipped.length}`)

  if (failed.length) {
    console.log('')
    const shown = showAll ? failed : failed.slice(0, 10)
    console.log(`--- failures${showAll ? '' : ` (first ${shown.length}; --all for the rest)`} ---`)
    for (const f of shown) console.log(`  ${f.name}\n      ${f.message}`)

    const kinds = {}
    for (const f of failed) {
      const key = f.message.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N').slice(0, 70)
      kinds[key] = (kinds[key] || 0) + 1
    }
    console.log('')
    console.log('--- kinds ---')
    for (const [k, n] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}x  ${k}`)
    }

    const missingRelation = failed.filter(f => /relation ".*" does not exist/.test(f.message)).length
    if (missingRelation > 0) {
      console.log('')
      console.log(
        `${missingRelation} failure(s) are "relation does not exist". That is the\n` +
          `known gap, not a defect in these files: no migration creates the base\n` +
          `tables. Until T3 step 1 lands a baseline schema, this is expected —\n` +
          `see docs/plans/self-hosting.md.`
      )
    }
  }

  if (skipped.length) {
    console.log('')
    console.log('--- exempt, with reasons ---')
    for (const name of skipped) console.log(`  ${name}\n      ${EXEMPT.get(name)}`)
  }

  console.log('')
  console.log('--- schema built ---')
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(10)} ${v}`)

  if (short.length) {
    console.log('')
    console.log('SCHEMA IS SHORT OF EXPECTATIONS:')
    for (const [k, min] of short) console.log(`  ${k}: ${counts[k]}, expected at least ${min}`)
    console.log('The migrations applied without error but did not build what they should.')
  }

  process.exitCode = failed.length === 0 && short.length === 0 ? 0 : 1
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
