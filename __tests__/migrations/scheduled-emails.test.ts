// Migration 20261201 on a real Postgres: the table the scheduler sends from.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

const TARGET = '20261201_scheduled_emails.sql'
const ORG = '11111111-1111-4111-8111-111111111111'
const MB = '22222222-2222-4222-8222-222222222222'
let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }

const schedule = (draft: string, status = 'scheduled') =>
  db.exec(`INSERT INTO scheduled_emails (org_id, mailbox_user_id, draft_id, send_at, status)
           VALUES ('${ORG}', '${MB}', '${draft}', now() + interval '1 hour', '${status}')`)

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f <= TARGET).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`INSERT INTO organizations (id, name) VALUES ('${ORG}', 'ATS');`)
})

afterAll(async () => { await db?.close() })

describe('scheduled_emails', () => {
  it('a draft has one live schedule at a time', async () => {
    await schedule('d1')
    await expect(schedule('d1')).rejects.toMatchObject({ code: '23505' })
  })

  it('once cancelled or sent, the same draft can be scheduled again', async () => {
    await db.exec(`UPDATE scheduled_emails SET status = 'cancelled' WHERE draft_id = 'd1'`)
    await schedule('d1')
    expect((await db.query(`SELECT count(*)::int AS n FROM scheduled_emails WHERE draft_id = 'd1'`)).rows[0].n).toBe(2)
  })

  it('refuses an unknown status', async () => {
    await expect(schedule('d2', 'queued')).rejects.toThrow()
  })

  it('applies twice without error', async () => {
    await db.exec(readFileSync(path.join(MIGRATIONS, TARGET), 'utf8'))
  })
})
