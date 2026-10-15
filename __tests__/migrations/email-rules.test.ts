// Migration 20261202 on a real Postgres: rules, and the per-message mark.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })
const TARGET = '20261202_email_rules.sql'
let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }

const apply = async (f: string) => {
  await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
  await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f < TARGET).sort()) await apply(f)
  // Mail stored before the rules existed.
  await db.exec(`INSERT INTO email_messages (message_id, thread_id, direction, from_address, sent_at)
                 VALUES ('old', 't', 'inbound', 'a@b.co', now())`)
  await apply(TARGET)
})
afterAll(async () => { await db?.close() })

describe('email_rules', () => {
  it('mail already stored is marked checked; new mail is not', async () => {
    await db.exec(`INSERT INTO email_messages (message_id, thread_id, direction, from_address, sent_at)
                   VALUES ('new', 't', 'inbound', 'a@b.co', now())`)
    const rows = (await db.query(`SELECT message_id, rules_checked_at IS NOT NULL AS checked FROM email_messages ORDER BY message_id`)).rows
    expect(rows).toEqual([{ message_id: 'new', checked: false }, { message_id: 'old', checked: true }])
  })
  it('a rule stores its conditions and actions', async () => {
    await db.exec(`INSERT INTO organizations (id, name) VALUES ('11111111-1111-4111-8111-111111111111', 'ATS')`)
    await db.exec(`INSERT INTO email_rules (org_id, conditions, actions) VALUES ('11111111-1111-4111-8111-111111111111', '{"from":"@booking.com"}', '{"skip_inbox":true}')`)
    expect((await db.query(`SELECT enabled, applied_count FROM email_rules`)).rows[0]).toEqual({ enabled: true, applied_count: 0 })
  })
  it('applies twice without error', async () => {
    await apply(TARGET)
  })
})
