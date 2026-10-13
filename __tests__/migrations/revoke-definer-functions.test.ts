// Migration 20261129, executed against a real Postgres.
//
// SECURITY DEFINER functions bypass RLS, and every new function is executable
// by PUBLIC — plus the baseline's default privileges grant `authenticated`
// explicitly. With a second company live, any signed-in account (and anon,
// with the public key) could rpc get_org_agent_memories with another
// organisation's id and read its AI agent memory, revert another company's
// quote, delete its client. This pins that only service_role can call the
// server-only ones, and that the helpers RLS policies call stay callable.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261129_revoke_definer_functions.sql'

const SERVER_ONLY = [
  'public.get_org_agent_memories(uuid, uuid, text, double precision, integer)',
  'public.purge_expired_agent_memories()',
  'public.create_quote_revision(uuid, uuid, text)',
  'public.create_b2c_quote_revision(uuid, uuid, text)',
  'public.revert_quote_to_revision(uuid, integer, uuid, text)',
  'public.revert_b2c_quote_to_revision(uuid, integer, uuid, text)',
  'public.delete_client_safely(uuid)',
  'public.log_audit(character varying, character varying, uuid, jsonb, jsonb, character varying, text, jsonb)',
]

// Called by RLS policies as the signed-in user: revoking them would deny
// every row those policies guard.
const POLICY_HELPERS = [
  'public.user_is_in_org(uuid)',
  'public.user_is_org_owner(uuid)',
  'public.is_active_user()',
  'public.is_admin()',
  'public.is_agent_or_above()',
  'public.is_manager_or_above()',
]

let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const can = async (role: string, fn: string) =>
  (await db.query(`SELECT has_function_privilege('${role}', '${fn}', 'EXECUTE') AS ok`)).rows[0].ok as boolean
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f !== FILE).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
})

afterAll(async () => {
  await db?.close()
})

describe('before the migration', () => {
  it('a signed-in user could call every one of them (the hole is real)', async () => {
    // 20261210 replaces get_org_agent_memories and restates this revoke for it,
    // and the replay above includes every later file — so it is closed already.
    for (const fn of SERVER_ONLY.filter(f => !f.startsWith('public.get_org_agent_memories('))) {
      expect(await can('authenticated', fn), fn).toBe(true)
    }
  })
})

describe('after the migration (applied twice — it is idempotent)', () => {
  beforeAll(async () => {
    await db.exec(sql)
    await db.exec(sql)
  })

  for (const fn of SERVER_ONLY) {
    it(`${fn}: neither a signed-in user nor anon can call it; the service role can`, async () => {
      expect(await can('authenticated', fn)).toBe(false)
      expect(await can('anon', fn)).toBe(false)
      expect(await can('service_role', fn)).toBe(true)
    })
  }

  it('the helpers RLS policies call stay callable by a signed-in user', async () => {
    for (const fn of POLICY_HELPERS) expect(await can('authenticated', fn), fn).toBe(true)
  })

  it('no SECURITY DEFINER function that takes an argument is left callable by authenticated, except the policy helpers', async () => {
    const { rows } = await db.query(`
      SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef AND p.pronargs > 0
        AND p.prorettype <> 'trigger'::regtype
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')`)
    // user_shares_org_as: the user_profiles policies' helper (20261130).
    expect(rows.map(r => r.sig).sort()).toEqual(['user_is_in_org(uuid)', 'user_is_org_owner(uuid)', 'user_shares_org_as(uuid,text[])'])
  })

  it('a database without one of them still migrates (guarded, not assumed)', () => {
    expect(sql).toContain('IF to_regprocedure(sig) IS NOT NULL THEN')
  })
})
