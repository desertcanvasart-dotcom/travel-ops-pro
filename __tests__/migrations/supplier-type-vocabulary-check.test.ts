// 20261007_supplier_type_vocabulary_check.sql, executed against a real
// Postgres (PGlite) on a production-shaped table: the two word-list CHECKs
// go, a slug-shape CHECK takes their place, existing rows validate, an
// agency-added key ("lodge") stores, a label ("Lodge") still cannot, and a
// second run is a no-op.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

const MIGRATION = path.join(process.cwd(), 'migrations', '20261007_supplier_type_vocabulary_check.sql')
const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '')

const TABLE = `
  CREATE SCHEMA IF NOT EXISTS public;
  CREATE TABLE public.suppliers (
    id serial PRIMARY KEY,
    name text NOT NULL,
    type varchar(50),
    types text[] NOT NULL DEFAULT '{}',
    CONSTRAINT suppliers_type_check CHECK (type::text = ANY (ARRAY['hotel', 'transport', 'guide', 'other']::text[])),
    CONSTRAINT suppliers_types_vocab_check CHECK (types <@ ARRAY['hotel', 'transport', 'guide', 'other']::text[]),
    CONSTRAINT suppliers_type_in_types_check CHECK (type IS NULL OR type::text = ANY (types))
  );
  INSERT INTO public.suppliers (name, type, types) VALUES ('Nile Palace', 'hotel', '{hotel}'), ('Sam', 'guide', '{guide,transport}');
`

const constraints = async (db: PGlite) =>
  (await db.query<{ conname: string }>(`SELECT conname FROM pg_constraint WHERE conrelid = 'public.suppliers'::regclass AND contype = 'c' ORDER BY 1`)).rows.map(r => r.conname)

describe('20261007 — supplier types follow the vocabulary', () => {
  const db = new PGlite()
  beforeAll(async () => { await db.exec(TABLE); await db.exec(sql) }, 60_000)
  afterAll(async () => { await db.close() })

  it('replaces the two word-list CHECKs with key-shape CHECKs and keeps type ∈ types', async () => {
    expect(await constraints(db)).toEqual(['suppliers_type_in_types_check', 'suppliers_type_key_check', 'suppliers_types_keys_check'])
  })

  it('an agency-added key stores; a label, or a word with spaces, still cannot', async () => {
    await db.exec(`INSERT INTO public.suppliers (name, type, types) VALUES ('Desert Lodge', 'lodge', '{lodge,hotel}')`)
    await expect(db.exec(`INSERT INTO public.suppliers (name, type, types) VALUES ('Bad', 'Lodge', '{Lodge}')`)).rejects.toThrow(/suppliers_type_key_check|suppliers_types_keys_check/)
    await expect(db.exec(`INSERT INTO public.suppliers (name, type, types) VALUES ('Bad', 'lodge', '{lodge,"eco lodge"}')`)).rejects.toThrow(/suppliers_types_keys_check/)
    // The primary type must still be one of the roles.
    await expect(db.exec(`INSERT INTO public.suppliers (name, type, types) VALUES ('Bad', 'lodge', '{hotel}')`)).rejects.toThrow(/suppliers_type_in_types_check/)
  })

  it('is idempotent', async () => {
    await db.exec(sql)
    expect(await constraints(db)).toEqual(['suppliers_type_in_types_check', 'suppliers_type_key_check', 'suppliers_types_keys_check'])
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.suppliers`)
    expect(rows[0].n).toBe(3)
  }, 60_000)
})
