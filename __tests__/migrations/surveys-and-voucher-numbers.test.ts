// Migration 20261216, executed against a real Postgres with RLS enforced.
//
// guest_surveys had no RLS while signed-in users hold ALL on it, so any
// session read and wrote every company's survey tokens and answers through
// PostgREST. Each guest's answers now get their own row (one link serves the
// whole party, and a second submit erased the first). Supplier document
// numbers were one sequence shared by both companies. This signs in as a
// member of each of two companies (auth.uid() from a setting, as
// trip-children-org-policies does) and asks Postgres what each may touch,
// then checks the backfilled responses and the per-company numbering.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const FILE = '20261216_surveys_and_voucher_numbers.sql'
const ORG_T = '32000000-0000-4000-8000-000000000001' // Travel2Egypt
const ORG_A = '32000000-0000-4000-8000-000000000002' // ATS
const T_MGR = '42000000-0000-4000-8000-000000000001'
const A_MGR = '42000000-0000-4000-8000-000000000002'
const STRANGER = '42000000-0000-4000-8000-000000000003' // signed up, no company
const SV_T = '52000000-0000-4000-8000-000000000001' // submitted
const SV_A = '52000000-0000-4000-8000-000000000002' // submitted
const SV_A_OPEN = '52000000-0000-4000-8000-000000000003' // sent, no answers

let db: { query(s: string): Promise<{ rows: any[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const one = async (q: string) => (await db.query(q)).rows[0]

async function as<T>(uid: string | null, q: string): Promise<{ rows: T[]; affected: number }> {
  await db.exec('BEGIN')
  try {
    await db.exec(uid
      ? `SELECT set_config('test.uid', '${uid}', true); SET LOCAL row_security = on; SET LOCAL ROLE authenticated;`
      : `SELECT set_config('test.uid', '', true); SET LOCAL row_security = on; SET LOCAL ROLE anon;`)
    const r = await db.query(q)
    return { rows: r.rows as T[], affected: r.affectedRows ?? 0 }
  } finally {
    await db.exec('ROLLBACK')
  }
}
const count = async (uid: string | null, q: string) => (await as(uid, q)).rows.length
/** The error a statement raises as this user, or null when it ran. */
async function fails(uid: string | null, q: string): Promise<string | null> {
  try { await as(uid, q); return null } catch (e) { return e instanceof Error ? e.message : String(e) }
}

async function replay(includeFile: boolean) {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $fn$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    -- Table grants as the hole had them: RLS is the only thing in the way.
    GRANT SELECT, INSERT, UPDATE, DELETE ON guest_surveys TO authenticated, anon;
    INSERT INTO organizations (id, name) VALUES ('${ORG_T}', 'Travel2Egypt'), ('${ORG_A}', 'ATS');
    INSERT INTO auth.users (id, email) VALUES ('${T_MGR}', 't@x'), ('${A_MGR}', 'a@x'), ('${STRANGER}', 's@x') ON CONFLICT DO NOTHING;
    DELETE FROM organization_members WHERE user_id IN ('${T_MGR}', '${A_MGR}', '${STRANGER}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_MGR}', 'manager'), ('${ORG_A}', '${A_MGR}', 'manager');
    INSERT INTO guest_surveys (id, org_id, token, status, submitted_at, responses) VALUES
      ('${SV_T}', '${ORG_T}', 'tok-t', 'submitted', '2026-05-01T10:00:00Z', '{"ratings":{"overall_satisfaction":5},"guest_name":"Taro"}'),
      ('${SV_A}', '${ORG_A}', 'tok-a', 'submitted', '2026-05-02T10:00:00Z', '{"ratings":{"overall_satisfaction":3}}'),
      ('${SV_A_OPEN}', '${ORG_A}', 'tok-a2', 'sent', NULL, '{}');
    INSERT INTO supplier_documents (org_id, document_type, document_number, supplier_name, client_name) VALUES
      ('${ORG_T}', 'hotel_voucher', 'HV-2026-0007', 'H', 'C'),
      ('${ORG_A}', 'hotel_voucher', 'HV-2026-0002', 'H', 'C'),
      ('${ORG_A}', 'hotel_voucher', 'HV-2026-X9', 'H', 'C');
  `)
  if (includeFile) {
    await db.exec(sql)
    await db.exec(sql) // twice: idempotent
    await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON guest_survey_responses TO authenticated')
  }
}

describe('before the migration (the hole is real)', () => {
  beforeAll(async () => { await replay(false) })
  afterAll(async () => { await db?.close() })

  it("a signed-in stranger and anon read every company's surveys", async () => {
    expect(await count(STRANGER, 'SELECT id FROM guest_surveys')).toBe(3)
    expect(await count(null, 'SELECT id FROM guest_surveys')).toBe(3)
  })

  it("one company cannot reuse the other's document number", async () => {
    await expect(db.exec(`INSERT INTO supplier_documents (org_id, document_type, document_number, supplier_name, client_name)
      VALUES ('${ORG_A}', 'hotel_voucher', 'HV-2026-0007', 'H', 'C')`)).rejects.toThrow(/duplicate/)
  })
})

describe('after the migration (applied twice)', () => {
  beforeAll(async () => { await replay(true) })
  afterAll(async () => { await db?.close() })

  it("each company's member reads only its own surveys and responses", async () => {
    expect((await as<{ id: string }>(T_MGR, 'SELECT id FROM guest_surveys')).rows.map(r => r.id)).toEqual([SV_T])
    expect((await as<{ id: string }>(A_MGR, 'SELECT id FROM guest_surveys ORDER BY id')).rows.map(r => r.id)).toEqual([SV_A, SV_A_OPEN])
    expect((await as<{ survey_id: string }>(T_MGR, 'SELECT survey_id FROM guest_survey_responses')).rows.map(r => r.survey_id)).toEqual([SV_T])
    expect((await as<{ survey_id: string }>(A_MGR, 'SELECT survey_id FROM guest_survey_responses')).rows.map(r => r.survey_id)).toEqual([SV_A])
  })

  it("another company's member can neither change nor add to a survey or its answers", async () => {
    expect((await as(A_MGR, `UPDATE guest_surveys SET status = 'pending' WHERE id = '${SV_T}'`)).affected).toBe(0)
    expect((await as(A_MGR, `DELETE FROM guest_surveys WHERE id = '${SV_T}'`)).affected).toBe(0)
    expect((await as(A_MGR, `UPDATE guest_survey_responses SET answers = '{}' WHERE survey_id = '${SV_T}'`)).affected).toBe(0)
    expect((await as(A_MGR, `DELETE FROM guest_survey_responses WHERE survey_id = '${SV_T}'`)).affected).toBe(0)
    // A response on the other company's survey takes that survey's org, which
    // the inserting member is not in: refused, whatever org_id was sent.
    expect(await fails(A_MGR, `INSERT INTO guest_survey_responses (org_id, survey_id, answers) VALUES ('${ORG_A}', '${SV_T}', '{}')`))
      .toMatch(/row-level security/)
    expect(await fails(A_MGR, `INSERT INTO guest_surveys (org_id, token) VALUES ('${ORG_T}', 'mine')`)).toMatch(/row-level security/)
    // Its own company's: allowed.
    expect((await as(A_MGR, `UPDATE guest_surveys SET status = 'sent' WHERE id = '${SV_A_OPEN}'`)).affected).toBe(1)
  })

  it('a signed-in stranger sees nothing and anon has no access at all', async () => {
    expect(await count(STRANGER, 'SELECT id FROM guest_surveys')).toBe(0)
    expect(await count(STRANGER, 'SELECT id FROM guest_survey_responses')).toBe(0)
    expect(await fails(null, 'SELECT id FROM guest_surveys')).toMatch(/permission denied/)
    expect(await fails(null, 'SELECT id FROM guest_survey_responses')).toMatch(/permission denied/)
  })

  it("each submitted survey's answers became its one first response, once", async () => {
    const rows = (await db.query(`SELECT survey_id, org_id, respondent_name, answers, submitted_at FROM guest_survey_responses ORDER BY survey_id`)).rows
    expect(rows.length).toBe(2)
    expect(rows[0]).toMatchObject({ survey_id: SV_T, org_id: ORG_T, respondent_name: 'Taro', answers: { ratings: { overall_satisfaction: 5 }, guest_name: 'Taro' } })
    expect(new Date(rows[0].submitted_at).toISOString()).toBe('2026-05-01T10:00:00.000Z')
    expect(rows[1]).toMatchObject({ survey_id: SV_A, org_id: ORG_A, respondent_name: null })
  })

  it('a response always carries its survey’s org', async () => {
    await db.exec(`INSERT INTO guest_survey_responses (org_id, survey_id, answers) VALUES ('${ORG_T}', '${SV_A_OPEN}', '{}')`)
    expect((await one(`SELECT org_id FROM guest_survey_responses WHERE survey_id = '${SV_A_OPEN}'`)).org_id).toBe(ORG_A)
  })

  it('numbers each company on from its own highest, ignoring malformed numbers', async () => {
    expect((await one(`SELECT next_supplier_document_number('${ORG_A}', 'HV', 2026) AS n`)).n).toBe('HV-2026-0003')
    expect((await one(`SELECT next_supplier_document_number('${ORG_T}', 'HV', 2026) AS n`)).n).toBe('HV-2026-0008')
    expect((await one(`SELECT next_supplier_document_number('${ORG_A}', 'HV', 2026) AS n`)).n).toBe('HV-2026-0004')
    expect((await one(`SELECT next_supplier_document_number('${ORG_A}', 'TV', 2026) AS n`)).n).toBe('TV-2026-0001')
  })

  it('skips a number the company already holds', async () => {
    await db.exec(`INSERT INTO supplier_documents (org_id, document_type, document_number, supplier_name, client_name)
      VALUES ('${ORG_A}', 'transport_voucher', 'TV-2026-0002', 'T', 'C')`)
    expect((await one(`SELECT next_supplier_document_number('${ORG_A}', 'TV', 2026) AS n`)).n).toBe('TV-2026-0003')
  })

  it('both companies may hold the same number; one company may not hold it twice', async () => {
    await db.exec(`INSERT INTO supplier_documents (org_id, document_type, document_number, supplier_name, client_name)
      VALUES ('${ORG_A}', 'hotel_voucher', 'HV-2026-0007', 'H', 'C')`)
    await expect(db.exec(`INSERT INTO supplier_documents (org_id, document_type, document_number, supplier_name, client_name)
      VALUES ('${ORG_A}', 'hotel_voucher', 'HV-2026-0007', 'H', 'C')`)).rejects.toThrow(/duplicate/)
    // Existing numbers unchanged.
    expect((await one(`SELECT count(*)::int AS n FROM supplier_documents WHERE document_number IN ('HV-2026-0002', 'HV-2026-X9')`)).n).toBe(2)
  })

  it('only the service role may draw a number or read the counters', async () => {
    const r = await one(`SELECT
      has_function_privilege('authenticated', 'public.next_supplier_document_number(uuid, text, integer)', 'EXECUTE') AS auth_fn,
      has_function_privilege('anon', 'public.next_supplier_document_number(uuid, text, integer)', 'EXECUTE') AS anon_fn,
      has_function_privilege('service_role', 'public.next_supplier_document_number(uuid, text, integer)', 'EXECUTE') AS svc_fn,
      has_table_privilege('authenticated', 'public.supplier_document_number_counters', 'SELECT') AS auth_tbl`)
    expect(r).toEqual({ auth_fn: false, anon_fn: false, svc_fn: true, auth_tbl: false })
  })
})
