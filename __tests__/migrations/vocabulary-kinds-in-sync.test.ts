// VOCABULARY_KINDS and the database's CHECK must agree.
//
// A vocabulary kind is written down twice: once in lib/vocabulary.ts, which is
// what the app offers, and once in the `kind IN (...)` CHECK on
// org_vocabularies, which is what the database will accept. Nothing forced
// them to agree, and the failure is asymmetric and silent in both directions:
//
//   in the app, not in the CHECK — Settings renders the list, the agency adds
//     an entry, and the INSERT is refused by a constraint. The feature looks
//     built and does not work.
//   in the CHECK, not in the app — rows can exist that nothing will ever show,
//     so an agency's words sit in a table nobody reads.
//
// This was a live risk while migration 20261010 was being written: three kinds
// had to be added to both places by hand, and a slip in either would have
// shipped. The CHECK is read from the schema the migrations actually build
// (replayed into PGlite, no credentials), so this needs no database and cannot
// drift from what a fresh install gets.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { VOCABULARY_KINDS } from '@/lib/vocabulary'
import { replayMigrations } from '@/scripts/replay-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

let db: { query(sql: string): Promise<{ rows: any[] }>; close(): Promise<void> }
let checkKinds: string[]

beforeAll(async () => {
  const replay = await replayMigrations()
  db = replay.db
  expect(replay.failed, 'migrations did not replay cleanly').toEqual([])

  const { rows } = await db.query(`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.org_vocabularies'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%kind = ANY%'`)
  // The list constraint specifically — org_vocabularies_behavior_scope also
  // mentions `kind` but constrains `behavior`. One match, or the migrations
  // have left two kind lists fighting each other.
  expect(rows.length, 'expected exactly one kind-list CHECK on org_vocabularies').toBe(1)
  checkKinds = [...String(rows[0].def).matchAll(/'([a-z_]+)'::text/g)].map(m => m[1])
  expect(checkKinds.length, 'could not parse the kinds out of the CHECK').toBeGreaterThan(30)
})

afterAll(async () => {
  await db?.close()
})

describe('vocabulary kinds', () => {
  it('every kind the app offers is one the database will accept', () => {
    const missing = VOCABULARY_KINDS.filter(k => !checkKinds.includes(k))
    expect(
      missing,
      `these kinds are in lib/vocabulary.ts but not in the org_vocabularies CHECK, so adding one in Settings would be refused: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('every kind the database accepts is one the app can show', () => {
    const orphaned = checkKinds.filter(k => !(VOCABULARY_KINDS as readonly string[]).includes(k))
    expect(
      orphaned,
      `the CHECK admits kinds the app never lists, so rows could exist that nothing renders: ${orphaned.join(', ')}`,
    ).toEqual([])
  })

  it('the CHECK names each kind once', () => {
    expect(new Set(checkKinds).size).toBe(checkKinds.length)
  })
})
