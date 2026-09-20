// Migration 20261029 on a real Postgres.
//
// Operator, 2026-09-20: adding a guide named "Nasser Badawi" was refused with
// "it already exists", and no such guide was anywhere in the supplier list.
// The clash was on supplier_code: an import had spent SUP-0066..SUP-0083 with
// explicit codes, which never touch the sequence, so the sequence sat at 69
// and the next auto-assign minted a code a hotel group already held.
//
// This test reproduces that on the schema as it stood BEFORE the fix, then
// applies the fix and proves it cannot happen again — including the case
// where the sequence is already behind for reasons no trigger can prevent.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const TARGET = '20261029_supplier_code_sequence.sql'
let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }

const rows = async (s: string) => (await db.query(s)).rows
const one = async (s: string) => (await rows(s))[0]

/** Add a supplier the way the API does. `code` null = let the trigger mint. */
const addSupplier = (name: string, code: string | null = null) =>
  db.exec(
    `INSERT INTO suppliers (name, type, types, supplier_code)
     VALUES ('${name}', 'hotel', ARRAY['hotel'], ${code === null ? 'NULL' : `'${code}'`})`
  )

const codeOf = async (name: string) =>
  (await one(`SELECT supplier_code FROM suppliers WHERE name = '${name}'`))?.supplier_code

const seqAt = async () => Number((await one(`SELECT last_value FROM suppliers_code_seq`)).last_value)

const applyTarget = async () => {
  await db.exec(readFileSync(path.join(MIGRATIONS, TARGET), 'utf8'))
  await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f < TARGET).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
})

afterAll(async () => { await db?.close() })

describe('supplier_code sequence vs the table', () => {
  it('BEFORE the fix: an explicit code strands the sequence and the next supplier is refused', async () => {
    await addSupplier('Auto One')                  // sequence: 1
    await addSupplier('Imported', 'SUP-0002')      // spends 2 without calling nextval

    expect(await codeOf('Auto One')).toBe('SUP-0001')
    expect(await seqAt()).toBe(1)                  // the table is at 2, the sequence at 1

    // This is what the operator hit: a name that exists nowhere, refused as a
    // duplicate, because the mint lands on a code someone else already holds.
    await expect(addSupplier('Nasser Badawi')).rejects.toThrow(/duplicate key|unique/i)
    expect(await codeOf('Nasser Badawi')).toBeUndefined()
  })

  it('AFTER the fix: the same insert succeeds, with a code nobody holds', async () => {
    await applyTarget()

    await addSupplier('Nasser Badawi')
    const code = await codeOf('Nasser Badawi')
    expect(code).toBeTruthy()
    expect(code).not.toBe('SUP-0002')

    const dupes = await rows(
      `SELECT supplier_code FROM suppliers GROUP BY supplier_code HAVING count(*) > 1`
    )
    expect(dupes).toEqual([])
  })

  it('an explicit code now fast-forwards the sequence past itself', async () => {
    await addSupplier('Far Ahead', 'SUP-0500')
    expect(await seqAt()).toBe(500)

    await addSupplier('After The Import')
    expect(await codeOf('After The Import')).toBe('SUP-0501')
  })

  it('a sequence left behind by anything else self-heals instead of failing', async () => {
    // A restore, a hand-written INSERT, an import from before this migration:
    // the trigger cannot stop these, so it must survive them.
    await db.exec(`SELECT setval('suppliers_code_seq', 1, true)`)

    await addSupplier('After A Restore')
    const code = await codeOf('After A Restore')
    expect(code).toBeTruthy()

    const taken = await rows(`SELECT supplier_code FROM suppliers WHERE supplier_code = '${code}'`)
    expect(taken).toHaveLength(1)
  })

  it('still never blanks a code on update, and still keeps an operator-set one', async () => {
    const before = await codeOf('Nasser Badawi')
    await db.exec(`UPDATE suppliers SET supplier_code = NULL WHERE name = 'Nasser Badawi'`)
    expect(await codeOf('Nasser Badawi')).toBe(before)

    await db.exec(`UPDATE suppliers SET supplier_code = 'GUIDE-NB' WHERE name = 'Nasser Badawi'`)
    expect(await codeOf('Nasser Badawi')).toBe('GUIDE-NB')
  })

  it('a non-SUP code does not move the sequence', async () => {
    const at = await seqAt()
    await addSupplier('Custom Key', 'ATS-XYZ')
    expect(await seqAt()).toBe(at)
  })
})
