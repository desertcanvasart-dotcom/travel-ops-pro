// Phase 1 of the portable supplier_code work (SUP-0001…): the code is assigned
// by the DB trigger in migrations/20260930_supplier_code.sql, so these tests run
// that actual migration against a real Postgres (PGlite) and prove the four
// behaviours the cross-install CSV flow depends on:
//   - a new supplier with no code gets the next SUP-#### automatically
//   - codes are sequential and zero-padded
//   - existing rows are backfilled in created_at order when the migration runs
//   - a set code is unique, operator-settable, and never blanked on update
import { describe, it, expect, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

vi.setConfig({ testTimeout: 30_000 })

const MIGRATION = readFileSync(
  path.join(process.cwd(), 'migrations/20260930_supplier_code.sql'),
  'utf8',
)

// The columns the migration touches; enough to stand in for the real table.
const SUPPLIERS_MIN = `
  CREATE SCHEMA IF NOT EXISTS public;
  CREATE TABLE public.suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamptz DEFAULT now()
  );
`

async function codesInOrder(db: PGlite): Promise<string[]> {
  const res = await db.query<{ supplier_code: string }>(
    'SELECT supplier_code FROM public.suppliers ORDER BY created_at NULLS FIRST, id',
  )
  return res.rows.map((r) => r.supplier_code)
}

describe('supplier_code — auto-assignment on insert', () => {
  it('assigns sequential SUP-#### codes to suppliers created without one', async () => {
    const db = new PGlite()
    await db.exec(SUPPLIERS_MIN)
    await db.exec(MIGRATION)

    await db.exec(`INSERT INTO public.suppliers (name) VALUES ('Alpha'), ('Bravo'), ('Charlie')`)

    const res = await db.query<{ name: string; supplier_code: string }>(
      'SELECT name, supplier_code FROM public.suppliers ORDER BY supplier_code',
    )
    expect(res.rows.map((r) => r.supplier_code)).toEqual(['SUP-0001', 'SUP-0002', 'SUP-0003'])
  })

  it('honours an operator-supplied code and still auto-assigns the blanks', async () => {
    const db = new PGlite()
    await db.exec(SUPPLIERS_MIN)
    await db.exec(MIGRATION)

    await db.exec(`INSERT INTO public.suppliers (name, supplier_code) VALUES ('Custom', 'ACME-1')`)
    await db.exec(`INSERT INTO public.suppliers (name) VALUES ('Auto')`)

    const rows = (await db.query<{ name: string; supplier_code: string }>(
      'SELECT name, supplier_code FROM public.suppliers ORDER BY name',
    )).rows
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.supplier_code]))
    expect(byName['Custom']).toBe('ACME-1')
    expect(byName['Auto']).toBe('SUP-0001')
  })

  it('treats an empty-string code as unset and auto-assigns', async () => {
    const db = new PGlite()
    await db.exec(SUPPLIERS_MIN)
    await db.exec(MIGRATION)
    await db.exec(`INSERT INTO public.suppliers (name, supplier_code) VALUES ('Blank', '   ')`)
    const [row] = (await db.query<{ supplier_code: string }>(
      'SELECT supplier_code FROM public.suppliers',
    )).rows
    expect(row.supplier_code).toBe('SUP-0001')
  })
})

describe('supplier_code — backfill of existing rows', () => {
  it('numbers pre-existing suppliers in created_at order when the migration runs', async () => {
    const db = new PGlite()
    await db.exec(SUPPLIERS_MIN)
    // Rows that predate the code, inserted out of chronological order.
    await db.exec(`
      INSERT INTO public.suppliers (name, created_at) VALUES
        ('Older', '2026-01-01T00:00:00Z'),
        ('Newer', '2026-06-01T00:00:00Z'),
        ('Oldest', '2025-01-01T00:00:00Z')
    `)
    await db.exec(MIGRATION)
    const rows = (await db.query<{ name: string; supplier_code: string }>(
      'SELECT name, supplier_code FROM public.suppliers ORDER BY created_at',
    )).rows
    expect(rows.map((r) => `${r.name}:${r.supplier_code}`)).toEqual([
      'Oldest:SUP-0001',
      'Older:SUP-0002',
      'Newer:SUP-0003',
    ])
  })
})

describe('supplier_code — uniqueness and update protection', () => {
  it('rejects a duplicate code', async () => {
    const db = new PGlite()
    await db.exec(SUPPLIERS_MIN)
    await db.exec(MIGRATION)
    await db.exec(`INSERT INTO public.suppliers (name, supplier_code) VALUES ('One', 'DUP-1')`)
    await expect(
      db.exec(`INSERT INTO public.suppliers (name, supplier_code) VALUES ('Two', 'DUP-1')`),
    ).rejects.toThrow()
  })

  it('never blanks a set code on update (clearing keeps the existing one)', async () => {
    const db = new PGlite()
    await db.exec(SUPPLIERS_MIN)
    await db.exec(MIGRATION)
    await db.exec(`INSERT INTO public.suppliers (name) VALUES ('Keep')`)
    await db.exec(`UPDATE public.suppliers SET supplier_code = '' WHERE name = 'Keep'`)
    const [row] = (await db.query<{ supplier_code: string }>(
      'SELECT supplier_code FROM public.suppliers',
    )).rows
    expect(row.supplier_code).toBe('SUP-0001')
  })

  it('allows the operator to change a code to a new unique value on update', async () => {
    const db = new PGlite()
    await db.exec(SUPPLIERS_MIN)
    await db.exec(MIGRATION)
    await db.exec(`INSERT INTO public.suppliers (name) VALUES ('Rename')`)
    await db.exec(`UPDATE public.suppliers SET supplier_code = 'SIB-42' WHERE name = 'Rename'`)
    const [row] = (await db.query<{ supplier_code: string }>(
      'SELECT supplier_code FROM public.suppliers',
    )).rows
    expect(row.supplier_code).toBe('SIB-42')
  })
})
