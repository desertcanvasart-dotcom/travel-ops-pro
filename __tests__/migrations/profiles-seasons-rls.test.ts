// Migration 20270103, executed against a real Postgres (PGlite) on the
// replayed schema, as the `authenticated` role with auth.uid() set:
//   - a person cannot change their own role, active flag or email, but can
//     still change their name and phone; the service role still can
//   - removing a membership re-mirrors the role
//   - a member (viewer included) can read the season calendar and not write it
//   - activity_log has a detail column
//   - applying it twice changes nothing
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20270103_profiles_seasons_rls.sql'
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')

const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const VIEWER = '00000000-0000-4000-8000-0000000000a1'
const DUAL = '00000000-0000-4000-8000-0000000000a2'
const SEASON = 'cccccccc-0000-4000-8000-000000000001'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any

/** Run statements as a signed-in browser session for `uid` (PostgREST's role). */
async function asUser(uid: string, statement: string) {
  await db.exec(`SELECT set_config('test.uid', '${uid}', false); SET ROLE authenticated; SET row_security = on;`)
  try {
    return await db.query(statement)
  } finally {
    await db.exec('RESET ROLE;')
  }
}

const profile = async (id: string) =>
  (await db.query(`SELECT role, is_active, full_name, phone, email FROM public.user_profiles WHERE id = '${id}'`)).rows[0]

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } })
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    if (f >= FILE) continue
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  // The prelude's auth.uid() is always NULL; RLS needs a caller. Supabase's
  // service_role bypasses RLS; the prelude's is a plain role.
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $fn$ SELECT nullif(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    ALTER ROLE service_role BYPASSRLS;`)
  await db.exec(`
    INSERT INTO public.organizations (id, name) VALUES ('${ORG_A}', 'A'), ('${ORG_B}', 'B') ON CONFLICT DO NOTHING;
    INSERT INTO auth.users (id, email) VALUES ('${VIEWER}', 'viewer@a.test'), ('${DUAL}', 'dual@a.test') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_profiles (id, email, full_name, role, is_active) VALUES
      ('${VIEWER}', 'viewer@a.test', 'V', 'viewer', false),
      ('${DUAL}', 'dual@a.test', 'D', 'agent', true)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active, full_name = EXCLUDED.full_name;
    DELETE FROM public.organization_members WHERE user_id IN ('${VIEWER}', '${DUAL}');
    INSERT INTO public.organization_members (org_id, user_id, role, created_at) VALUES
      ('${ORG_A}', '${VIEWER}', 'viewer', now()),
      ('${ORG_A}', '${DUAL}', 'admin', now() - interval '2 days'),
      ('${ORG_B}', '${DUAL}', 'agent', now() - interval '1 day');
    INSERT INTO public.pricing_seasons (id, org_id, name, uplift_percent) VALUES ('${SEASON}', '${ORG_A}', 'Golden Week', 15);
  `)
})

afterAll(async () => { await db?.close() })

describe('before 20270103', () => {
  it('a deactivated person could reactivate and promote themselves', async () => {
    await db.exec('BEGIN;')
    await asUser(VIEWER, `UPDATE public.user_profiles SET is_active = true, role = 'admin' WHERE id = '${VIEWER}'`)
    expect(await profile(VIEWER)).toMatchObject({ is_active: true, role: 'admin' })
    await db.exec('ROLLBACK;')
  })
})

describe('20270103 applied twice', () => {
  beforeAll(async () => {
    await db.exec(sql)
    await db.exec(sql)
  })

  it('a person cannot change their own active flag, role or email', async () => {
    await expect(asUser(VIEWER, `UPDATE public.user_profiles SET is_active = true WHERE id = '${VIEWER}'`)).rejects.toThrow(/administrator/)
    await expect(asUser(VIEWER, `UPDATE public.user_profiles SET role = 'admin' WHERE id = '${VIEWER}'`)).rejects.toThrow(/administrator/)
    await expect(asUser(VIEWER, `UPDATE public.user_profiles SET email = 'x@y.z' WHERE id = '${VIEWER}'`)).rejects.toThrow(/administrator/)
    expect(await profile(VIEWER)).toMatchObject({ is_active: false, role: 'viewer', email: 'viewer@a.test' })
  })

  it('a person can still edit their own name and phone', async () => {
    await asUser(DUAL, `UPDATE public.user_profiles SET full_name = 'Dee', phone = '123' WHERE id = '${DUAL}'`)
    expect(await profile(DUAL)).toMatchObject({ full_name: 'Dee', phone: '123' })
  })

  it('a shared-company admin can no longer update or delete another profile from the browser', async () => {
    const upd = await asUser(DUAL, `UPDATE public.user_profiles SET full_name = 'Hacked' WHERE id = '${VIEWER}'`)
    expect(upd.affectedRows ?? 0).toBe(0)
    const del = await asUser(DUAL, `DELETE FROM public.user_profiles WHERE id = '${VIEWER}'`)
    expect(del.affectedRows ?? 0).toBe(0)
    expect(await profile(VIEWER)).toMatchObject({ full_name: 'V' })
  })

  it('the server (service role, postgres) still changes role and active flag', async () => {
    await db.exec(`SET ROLE service_role; UPDATE public.user_profiles SET is_active = true WHERE id = '${VIEWER}'; RESET ROLE;`)
    expect((await profile(VIEWER)).is_active).toBe(true)
    await db.exec(`UPDATE public.user_profiles SET is_active = false WHERE id = '${VIEWER}'`)
    expect((await profile(VIEWER)).is_active).toBe(false)
  })

  it('a role change on the membership still reaches the mirror (definer function)', async () => {
    await db.exec(`UPDATE public.organization_members SET role = 'manager' WHERE org_id = '${ORG_A}' AND user_id = '${DUAL}'`)
    expect((await profile(DUAL)).role).toBe('manager')
  })

  it('removing the earliest membership re-mirrors the next one, or viewer when none is left', async () => {
    await db.exec(`DELETE FROM public.organization_members WHERE org_id = '${ORG_A}' AND user_id = '${DUAL}'`)
    expect((await profile(DUAL)).role).toBe('agent')
    await db.exec(`DELETE FROM public.organization_members WHERE org_id = '${ORG_B}' AND user_id = '${DUAL}'`)
    expect((await profile(DUAL)).role).toBe('viewer')
  })

  it('a member reads the season calendar but cannot change it from the browser', async () => {
    const read = await asUser(VIEWER, `SELECT uplift_percent FROM public.pricing_seasons WHERE id = '${SEASON}'`)
    expect(read.rows).toHaveLength(1)
    await expect(asUser(VIEWER, `UPDATE public.pricing_seasons SET uplift_percent = 0 WHERE id = '${SEASON}'`)).rejects.toThrow(/permission denied/)
    await expect(asUser(VIEWER, `INSERT INTO public.pricing_season_dates (org_id, season_id, start_date, end_date) VALUES ('${ORG_A}', '${SEASON}', '2027-01-01', '2027-01-02')`)).rejects.toThrow(/permission denied/)
    const pol = await db.query(`SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('pricing_seasons','pricing_season_dates') ORDER BY 1`)
    expect(pol.rows).toEqual([
      { policyname: 'pricing_season_dates_org_select', cmd: 'SELECT' },
      { policyname: 'pricing_seasons_org_select', cmd: 'SELECT' },
    ])
  })

  it('activity_log carries a detail column', async () => {
    const c = await db.query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'activity_log' AND column_name = 'detail'`)
    expect(c.rows).toEqual([{ data_type: 'jsonb' }])
  })
})
