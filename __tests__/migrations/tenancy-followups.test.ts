// Migration 20261209, executed against a real Postgres with RLS enforced.
//
// Three follow-ups to the tenancy batches. Rows of every backfill kind are
// seeded BEFORE the migration runs (every migration before it replayed
// first), then it is applied twice:
//   - Concierge briefs are unique per (company, conversation) and their
//     revisions per brief; revisions are readable only in the brief's company.
//   - conversation_activity.agent_id references team_members (it referenced
//     sales_agents, so writing a team member id failed); values that are not
//     team members are resolved or cleared (saved, listed); sales_agents and
//     its two functions are gone; the log and notes are the conversation's
//     company's.
//   - user_preferences is per (person, company): one company → it; both →
//     the default plus a copy for the other (listed); none → the default
//     (listed). Each person reads and writes only their own row, in a company
//     they belong to.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261209_tenancy_followups.sql'
const ORG_T = '93000000-0000-4000-8000-000000000001' // Travel2Egypt (default, older)
const ORG_A = '93000000-0000-4000-8000-000000000002' // ATS
const T_ONLY = '94000000-0000-4000-8000-000000000001'
const A_ONLY = '94000000-0000-4000-8000-000000000002'
const BOTH = '94000000-0000-4000-8000-000000000003'
const NOBODY = '94000000-0000-4000-8000-000000000004'

const id = (n: number) => `95000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const TM_T = id(1), TM_A = id(2), TM_BOTH_T = id(3), TM_BOTH_A = id(4)
const SA_A = id(11), SA_LOST = id(12)
const CONV_T = id(21), CONV_A = id(22)
const ACT_OWN = id(31), ACT_OTHER = id(32), ACT_OTHER_NOBODY = id(33), ACT_SA_MAPPED = id(34)
const ACT_SA_OTHER_ORG = id(35), ACT_SA_LOST = id(36), ACT_NULL = id(37)
const NOTE_LOST = id(41)
const BRIEF_T = id(51), BRIEF_A = id(52)
const P_T = id(61), P_A = id(62), P_BOTH = id(63), P_NONE = id(64)

type Db = { query(s: string): Promise<{ rows: any[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
let db: Db
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const rows = async (q: string) => (await db.query(q)).rows
const one = async (q: string) => (await rows(q))[0]
const reviewed = async (table: string, rowId: string) =>
  (await rows(`SELECT reason, assigned_org FROM org_backfill_review WHERE table_name = '${table}' AND row_id = '${rowId}' ORDER BY reason`))
const agentOf = async (rowId: string) => (await one(`SELECT agent_id FROM conversation_activity WHERE id = '${rowId}'`))?.agent_id

async function as<T>(uid: string, q: string): Promise<{ rows: T[]; affected: number }> {
  await db.exec('BEGIN')
  try {
    await db.exec(`SELECT set_config('test.uid', '${uid}', true); SET LOCAL row_security = on; SET LOCAL ROLE authenticated;`)
    const r = await db.query(q)
    return { rows: r.rows as T[], affected: r.affectedRows ?? 0 }
  } finally {
    await db.exec('ROLLBACK')
  }
}

/** Did an activity row with this agent insert before the migration? */
let teamMemberWriteBefore: 'ok' | 'failed' = 'ok'

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    // The schema as it stood just before this migration.
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`
    INSERT INTO organizations (id, name, created_at, slug) VALUES
      ('${ORG_T}', 'Travel2Egypt', '2025-01-01', 'travel2egypt'), ('${ORG_A}', 'ATS', '2026-06-01', 'ats');
    INSERT INTO auth.users (id, email) VALUES
      ('${T_ONLY}', 'ops@travel2egypt.org'), ('${A_ONLY}', 'ops@ats-hj.com'), ('${BOTH}', 'both@example.com'),
      ('${NOBODY}', 'gone@example.com')
      ON CONFLICT DO NOTHING;
    DELETE FROM organization_members WHERE user_id IN ('${T_ONLY}', '${A_ONLY}', '${BOTH}', '${NOBODY}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_ONLY}', 'agent'), ('${ORG_A}', '${A_ONLY}', 'agent'),
      ('${ORG_T}', '${BOTH}', 'manager'), ('${ORG_A}', '${BOTH}', 'manager');

    INSERT INTO team_members (id, name, user_id, org_id) VALUES
      ('${TM_T}', 'T agent', '${T_ONLY}', '${ORG_T}'), ('${TM_A}', 'A agent', '${A_ONLY}', '${ORG_A}'),
      ('${TM_BOTH_T}', 'Both (T)', '${BOTH}', '${ORG_T}'), ('${TM_BOTH_A}', 'Both (A)', '${BOTH}', '${ORG_A}');
    INSERT INTO sales_agents (id, user_id, name) VALUES
      ('${SA_A}', '${A_ONLY}', 'Old A agent'), ('${SA_LOST}', null, 'Nobody now');
    INSERT INTO whatsapp_conversations (id, phone_number, org_id) VALUES
      ('${CONV_T}', '+201000000001', '${ORG_T}'), ('${CONV_A}', '+201000000002', '${ORG_A}');
  `)

  // The bug: a team member id in agent_id fails the sales_agents foreign key.
  try {
    await db.exec(`INSERT INTO conversation_activity (conversation_id, agent_id, action_type) VALUES ('${CONV_T}', '${TM_T}', 'assigned')`)
  } catch {
    teamMemberWriteBefore = 'failed'
  }

  // Rows as the old foreign key allowed (sales agents) — and, with it lifted,
  // team member ids of every kind (a database where the key was not enforced).
  await db.exec(`
    INSERT INTO conversation_activity (id, conversation_id, agent_id, action_type) VALUES
      ('${ACT_SA_MAPPED}', '${CONV_A}', '${SA_A}', 'assigned'),
      ('${ACT_SA_OTHER_ORG}', '${CONV_T}', '${SA_A}', 'assigned'),
      ('${ACT_SA_LOST}', '${CONV_T}', '${SA_LOST}', 'assigned'),
      ('${ACT_NULL}', '${CONV_T}', null, 'viewed');
    INSERT INTO conversation_notes (id, conversation_id, agent_id, note) VALUES
      ('${NOTE_LOST}', '${CONV_T}', '${SA_LOST}', 'Called back');
    ALTER TABLE conversation_activity DROP CONSTRAINT conversation_activity_agent_id_fkey;
    INSERT INTO conversation_activity (id, conversation_id, agent_id, action_type) VALUES
      ('${ACT_OWN}', '${CONV_T}', '${TM_T}', 'claimed'),
      ('${ACT_OTHER}', '${CONV_A}', '${TM_BOTH_T}', 'claimed'),
      ('${ACT_OTHER_NOBODY}', '${CONV_T}', '${TM_A}', 'claimed');

    INSERT INTO concierge_briefs (id, conversation_id, brief_revision, raw_payload, org_id) VALUES
      ('${BRIEF_T}', 'conv-1', 2, '{}', '${ORG_T}');
    INSERT INTO concierge_brief_revisions (brief_id, conversation_id, brief_revision, payload) VALUES
      ('${BRIEF_T}', 'conv-1', 1, '{}'), ('${BRIEF_T}', 'conv-1', 2, '{}');

    INSERT INTO user_preferences (id, user_id, default_tier, default_margin_percent, default_currency) VALUES
      ('${P_T}', '${T_ONLY}', 'standard', 20, 'EUR'),
      ('${P_A}', '${A_ONLY}', 'deluxe', 25, 'JPY'),
      ('${P_BOTH}', '${BOTH}', 'luxury', 30, 'USD'),
      ('${P_NONE}', '${NOBODY}', 'standard', 25, 'EUR');
  `)

  await db.exec(sql)
  await db.exec(sql) // idempotent
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $fn$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON conversation_activity, conversation_notes, concierge_briefs,
      concierge_brief_revisions, user_preferences TO authenticated;`)
})

afterAll(async () => {
  await db?.close()
})

describe('Concierge briefs: one per conversation per company', () => {
  it('the same conversation id can reach the other company; never twice in one', async () => {
    await db.exec(`INSERT INTO concierge_briefs (id, conversation_id, raw_payload, org_id) VALUES ('${BRIEF_A}', 'conv-1', '{}', '${ORG_A}')`)
    await expect(db.exec(`INSERT INTO concierge_briefs (conversation_id, raw_payload, org_id) VALUES ('conv-1', '{}', '${ORG_T}')`)).rejects.toThrow()
    expect(await rows(`SELECT conname FROM pg_constraint WHERE conname = 'uq_concierge_briefs_conversation'`)).toEqual([])
  })

  it("revisions are unique per brief: the other company's revision 1 of the same conversation is its own", async () => {
    await db.exec(`INSERT INTO concierge_brief_revisions (brief_id, conversation_id, brief_revision, payload) VALUES ('${BRIEF_A}', 'conv-1', 1, '{}')`)
    await expect(db.exec(`INSERT INTO concierge_brief_revisions (brief_id, conversation_id, brief_revision, payload) VALUES ('${BRIEF_A}', 'conv-1', 1, '{}')`)).rejects.toThrow()
    expect(await rows(`SELECT conname FROM pg_constraint WHERE conname = 'uq_concierge_revision'`)).toEqual([])
  })

  it("revisions are readable only in the brief's company", async () => {
    const seen = async (uid: string) =>
      [...new Set((await as<{ b: string }>(uid, 'SELECT brief_id AS b FROM concierge_brief_revisions')).rows.map(r => r.b))].sort()
    expect(await seen(T_ONLY)).toEqual([BRIEF_T])
    expect(await seen(A_ONLY)).toEqual([BRIEF_A])
    expect(await seen(BOTH)).toEqual([BRIEF_T, BRIEF_A].sort())
    expect(await seen(NOBODY)).toEqual([])
  })
})

describe('the WhatsApp activity log names team members', () => {
  it('before: a team member id failed the sales_agents foreign key — the bug', () => {
    expect(teamMemberWriteBefore).toBe('failed')
  })

  it('after: an activity row with a team member id is written', async () => {
    await db.exec(`BEGIN; INSERT INTO conversation_activity (conversation_id, agent_id, team_member_id, action_type) VALUES ('${CONV_T}', '${TM_T}', '${TM_T}', 'assigned'); ROLLBACK;`)
    await expect(db.exec(`INSERT INTO conversation_activity (conversation_id, agent_id, action_type) VALUES ('${CONV_T}', '${SA_LOST}', 'assigned')`)).rejects.toThrow()
    expect(await one(`SELECT confrelid::regclass::text AS t FROM pg_constraint WHERE conname = 'conversation_activity_agent_id_fkey'`)).toEqual({ t: 'team_members' })
    expect(await one(`SELECT confrelid::regclass::text AS t FROM pg_constraint WHERE conname = 'conversation_notes_agent_id_fkey'`)).toEqual({ t: 'team_members' })
  })

  it("a team member of the conversation's company is kept; of the other company, the same person's row", async () => {
    expect(await agentOf(ACT_OWN)).toBe(TM_T)
    expect(await reviewed('conversation_activity', ACT_OWN)).toEqual([])
    expect(await agentOf(ACT_OTHER)).toBe(TM_BOTH_A)
    expect(await reviewed('conversation_activity', ACT_OTHER)).toEqual([])
  })

  it("another company's team member with no row here is left, listed", async () => {
    expect(await agentOf(ACT_OTHER_NOBODY)).toBe(TM_A)
    expect(await reviewed('conversation_activity', ACT_OTHER_NOBODY)).toEqual([
      { reason: "conversation_activity.agent_id points at another company's team member", assigned_org: ORG_T },
    ])
  })

  it("a sales agent whose login is a team member of the conversation's company → that team member", async () => {
    expect(await agentOf(ACT_SA_MAPPED)).toBe(TM_A)
    expect(await reviewed('conversation_activity', ACT_SA_MAPPED)).toEqual([])
  })

  it('anything else is cleared, its old value saved and the row listed', async () => {
    for (const [rowId, old] of [[ACT_SA_OTHER_ORG, SA_A], [ACT_SA_LOST, SA_LOST]]) {
      expect(await agentOf(rowId)).toBeNull()
      expect(await reviewed('conversation_activity', rowId)).toEqual([
        { reason: 'agent_id was not a team member — cleared', assigned_org: ORG_T },
      ])
      expect((await one(`SELECT row_data FROM org_backfill_dropped_rows WHERE table_name = 'conversation_activity.agent_id' AND row_id = '${rowId}'`)).row_data)
        .toEqual({ agent_id: old })
    }
    expect(await agentOf(ACT_NULL)).toBeNull()
    expect(await reviewed('conversation_activity', ACT_NULL)).toEqual([])
    expect((await one(`SELECT agent_id FROM conversation_notes WHERE id = '${NOTE_LOST}'`)).agent_id).toBeNull()
    expect((await reviewed('conversation_notes', NOTE_LOST)).map(r => r.reason)).toEqual(['agent_id was not a team member — cleared'])
  })

  it('sales_agents and its two functions are gone; its rows are saved', async () => {
    expect(await one(`SELECT to_regclass('public.sales_agents') AS t`)).toEqual({ t: null })
    expect(await rows(`SELECT proname FROM pg_proc WHERE proname IN ('assign_conversation', 'get_next_available_agent')`)).toEqual([])
    expect((await rows(`SELECT row_id FROM org_backfill_dropped_rows WHERE table_name = 'sales_agents' ORDER BY row_id`)).map(r => r.row_id))
      .toEqual([SA_A, SA_LOST].sort())
    expect((await one(`SELECT row_data->>'name' AS n FROM org_backfill_dropped_rows WHERE table_name = 'sales_agents' AND row_id = '${SA_A}'`)).n).toBe('Old A agent')
  })

  it("RLS: the log and notes are the conversation's company's", async () => {
    const convs = async (uid: string, t: string) =>
      [...new Set((await as<{ c: string }>(uid, `SELECT conversation_id AS c FROM ${t}`)).rows.map(r => r.c))].sort()
    expect(await convs(T_ONLY, 'conversation_activity')).toEqual([CONV_T])
    expect(await convs(A_ONLY, 'conversation_activity')).toEqual([CONV_A])
    expect(await convs(A_ONLY, 'conversation_notes')).toEqual([])
    expect(await convs(T_ONLY, 'conversation_notes')).toEqual([CONV_T])
    await expect(as(A_ONLY, `INSERT INTO conversation_activity (conversation_id, action_type) VALUES ('${CONV_T}', 'viewed')`)).rejects.toThrow()
    expect((await as(A_ONLY, `DELETE FROM conversation_activity WHERE conversation_id = '${CONV_T}'`)).affected).toBe(0)
    await as(A_ONLY, `INSERT INTO conversation_activity (conversation_id, agent_id, action_type) VALUES ('${CONV_A}', '${TM_A}', 'viewed')`)
  })
})

describe('user preferences: one row per (person, company)', () => {
  const prefsOf = async (user: string) =>
    rows(`SELECT org_id, default_tier, default_margin_percent, default_currency FROM user_preferences WHERE user_id = '${user}' ORDER BY org_id`)

  it("a person in one company: that company's", async () => {
    expect(await prefsOf(T_ONLY)).toEqual([{ org_id: ORG_T, default_tier: 'standard', default_margin_percent: 20, default_currency: 'EUR' }])
    expect(await prefsOf(A_ONLY)).toEqual([{ org_id: ORG_A, default_tier: 'deluxe', default_margin_percent: 25, default_currency: 'JPY' }])
    expect(await reviewed('user_preferences', P_T)).toEqual([])
  })

  it('a person in both: the default company keeps the row, the other gets a copy — both listed (applied twice, still two)', async () => {
    const both = await prefsOf(BOTH)
    expect(both).toEqual([ORG_T, ORG_A].sort().map(org_id => ({ org_id, default_tier: 'luxury', default_margin_percent: 30, default_currency: 'USD' })))
    expect((await one(`SELECT org_id FROM user_preferences WHERE id = '${P_BOTH}'`)).org_id).toBe(ORG_T)
    expect(await reviewed('user_preferences', P_BOTH)).toEqual([{ reason: 'person in both companies — one row per company', assigned_org: ORG_T }])
    const copy = (await one(`SELECT id FROM user_preferences WHERE user_id = '${BOTH}' AND org_id = '${ORG_A}'`)).id
    expect(await reviewed('user_preferences', copy)).toEqual([{ reason: 'person in both companies — one row per company', assigned_org: ORG_A }])
  })

  it('no membership: the default company, listed', async () => {
    expect((await prefsOf(NOBODY)).map(r => r.org_id)).toEqual([ORG_T])
    expect(await reviewed('user_preferences', P_NONE)).toEqual([{ reason: 'no company membership — default', assigned_org: ORG_T }])
  })

  it('org_id is NOT NULL; unique per (user, company), no longer per user', async () => {
    expect((await one(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'org_id'`)).is_nullable).toBe('NO')
    await expect(db.exec(`INSERT INTO user_preferences (user_id, org_id) VALUES ('${T_ONLY}', '${ORG_T}')`)).rejects.toThrow()
    await db.exec(`BEGIN; INSERT INTO user_preferences (user_id, org_id) VALUES ('${T_ONLY}', '${ORG_A}'); ROLLBACK;`)
    expect(await rows(`SELECT conname FROM pg_constraint WHERE conname = 'user_preferences_user_id_key'`)).toEqual([])
  })

  it('RLS: your own rows, in companies you belong to', async () => {
    const seen = async (uid: string) =>
      (await as<{ user_id: string; org_id: string }>(uid, 'SELECT user_id, org_id FROM user_preferences ORDER BY org_id')).rows
    expect(await seen(T_ONLY)).toEqual([{ user_id: T_ONLY, org_id: ORG_T }])
    expect((await seen(BOTH)).map(r => r.org_id)).toEqual([ORG_T, ORG_A].sort())
    // No longer a member of any company: not even their own old row.
    expect(await seen(NOBODY)).toEqual([])
    await expect(as(T_ONLY, `INSERT INTO user_preferences (user_id, org_id) VALUES ('${T_ONLY}', '${ORG_A}')`)).rejects.toThrow()
    await expect(as(T_ONLY, `INSERT INTO user_preferences (user_id, org_id) VALUES ('${A_ONLY}', '${ORG_T}')`)).rejects.toThrow()
    expect((await as(T_ONLY, `UPDATE user_preferences SET default_margin_percent = 99 WHERE user_id = '${BOTH}'`)).affected).toBe(0)
    expect((await as(BOTH, `UPDATE user_preferences SET default_margin_percent = 35 WHERE org_id = '${ORG_A}'`)).affected).toBe(1)
  })

  it('no policy on these tables is left without an org condition', async () => {
    const { rows: ps } = await db.query(`SELECT tablename, policyname, roles::text AS roles, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
      FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('user_preferences','conversation_activity','conversation_notes','concierge_brief_revisions')`)
    expect(ps.length).toBeGreaterThan(0)
    for (const p of ps) {
      if (p.roles === '{service_role}') continue
      expect(p.expr, `${p.tablename}.${p.policyname}`).toContain('user_is_in_org')
    }
  })
})
