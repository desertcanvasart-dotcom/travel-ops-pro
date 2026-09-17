// Migration 20261019, executed against a real Postgres (PGlite) on the
// schema every earlier migration builds. Operator, 2026-09-17: "something
// that checks if a customer request has been replied, and a guard for not
// replying to the same message more than one time".
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const TARGET = '20261019_email_reply_tracking.sql'
let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const rows = async (s: string) => (await db.query(s)).rows
const target = readFileSync(path.join(MIGRATIONS, TARGET), 'utf8')

const conv = async (thread: string) => (await rows(`
  SELECT to_char(awaiting_reply_since AT TIME ZONE 'UTC', 'MM-DD HH24:MI') AS awaiting,
         to_char(last_inbound_at AT TIME ZONE 'UTC', 'MM-DD HH24:MI') AS inbound,
         to_char(last_outbound_at AT TIME ZONE 'UTC', 'MM-DD HH24:MI') AS outbound,
         to_char(last_message_at AT TIME ZONE 'UTC', 'MM-DD HH24:MI') AS last
    FROM email_conversations WHERE thread_id = '${thread}'`))[0]
const message = (thread: string, id: string, direction: 'inbound' | 'outbound', at: string) =>
  db.exec(`INSERT INTO email_messages (conversation_id, message_id, thread_id, direction, from_address, sent_at, is_read)
           SELECT id, '${id}', '${thread}', '${direction}', 'x@example.com', '2026-09-${at}:00Z', true FROM email_conversations WHERE thread_id = '${thread}'`)

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f < TARGET).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  // Production before the migration: one conversation answered, one waiting.
  await db.exec(`INSERT INTO email_conversations (thread_id, client_email) VALUES ('answered', 'a@example.com'), ('waiting', 'w@example.com')`)
  await message('answered', 'a1', 'inbound', '01T09:00')
  await message('answered', 'a2', 'outbound', '01T10:00')
  await message('waiting', 'w1', 'inbound', '01T09:00')
  await message('waiting', 'w2', 'outbound', '01T10:00')
  await message('waiting', 'w3', 'inbound', '02T08:00')
  await message('waiting', 'w4', 'inbound', '02T09:00')
  await db.exec(target)
})

afterAll(async () => { await db?.close() })

describe('the backfill', () => {
  it('an answered conversation waits for nothing; a waiting one waits since the first message after our reply', async () => {
    expect((await conv('answered')).awaiting).toBeNull()
    expect(await conv('waiting')).toMatchObject({ awaiting: '09-02 08:00', inbound: '09-02 09:00', outbound: '09-01 10:00' })
  })
})

describe('every new message keeps the state right', () => {
  it('a reply — from the app or from Gmail — answers the conversation', async () => {
    await message('waiting', 'w5', 'outbound', '02T11:00')
    expect((await conv('waiting')).awaiting).toBeNull()
  })

  it('the customer writing again waits again', async () => {
    await message('waiting', 'w6', 'inbound', '03T07:00')
    expect((await conv('waiting')).awaiting).toBe('09-03 07:00')
  })

  it('an OLDER message synced late neither moves the conversation back in time nor changes who is waiting', async () => {
    await message('waiting', 'w0', 'inbound', '01T08:00')
    expect(await conv('waiting')).toMatchObject({ awaiting: '09-03 07:00', last: '09-03 07:00' })
  })
})

describe('the send claim', () => {
  it('one attempt key can be claimed once', async () => {
    await db.exec(`INSERT INTO email_send_claims (request_key, thread_id) VALUES ('k1', 'waiting')`)
    await expect(db.exec(`INSERT INTO email_send_claims (request_key, thread_id) VALUES ('k1', 'waiting')`)).rejects.toThrow()
  })

  it('running the migration again changes nothing', async () => {
    const before = await conv('waiting')
    await db.exec(target)
    expect(await conv('waiting')).toEqual(before)
  })
})
