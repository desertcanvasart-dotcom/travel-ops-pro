// AUT-W01: the Record Payment form discarded every submission. Its state
// initialises `due_date: ''`, a "Full payment" never fills a due date, and
// `due_date` is `timestamp without time zone` in production — so Postgres
// rejected the insert with 22007 and no payment was ever written.
//
// The first test below is the actual reproduction, against a real Postgres via
// PGlite using the production column types. It fails without the fix.
import { describe, it, expect, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { blankToNull } from '@/lib/blank-to-null'

// PGlite boots a real Postgres per instance — roughly a second each, and slower
// when vitest is running other suites in parallel. The 5s default is a timing
// assumption, not a correctness one, and it started failing on main once a
// second PGlite-backed suite landed alongside this one. Raised deliberately and
// scoped to this file, so a genuine hang elsewhere still fails fast.
vi.setConfig({ testTimeout: 30_000 })

/** The `payments` shape as production actually has it (verified 2026-08-29). */
const PAYMENTS_DDL = `
  CREATE TABLE payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    itinerary_id uuid NOT NULL,
    payment_type varchar NOT NULL,
    amount numeric NOT NULL,
    currency varchar,
    payment_method varchar,
    payment_status varchar,
    transaction_reference varchar,
    payment_date timestamp,
    due_date timestamp,
    notes text,
    org_id uuid NOT NULL
  );
`

/** Exactly what the form posts for a full payment with no due date entered. */
const formBody = () => ({
  itinerary_id: '11111111-1111-1111-1111-111111111111',
  payment_type: 'full',
  amount: 500,
  currency: '',
  payment_method: 'bank_transfer',
  payment_status: 'completed',
  transaction_reference: 'QA-TEST-TXN-002',
  payment_date: '2026-08-29',
  due_date: '',
  notes: 'test',
  org_id: '22222222-2222-2222-2222-222222222222',
})

async function insert(db: PGlite, body: Record<string, unknown>) {
  const cols = Object.keys(body)
  const params = cols.map((_, i) => `$${i + 1}`)
  await db.query(
    `INSERT INTO payments (${cols.join(',')}) VALUES (${params.join(',')})`,
    Object.values(body) as never[],
  )
}

describe('AUT-W01 — a payment with no due date must record', () => {
  it('REPRODUCTION: the raw form body is rejected by Postgres', async () => {
    const db = new PGlite()
    await db.exec(PAYMENTS_DDL)
    await expect(insert(db, formBody())).rejects.toThrow(/invalid input syntax for type timestamp/)
  })

  it('with blankToNull the same submission is recorded', async () => {
    const db = new PGlite()
    await db.exec(PAYMENTS_DDL)
    await insert(db, blankToNull(formBody()))

    const { rows } = await db.query<{ amount: string; due_date: unknown; currency: unknown }>(
      'SELECT amount, due_date, currency FROM payments',
    )
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].amount)).toBe(500)
    expect(rows[0].due_date).toBeNull()
    expect(rows[0].currency).toBeNull()
  })

  it('a due date the user DID enter is preserved', async () => {
    const db = new PGlite()
    await db.exec(PAYMENTS_DDL)
    await insert(db, blankToNull({ ...formBody(), due_date: '2026-09-30' }))
    const { rows } = await db.query<{ due_date: Date }>('SELECT due_date FROM payments')
    expect(rows[0].due_date).not.toBeNull()
  })
})

describe('blankToNull', () => {
  it('turns empty and whitespace-only strings into null', () => {
    expect(blankToNull({ a: '', b: '   ', c: '\t\n' })).toEqual({ a: null, b: null, c: null })
  })

  it('leaves real values alone, including ones that are falsy', () => {
    expect(blankToNull({ s: 'x', n: 0, b: false, z: null, u: undefined })).toEqual({
      s: 'x',
      n: 0,
      b: false,
      z: null,
      u: undefined,
    })
  })

  it('does not reach inside a JSONB value, where "" can be meant', () => {
    // Rewriting nested blanks would change data the caller chose to store.
    const body = { meta: { note: '' }, tags: ['', 'a'] }
    expect(blankToNull(body)).toEqual(body)
  })

  it('keeps every key — a dropped key is a column silently not written', () => {
    expect(Object.keys(blankToNull(formBody()))).toEqual(Object.keys(formBody()))
  })
})
