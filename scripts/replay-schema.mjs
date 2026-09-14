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

// The replay itself — the prelude, the exemptions and the file loop — lives in
// replay-core.mjs so this CLI is not its only reader: a test asks the same
// rebuilt schema which tables carry a supplier_id or a property_id, and must
// get the same answer this gate does.
import { replayMigrations, EXEMPT } from './replay-core.mjs'


async function main() {
  const showAll = process.argv.includes('--all')

  const { db, files, applied, failed, skipped } = await replayMigrations()

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

  // -------------------------------------------------------------------------
  // THE FIRST SIGNUP
  // -------------------------------------------------------------------------
  // Counting tables proves a schema exists. It does not prove the install can
  // be used, and at v2026.08.29-6 every count below passed on a database where
  // the first person to sign up became a viewer of nothing: no profile, no
  // organisation, no membership, and every page except the dashboard bouncing
  // to /dashboard?error=unauthorized. The operator could not reach Settings to
  // name their own agency, and could not pull a support bundle to find out why.
  //
  // So insert an auth user the way GoTrue does, and ask the schema what it did
  // about it. This is the cheapest possible end-to-end fact: it needs no app,
  // no server and no browser, and it is the first thing that happens on every
  // install that ever succeeds.
  const FIRST = '00000000-0000-4000-8000-0000000000ff'
  const signup = { ok: false, detail: 'not run' }
  try {
    await db.exec(
      `INSERT INTO auth.users (id, email, raw_user_meta_data)
       VALUES ('${FIRST}', 'first-signup@example.test', '{"full_name": "First Owner"}'::jsonb);`
    )
    const { rows } = await db.query(`
      SELECT
        (SELECT count(*)::int FROM public.user_profiles WHERE id = '${FIRST}')       AS profile,
        (SELECT count(*)::int FROM public.organizations)                             AS orgs,
        (SELECT count(*)::int FROM public.organization_members
          WHERE user_id = '${FIRST}' AND role = 'owner')                             AS owner
    `)
    const r = rows[0]
    const missing = []
    if (r.profile !== 1) missing.push('no user_profiles row')
    if (r.orgs !== 1) missing.push(`${r.orgs} organisation(s), expected 1`)
    if (r.owner !== 1) missing.push('not an owner of it')
    signup.ok = missing.length === 0
    signup.detail = signup.ok
      ? 'profile created, organisation created, signed up as its owner'
      : missing.join('; ')
  } catch (error) {
    signup.detail = String(error.message).split('\n')[0]
  }

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

  console.log('')
  console.log('--- the first signup ---')
  console.log(`  ${signup.ok ? 'ok  ' : 'FAIL'}  ${signup.detail}`)
  if (!signup.ok) {
    console.log('  A fresh install whose first user is not the owner cannot be used:')
    console.log('  membership is the only role authority, and no membership means viewer.')
  }

  if (short.length) {
    console.log('')
    console.log('SCHEMA IS SHORT OF EXPECTATIONS:')
    for (const [k, min] of short) console.log(`  ${k}: ${counts[k]}, expected at least ${min}`)
    console.log('The migrations applied without error but did not build what they should.')
  }

  process.exitCode = failed.length === 0 && short.length === 0 && signup.ok ? 0 : 1
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
