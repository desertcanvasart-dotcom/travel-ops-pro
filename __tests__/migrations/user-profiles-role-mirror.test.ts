// 20261008_user_profiles_role_mirror.sql, executed against a real Postgres
// (PGlite) on production-shaped tables: the backfill brings every mirror in
// line with its membership, the trigger keeps it there on insert and on a
// role change, owner mirrors as admin, and a second run changes nothing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

const MIGRATION = path.join(process.cwd(), 'migrations', '20261008_user_profiles_role_mirror.sql')
const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '')

const ORG = '11111111-1111-4111-8111-111111111111'
const OWNER = '00000000-0000-4000-8000-000000000001'
const VIEWER_SHOWN_AS_MANAGER = '00000000-0000-4000-8000-000000000002' // the production case
const MANAGER_SHOWN_AS_AGENT = '00000000-0000-4000-8000-000000000003'  // invited as manager, default mirror
const NO_MEMBERSHIP = '00000000-0000-4000-8000-000000000004'

const TABLES = `
  CREATE SCHEMA IF NOT EXISTS public;
  CREATE TABLE public.user_profiles (
    id uuid PRIMARY KEY,
    role varchar(50) DEFAULT 'agent'
      CONSTRAINT user_profiles_role_check CHECK (role IN ('admin','manager','agent','viewer'))
  );
  CREATE TABLE public.organization_members (
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member' NOT NULL
      CONSTRAINT organization_members_role_check CHECK (role IN ('owner','admin','manager','agent','viewer')),
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (org_id, user_id)
  );
  INSERT INTO public.user_profiles (id, role) VALUES
    ('${OWNER}', 'admin'),
    ('${VIEWER_SHOWN_AS_MANAGER}', 'manager'),
    ('${MANAGER_SHOWN_AS_AGENT}', 'agent'),
    ('${NO_MEMBERSHIP}', 'agent');
  INSERT INTO public.organization_members (org_id, user_id, role, created_at) VALUES
    ('${ORG}', '${OWNER}', 'owner', '2026-06-24'),
    ('${ORG}', '${VIEWER_SHOWN_AS_MANAGER}', 'viewer', '2026-08-26'),
    ('${ORG}', '${MANAGER_SHOWN_AS_AGENT}', 'manager', '2026-09-06');
`

describe('20261008 — user_profiles.role mirrors the membership', () => {
  const db = new PGlite()
  beforeAll(async () => { await db.exec(TABLES); await db.exec(sql) }, 60_000) // PGlite boots slowly under a full parallel run; 10s flaked twice on 2026-09-13
  afterAll(async () => { await db.close() })

  const mirror = async (id: string) =>
    (await db.query<{ role: string }>(`SELECT role FROM public.user_profiles WHERE id = '${id}'`)).rows[0]?.role

  it('backfills the mirror from the membership — the viewer shown as manager becomes viewer', async () => {
    expect(await mirror(VIEWER_SHOWN_AS_MANAGER)).toBe('viewer')
    expect(await mirror(MANAGER_SHOWN_AS_AGENT)).toBe('manager')
  })

  it('an owner mirrors as admin (the mirror has no owner value)', async () => {
    expect(await mirror(OWNER)).toBe('admin')
  })

  it('leaves a profile with no membership alone', async () => {
    expect(await mirror(NO_MEMBERSHIP)).toBe('agent')
  })

  it('a role change on the membership rewrites the mirror', async () => {
    await db.exec(`UPDATE public.organization_members SET role = 'manager' WHERE user_id = '${VIEWER_SHOWN_AS_MANAGER}'`)
    expect(await mirror(VIEWER_SHOWN_AS_MANAGER)).toBe('manager')
  })

  it('a new membership (invitation accepted) sets the mirror, whatever the profile carried', async () => {
    await db.exec(`INSERT INTO public.organization_members (org_id, user_id, role) VALUES ('${ORG}', '${NO_MEMBERSHIP}', 'viewer')`)
    expect(await mirror(NO_MEMBERSHIP)).toBe('viewer')
  })

  it('the mirror cannot be edited into disagreement for long: the next membership write restores it', async () => {
    await db.exec(`UPDATE public.user_profiles SET role = 'admin' WHERE id = '${MANAGER_SHOWN_AS_AGENT}'`)
    await db.exec(`UPDATE public.organization_members SET role = 'manager' WHERE user_id = '${MANAGER_SHOWN_AS_AGENT}'`)
    // same role written again: UPDATE OF role fires on the statement, not on a change
    expect(await mirror(MANAGER_SHOWN_AS_AGENT)).toBe('manager')
  })

  it('is idempotent: a second run passes its own verify and changes nothing', async () => {
    const before = (await db.query(`SELECT id, role FROM public.user_profiles ORDER BY id`)).rows
    await db.exec(sql)
    const after = (await db.query(`SELECT id, role FROM public.user_profiles ORDER BY id`)).rows
    expect(after).toEqual(before)
  })
})
