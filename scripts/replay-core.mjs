#!/usr/bin/env node
// ============================================
// REPLAYING migrations/ INTO A REAL POSTGRES
// ============================================
// The mechanics behind `npm run replay:schema` (scripts/replay-schema.mjs),
// factored out so more than one caller can ask the same question — "what does
// a fresh install's schema actually look like?" — and get the same answer.
//
// The CLI uses it to gate CI. __tests__/lib/csv-link-columns.test.ts uses it
// as the SOURCE OF TRUTH for which rate tables have a supplier_id or a
// property_id, because a CSV that drops a link column turns
// export -> delete -> re-import into silent data loss and nothing else in the
// repo can state that invariant honestly: types/database.types.ts is generated
// from live production by hand and had drifted behind migrations/ (no
// supplier_code in it at all, five months after the column shipped), whereas
// these files are committed, replayed on every CI run, and ARE what a
// self-hosted install gets.

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import { TRACKER_BOOTSTRAP } from './migrate-core.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const MIGRATIONS = path.join(ROOT, 'migrations')

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
export const PRELUDE = `
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
    email text,
    -- Both of these are genuinely Supabase's, and both are read by the trigger
    -- that turns a new auth user into a profile (and, on a virgin install, an
    -- owner). Without them here the replay could not exercise the one thing a
    -- fresh install does first.
    raw_user_meta_data jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
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
export const EXEMPT = new Map([])

/** The migration files, in the order the runner applies them. */
export function migrationFiles() {
  return readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
}

/**
 * Build the whole schema from nothing by replaying migrations/ in order.
 *
 * Returns the live database alongside what happened, so a caller can both
 * report on the replay and go on to ask the schema questions. Close `db`
 * when done.
 */
export async function replayMigrations() {
  const files = migrationFiles()

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

  return { db, files, applied, failed, skipped }
}

/** Every public table mapped to its column names, straight out of the
 *  catalogue of the database this replay just built. */
export async function publicTableColumns(db) {
  const { rows } = await db.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `)
  const out = new Map()
  for (const r of rows) {
    if (!out.has(r.table_name)) out.set(r.table_name, new Set())
    out.get(r.table_name).add(r.column_name)
  }
  return out
}
