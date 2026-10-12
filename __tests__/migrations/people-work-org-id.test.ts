// Migration 20261203, executed against a real Postgres with RLS enforced.
//
// team_members, departments, tasks and notifications had no org_id: every
// row was both companies'. Rows of every backfill kind are seeded BEFORE the
// migration runs (every other migration replayed first), then it is applied
// twice. Each row must land in its company, a person in both companies must
// end with one team-members row per company with each company's rows
// pointing at its own, and through PostgREST (auth.uid() from a setting) a
// user of one company must see and change none of the other's.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261203_people_work_org_id.sql'
const ORG_T = '70000000-0000-4000-8000-000000000001' // Travel2Egypt (older)
const ORG_A = '70000000-0000-4000-8000-000000000002' // ATS
const T_ONLY = '71000000-0000-4000-8000-000000000001'
const A_ONLY = '71000000-0000-4000-8000-000000000002'
const BOTH = '71000000-0000-4000-8000-000000000003'
const A_GMAIL = '71000000-0000-4000-8000-000000000004'

const id = (n: number) => `72000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const D_RES = id(1), D_AV = id(2), D_ACC = id(3)
const TM_T = id(11), TM_T_DUP = id(12), TM_A = id(13), TM_BOTH = id(14), TM_EMAIL = id(15), TM_DOMAIN = id(16), TM_NONE = id(17)
const C_T = id(21), C_A = id(22)
const I_T = id(31), I_A = id(32)
const K_ITIN_A = id(41), K_CLIENT_T = id(42), K_ASSIGNEE_A = id(43), K_DEPT = id(44), K_NONE = id(45), K_FOREIGN = id(46)
const N_ITIN = id(51), N_TASK = id(52), N_USER_A = id(53), N_TM = id(54), N_NONE = id(55)
const W_A = id(61)

type Db = { query(s: string): Promise<{ rows: any[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
let db: Db
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const rows = async (q: string) => (await db.query(q)).rows
const one = async (q: string) => (await rows(q))[0]
const orgOf = async (table: string, rowId: string) => (await one(`SELECT org_id FROM ${table} WHERE id = '${rowId}'`))?.org_id

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
const orgsSeen = async (uid: string, table: string) =>
  [...new Set((await as<{ o: string }>(uid, `SELECT org_id AS o FROM ${table}`)).rows.map(r => r.o))].sort()

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f === FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`
    INSERT INTO organizations (id, name, created_at) VALUES
      ('${ORG_T}', 'Travel2Egypt', '2025-01-01'), ('${ORG_A}', 'ATS', '2026-06-01');
    INSERT INTO auth.users (id, email) VALUES
      ('${T_ONLY}', 'ops@travel2egypt.org'), ('${A_ONLY}', 'staff@ats-hj.com'),
      ('${BOTH}', 'owner@travel2egypt.org'), ('${A_GMAIL}', 'ats.contractor@gmail.com')
      ON CONFLICT DO NOTHING;
    INSERT INTO user_profiles (id, email, role, is_active) VALUES
      ('${T_ONLY}', 'ops@travel2egypt.org', 'manager', true), ('${A_ONLY}', 'staff@ats-hj.com', 'manager', true),
      ('${BOTH}', 'owner@travel2egypt.org', 'manager', true), ('${A_GMAIL}', 'ats.contractor@gmail.com', 'agent', true)
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    DELETE FROM organization_members WHERE user_id IN ('${T_ONLY}', '${A_ONLY}', '${BOTH}', '${A_GMAIL}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_ONLY}', 'manager'), ('${ORG_A}', '${A_ONLY}', 'manager'),
      ('${ORG_T}', '${BOTH}', 'owner'), ('${ORG_A}', '${BOTH}', 'admin'), ('${ORG_A}', '${A_GMAIL}', 'agent');

    INSERT INTO departments (id, name, service_types) VALUES
      ('${D_RES}', 'Reservation', '{accommodation}'), ('${D_AV}', 'Aviation', '{flight}'), ('${D_ACC}', 'Accounting', '{invoice}');
    INSERT INTO team_members (id, name, email, user_id, department_id, created_at) VALUES
      ('${TM_T}', 'T ops', 'ops@travel2egypt.org', '${T_ONLY}', '${D_RES}', '2025-01-01'),
      ('${TM_T_DUP}', 'T ops again', null, '${T_ONLY}', null, '2025-02-01'),
      ('${TM_A}', 'A staff', 'staff@ats-hj.com', '${A_ONLY}', '${D_RES}', '2026-06-01'),
      ('${TM_BOTH}', 'Owner', 'owner@travel2egypt.org', '${BOTH}', '${D_AV}', '2025-01-01'),
      ('${TM_EMAIL}', 'Contractor', 'ATS.Contractor@gmail.com', null, null, '2026-06-01'),
      ('${TM_DOMAIN}', 'Guide', 'guide@ats-hj.com', null, null, '2026-06-01'),
      ('${TM_NONE}', 'Driver', null, null, null, '2025-01-01');

    INSERT INTO clients (id, client_code, first_name, last_name, org_id) VALUES
      ('${C_T}', 'C-T', 'Taro', 'T', '${ORG_T}'), ('${C_A}', 'C-A', 'Aiko', 'A', '${ORG_A}');
    INSERT INTO itineraries (id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, org_id, assigned_to) VALUES
      ('${I_T}', 'I-T', 'Taro', 'Trip T', '2026-01-01', '2026-01-03', 3, '${ORG_T}', '${TM_T}'),
      ('${I_A}', 'I-A', 'Aiko', 'Trip A', '2026-01-01', '2026-01-03', 3, '${ORG_A}', '${TM_BOTH}');
    INSERT INTO whatsapp_conversations (id, phone_number, org_id, assigned_team_member_id, assigned_agent_id) VALUES
      ('${W_A}', '+810000', '${ORG_A}', '${TM_BOTH}', '${TM_BOTH}');

    INSERT INTO tasks (id, title, linked_type, linked_id, assigned_to, department_id) VALUES
      ('${K_ITIN_A}', 'A trip task', 'itinerary', '${I_A}', '${TM_BOTH}', '${D_AV}'),
      ('${K_CLIENT_T}', 'T client task', 'client', '${C_T}', null, null),
      ('${K_ASSIGNEE_A}', 'A staff task', null, null, '${TM_A}', null),
      ('${K_DEPT}', 'Accounting task', null, null, null, '${D_ACC}'),
      ('${K_NONE}', 'Loose task', null, null, null, null),
      ('${K_FOREIGN}', 'A trip, T assignee', 'itinerary', '${I_A}', '${TM_T}', null);

    INSERT INTO notifications (id, type, title, user_id, team_member_id, related_itinerary_id, related_task_id) VALUES
      ('${N_ITIN}', 'trip_assigned', 'A trip', null, '${TM_BOTH}', '${I_A}', null),
      ('${N_TASK}', 'task_assigned', 'T task', '${BOTH}', null, null, '${K_CLIENT_T}'),
      ('${N_USER_A}', 'rate_changed', 'A rates', '${A_ONLY}', null, null, null),
      ('${N_TM}', 'task_assigned', 'Guide', null, '${TM_DOMAIN}', null, null),
      ('${N_NONE}', 'rate_changed', 'Both', '${BOTH}', null, null, null);
  `)
  await db.exec(sql)
  await db.exec(sql) // idempotent
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $fn$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON team_members, departments, tasks, notifications TO authenticated;`)
})

afterAll(async () => {
  await db?.close()
})

const reviewed = async (table: string, rowId: string) =>
  (await rows(`SELECT reason, assigned_org FROM org_backfill_review WHERE table_name = '${table}' AND row_id = '${rowId}'`))
const cloneOf = async (userId: string, orgId: string) =>
  (await one(`SELECT id FROM team_members WHERE user_id = '${userId}' AND org_id = '${orgId}'`))?.id

describe('team members', () => {
  it('each row is its company: by login, login email, company domain, else the default (listed)', async () => {
    expect(await orgOf('team_members', TM_T)).toBe(ORG_T)
    expect(await orgOf('team_members', TM_A)).toBe(ORG_A)
    expect(await orgOf('team_members', TM_EMAIL)).toBe(ORG_A)
    expect(await orgOf('team_members', TM_DOMAIN)).toBe(ORG_A)
    expect(await orgOf('team_members', TM_NONE)).toBe(ORG_T)
    expect(await reviewed('team_members', TM_NONE)).toEqual([
      { reason: 'no login, matching login email or company domain — default organisation', assigned_org: ORG_T },
    ])
    expect(await reviewed('team_members', TM_EMAIL)).toEqual([])
  })

  it('a person in both companies ends with one row in each, both listed', async () => {
    expect(await orgOf('team_members', TM_BOTH)).toBe(ORG_T)
    const clone = await cloneOf(BOTH, ORG_A)
    expect(clone).toBeTruthy()
    expect(clone).not.toBe(TM_BOTH)
    expect(await one(`SELECT name, email, user_id FROM team_members WHERE id = '${clone}'`))
      .toEqual({ name: 'Owner', email: 'owner@travel2egypt.org', user_id: BOTH })
    expect((await rows(`SELECT id FROM team_members WHERE user_id = '${BOTH}'`)).length).toBe(2)
    for (const r of [TM_BOTH, clone]) {
      expect((await reviewed('team_members', r)).map(x => x.reason)).toEqual(['person in both companies — one row per company'])
    }
  })

  it('a second row for one login in one company loses the login link (listed), and (org, login) is unique', async () => {
    expect((await one(`SELECT user_id FROM team_members WHERE id = '${TM_T_DUP}'`)).user_id).toBeNull()
    expect((await reviewed('team_members', TM_T_DUP)).map(x => x.reason)).toEqual(['second row for one login in one company — login unlinked'])
    await expect(db.exec(`INSERT INTO team_members (name, user_id, org_id) VALUES ('x', '${A_ONLY}', '${ORG_A}')`)).rejects.toThrow()
    // The same login in the other company is fine — that is a person in both.
    await db.exec(`BEGIN; INSERT INTO team_members (name, user_id, org_id) VALUES ('x', '${A_ONLY}', '${ORG_T}'); ROLLBACK;`)
  })

  it("rows that already had an org point at the person's row in their own company", async () => {
    const clone = await cloneOf(BOTH, ORG_A)
    expect((await one(`SELECT assigned_to FROM itineraries WHERE id = '${I_A}'`)).assigned_to).toBe(clone)
    expect((await one(`SELECT assigned_to FROM itineraries WHERE id = '${I_T}'`)).assigned_to).toBe(TM_T)
    expect(await one(`SELECT assigned_team_member_id a, assigned_agent_id b FROM whatsapp_conversations WHERE id = '${W_A}'`))
      .toEqual({ a: clone, b: clone })
  })
})

describe('departments', () => {
  it('start in the default; one another company uses is copied into it and its rows point at the copy', async () => {
    for (const d of [D_RES, D_AV, D_ACC]) expect(await orgOf('departments', d)).toBe(ORG_T)
    const copies = await rows(`SELECT id, name, service_types FROM departments WHERE org_id = '${ORG_A}' ORDER BY name`)
    expect(copies.map(c => c.name)).toEqual(['Aviation', 'Reservation'])
    const byName = Object.fromEntries(copies.map(c => [c.name, c.id]))
    expect((await one(`SELECT department_id FROM team_members WHERE id = '${TM_A}'`)).department_id).toBe(byName.Reservation)
    expect((await one(`SELECT department_id FROM team_members WHERE id = '${await cloneOf(BOTH, ORG_A)}'`)).department_id).toBe(byName.Aviation)
    expect((await one(`SELECT department_id FROM team_members WHERE id = '${TM_T}'`)).department_id).toBe(D_RES)
    expect((await one(`SELECT department_id FROM tasks WHERE id = '${K_ITIN_A}'`)).department_id).toBe(byName.Aviation)
    expect((await reviewed('departments', byName.Aviation)).map(x => x.reason)).toEqual(['used by another company — copied'])
  })

  it('names are unique per company, not across companies', async () => {
    await expect(db.exec(`INSERT INTO departments (name, org_id) VALUES ('Aviation', '${ORG_A}')`)).rejects.toThrow()
    await db.exec(`BEGIN; INSERT INTO departments (name, org_id) VALUES ('Accounting', '${ORG_A}'); ROLLBACK;`)
  })
})

describe('tasks', () => {
  it('by linked record, assignee, department, else the default (listed)', async () => {
    expect(await orgOf('tasks', K_ITIN_A)).toBe(ORG_A)
    expect(await orgOf('tasks', K_CLIENT_T)).toBe(ORG_T)
    expect(await orgOf('tasks', K_ASSIGNEE_A)).toBe(ORG_A)
    expect(await orgOf('tasks', K_DEPT)).toBe(ORG_T)
    expect((await reviewed('tasks', K_DEPT)).map(x => x.reason)).toEqual(['traced only by its department — default organisation'])
    expect(await orgOf('tasks', K_NONE)).toBe(ORG_T)
    expect((await reviewed('tasks', K_NONE)).map(x => x.reason)).toEqual(['no linked record, assignee or department — default organisation'])
    expect(await reviewed('tasks', K_ITIN_A)).toEqual([])
  })

  it("a task linked to an ATS trip lands in ATS, assigned to the person's ATS row", async () => {
    expect((await one(`SELECT assigned_to FROM tasks WHERE id = '${K_ITIN_A}'`)).assigned_to).toBe(await cloneOf(BOTH, ORG_A))
  })

  it("an assignee with no row in the task's company is cleared (listed)", async () => {
    expect(await orgOf('tasks', K_FOREIGN)).toBe(ORG_A)
    expect((await one(`SELECT assigned_to FROM tasks WHERE id = '${K_FOREIGN}'`)).assigned_to).toBeNull()
    expect((await reviewed('tasks', K_FOREIGN)).map(x => x.reason)).toEqual(["assignee is not in the task's company — unassigned"])
  })
})

describe('notifications', () => {
  it('by trip, task, login, team member, else the default (listed)', async () => {
    expect(await orgOf('notifications', N_ITIN)).toBe(ORG_A)
    expect(await orgOf('notifications', N_TASK)).toBe(ORG_T)
    expect(await orgOf('notifications', N_USER_A)).toBe(ORG_A)
    expect(await orgOf('notifications', N_TM)).toBe(ORG_A)
    expect(await orgOf('notifications', N_NONE)).toBe(ORG_T)
    expect((await reviewed('notifications', N_NONE)).map(x => x.reason))
      .toEqual(['no trip, task, single-company login or team member — default organisation'])
  })

  it("one addressed to a team member points at that person's row in its company", async () => {
    expect((await one(`SELECT team_member_id FROM notifications WHERE id = '${N_ITIN}'`)).team_member_id).toBe(await cloneOf(BOTH, ORG_A))
  })
})

describe('schema', () => {
  it('org_id is NOT NULL on all four', async () => {
    const r = await rows(`SELECT table_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'org_id' AND table_name IN ('team_members','departments','tasks','notifications') ORDER BY 1`)
    expect(r).toEqual(['departments', 'notifications', 'tasks', 'team_members'].map(t => ({ table_name: t, is_nullable: 'NO' })))
  })

  it('the dead views and tables are gone; sales_agents (read by the WhatsApp activity route) stays', async () => {
    const r = await rows(`SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace
      AND relname IN ('active_tasks','archived_tasks','agent_team_member_mapping','assignment_rules','reminder_settings','sales_agents')`)
    expect(r.map(x => x.relname)).toEqual(['sales_agents'])
  })

  it('no policy on these tables is left without an org condition', async () => {
    const { rows: ps } = await db.query(`SELECT tablename, policyname, roles::text AS roles, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
      FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('team_members','departments','tasks','notifications')`)
    expect(ps.length).toBeGreaterThan(0)
    for (const p of ps) {
      if (p.roles === '{service_role}') continue
      expect(p.expr, `${p.tablename}.${p.policyname}`).toContain('user_is_in_org')
    }
  })
})

describe('RLS: each company sees and changes only its own', () => {
  it("ATS's manager reads only ATS's team, departments and tasks; Travel2Egypt's only its own", async () => {
    for (const t of ['team_members', 'departments', 'tasks']) {
      expect(await orgsSeen(A_ONLY, t), t).toEqual([ORG_A])
      expect(await orgsSeen(T_ONLY, t), t).toEqual([ORG_T])
    }
  })

  it("nobody edits or deletes the other company's team members, departments or tasks", async () => {
    expect((await as(A_ONLY, `UPDATE team_members SET name = 'x' WHERE id = '${TM_T}'`)).affected).toBe(0)
    expect((await as(A_ONLY, `DELETE FROM team_members WHERE id = '${TM_NONE}'`)).affected).toBe(0)
    expect((await as(A_ONLY, `UPDATE tasks SET title = 'x' WHERE id = '${K_CLIENT_T}'`)).affected).toBe(0)
    expect((await as(A_ONLY, `DELETE FROM tasks WHERE id = '${K_NONE}'`)).affected).toBe(0)
    expect((await as(A_ONLY, `UPDATE departments SET name = 'x' WHERE id = '${D_ACC}'`)).affected).toBe(0)
    await expect(as(A_ONLY, `INSERT INTO tasks (title, org_id) VALUES ('x', '${ORG_T}')`)).rejects.toThrow()
    await expect(as(A_ONLY, `INSERT INTO team_members (name, org_id) VALUES ('x', '${ORG_T}')`)).rejects.toThrow()
    // Its own still work.
    expect((await as(A_ONLY, `UPDATE tasks SET title = 'x' WHERE id = '${K_ASSIGNEE_A}'`)).affected).toBe(1)
    expect((await as(A_ONLY, `UPDATE team_members SET name = 'x' WHERE id = '${TM_DOMAIN}'`)).affected).toBe(1)
  })

  it('notifications: only your own, in a company you are in', async () => {
    const seen = async (uid: string) => (await as<{ id: string }>(uid, 'SELECT id FROM notifications ORDER BY id')).rows.map(r => r.id)
    expect(await seen(A_ONLY)).toEqual([N_USER_A])
    expect(await seen(T_ONLY)).toEqual([])
    expect(await seen(BOTH)).toEqual([N_ITIN, N_TASK, N_NONE].sort())
    expect((await as(T_ONLY, `DELETE FROM notifications WHERE id = '${N_USER_A}'`)).affected).toBe(0)
  })
})
