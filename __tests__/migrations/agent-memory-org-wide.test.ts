// Migration 20261210, executed against a real Postgres.
//
// A4: when the request names a client, get_org_agent_memories dropped every
// company-wide memory (subject_id NULL) — the AI saw the client's memories but
// lost the company's. Only the migrations before this one are replayed, then
// it is applied twice. The function stays service_role only (20261129).
// Replaying showed it also raised on every call (an ambiguous column in its
// closing UPDATE), so no memory ever reached a prompt.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261210_agent_memory_org_wide.sql'
const FN = 'public.get_org_agent_memories(uuid, uuid, text, double precision, integer)'
const ORG = '96000000-0000-4000-8000-000000000001'
const OTHER_ORG = '96000000-0000-4000-8000-000000000002'
const CLIENT = '96000000-0000-4000-8000-000000000011'
const OTHER_CLIENT = '96000000-0000-4000-8000-000000000012'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: { query(s: string, p?: unknown[]): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')

const recall = async (subject: string | null) =>
  (await db.query(
    `SELECT content FROM public.get_org_agent_memories($1, $2, $3, 0.3, 20) ORDER BY content`,
    [ORG, subject, subject ? 'client' : null],
  )).rows.map(r => r.content as string)

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f < FILE).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`
    INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'Agency'), ('${OTHER_ORG}', 'Other agency');
    INSERT INTO public.agent_memory (org_id, memory_type, subject_id, subject_type, content, confidence) VALUES
      ('${ORG}', 'client_preference', '${CLIENT}', 'client', 'client: luxury tier', 0.5),
      ('${ORG}', 'client_preference', '${OTHER_CLIENT}', 'client', 'other client: budget', 0.5),
      ('${ORG}', 'inquiry_pattern', NULL, NULL, 'company: Spanish guides', 0.5),
      ('${ORG}', 'supplier_note', NULL, NULL, 'company: preferred hotel', 0.5),
      ('${OTHER_ORG}', 'inquiry_pattern', NULL, NULL, 'other company: German', 0.5);
  `)
})

afterAll(async () => {
  await db?.close()
})

describe('before the migration', () => {
  it('every call raised: the closing UPDATE\'s `confidence` is ambiguous with the output column', async () => {
    await expect(recall(CLIENT)).rejects.toThrow(/ambiguous/)
    await expect(recall(null)).rejects.toThrow(/ambiguous/)
  })

  it('and its WHERE dropped company-wide memories whenever a client was named (the bug is real)', () => {
    const base = readFileSync(path.join(MIGRATIONS, '20260829_baseline_schema.sql'), 'utf8')
    expect(base).toContain('AND (p_subject_id IS NULL OR am.subject_id = p_subject_id)\n')
  })
})

describe('after the migration (applied twice)', () => {
  beforeAll(async () => {
    await db.exec(sql)
    await db.exec(sql)
  })

  it('a known client gets their own memories plus the company-wide ones, not another client\'s', async () => {
    expect(await recall(CLIENT)).toEqual(['client: luxury tier', 'company: Spanish guides', 'company: preferred hotel'])
  })

  it('the client\'s own memory ranks first', async () => {
    const { rows } = await db.query(`SELECT content FROM public.get_org_agent_memories($1, $2, 'client', 0.3, 20)`, [ORG, CLIENT])
    expect(rows[0].content).toBe('client: luxury tier')
  })

  it('with no client, every memory of the company comes back and none of another company', async () => {
    expect(await recall(null)).toEqual(['client: luxury tier', 'company: Spanish guides', 'company: preferred hotel', 'other client: budget'])
  })

  it('stays SECURITY DEFINER and callable by service_role only', async () => {
    const can = async (role: string) =>
      (await db.query(`SELECT has_function_privilege('${role}', '${FN}', 'EXECUTE') AS ok`)).rows[0].ok as boolean
    expect(await can('authenticated')).toBe(false)
    expect(await can('anon')).toBe(false)
    expect(await can('service_role')).toBe(true)
    const { rows } = await db.query(`SELECT prosecdef FROM pg_proc WHERE oid = '${FN}'::regprocedure`)
    expect(rows[0].prosecdef).toBe(true)
  })
})
