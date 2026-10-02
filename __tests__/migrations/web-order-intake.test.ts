// Migration 20261106 on a real Postgres. The website's order emails become
// quotes by themselves: each inbound message is looked at once, each order
// recorded once, and a conversation of website notifications is not a lead.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const TARGET = '20261106_web_order_intake.sql'
const ORG = '11111111-1111-4111-8111-111111111111'
let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const rows = async (s: string) => (await db.query(s)).rows

const message = (gmailId: string, direction: string, sentAt: string) =>
  db.exec(`INSERT INTO email_messages (conversation_id, message_id, thread_id, direction, from_address, sent_at)
           SELECT id, '${gmailId}', 't-1', '${direction}', 'noreply@example.com', ${sentAt} FROM email_conversations WHERE thread_id = 't-1'`)

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f < TARGET).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`INSERT INTO organizations (id, name) VALUES ('${ORG}', 'Agency')`)
  await db.exec(`INSERT INTO email_conversations (thread_id, client_email) VALUES ('t-1', 'noreply@example.com')`)
  // Before the migration: an old inbound message, a recent one, a recent outbound one.
  await message('old-in', 'inbound', "now() - interval '30 days'")
  await message('new-in', 'inbound', "now() - interval '2 days'")
  await message('new-out', 'outbound', "now() - interval '1 day'")
  await db.exec(readFileSync(path.join(MIGRATIONS, TARGET), 'utf8'))
})

afterAll(async () => { await db?.close() })

describe('each inbound message is looked at once — new mail, with a fortnight of grace', () => {
  it('old mail and outbound mail are marked checked; a recent inbound message is left to be read', async () => {
    const r = await rows(`SELECT message_id, order_checked_at IS NOT NULL AS checked FROM email_messages ORDER BY message_id`)
    expect(r).toEqual([
      { message_id: 'new-in', checked: false },
      { message_id: 'new-out', checked: true },
      { message_id: 'old-in', checked: true },
    ])
  })
})

describe('web_order_intakes', () => {
  const intake = (gmailId: string, outcome = 'quote_created') =>
    db.exec(`INSERT INTO web_order_intakes (org_id, email_message_id, outcome, order_text)
             SELECT '${ORG}', id, '${outcome}', '●ツアーコード：X' FROM email_messages WHERE message_id = '${gmailId}'`)

  it('one row per message: the same message cannot be taken in twice', async () => {
    await intake('new-in')
    await expect(intake('new-in')).rejects.toThrow(/duplicate key|unique/i)
  })

  it('outcome is one of the three', async () => {
    await expect(intake('old-in', 'maybe')).rejects.toThrow(/web_order_intakes_outcome_values/)
    await intake('old-in', 'needs_attention')
  })

  it('a deleted email keeps its order (the link is cleared, the row and its text stay)', async () => {
    await db.exec(`DELETE FROM email_messages WHERE message_id = 'old-in'`)
    expect(await rows(`SELECT email_message_id, order_text FROM web_order_intakes WHERE outcome = 'needs_attention'`))
      .toEqual([{ email_message_id: null, order_text: '●ツアーコード：X' }])
  })
})

describe('programmes and the lead detector', () => {
  it('a programme carries its website page', async () => {
    await db.exec(`INSERT INTO tour_templates (template_code, template_name, tour_type, duration_days, website_url)
                   VALUES ('LXR-1', 'Luxor', 'day_tour', 1, 'https://www.example.com/opt_detail.php?id=67')`)
    expect(await rows(`SELECT website_url FROM tour_templates WHERE template_code = 'LXR-1'`))
      .toEqual([{ website_url: 'https://www.example.com/opt_detail.php?id=67' }])
  })

  it("'web_order' is a lead-check outcome; the old ones still are; nonsense is not", async () => {
    await db.exec(`UPDATE email_conversations SET lead_check = 'web_order' WHERE thread_id = 't-1'`)
    await db.exec(`UPDATE email_conversations SET lead_check = 'lead_created' WHERE thread_id = 't-1'`)
    await expect(db.exec(`UPDATE email_conversations SET lead_check = 'nonsense' WHERE thread_id = 't-1'`)).rejects.toThrow(/lead_check_values/)
  })
})
