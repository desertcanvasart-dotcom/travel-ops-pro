import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'
import { bareAddress, isOfficeAddress, normaliseOfficeEntry, officeRule } from '@/lib/email/office-addresses'

// Operator, 2026-09-17: replies sent from a colleague's office address
// (hello@ on the connected info@'s domain) read as the customer writing, so
// answered conversations stayed "awaiting reply". "Set the rule" — whatever
// mailbox is connected.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

describe('the office rule', () => {
  it('the connected mailbox and its own domain are the office', () => {
    const rule = officeRule(['info@travel2egypt.org'], [])
    expect(isOfficeAddress(rule, 'Hello Team <hello@travel2egypt.org>')).toBe(true)
    expect(isOfficeAddress(rule, 'INFO@travel2egypt.org')).toBe(true)
    expect(isOfficeAddress(rule, 'poch.narcis@gmail.com')).toBe(false)
    // A look-alike domain is not the office.
    expect(isOfficeAddress(rule, 'x@evil-travel2egypt.org')).toBe(false)
  })

  it('a public provider\'s domain says nothing about who sent it', () => {
    const rule = officeRule(['office.cairo@gmail.com'], [])
    expect(isOfficeAddress(rule, 'office.cairo@gmail.com')).toBe(true)
    expect(isOfficeAddress(rule, 'a.customer@gmail.com')).toBe(false)
  })

  it('Settings adds addresses and domains; anything else is refused', () => {
    expect(normaliseOfficeEntry(' @ATS-HJ.com ')).toBe('ats-hj.com')
    expect(normaliseOfficeEntry('Reservations@Partner.co.jp')).toBe('reservations@partner.co.jp')
    expect(normaliseOfficeEntry('not an address')).toBeNull()
    const rule = officeRule([], ['ats-hj.com', 'desk@partner.co.jp'])
    expect(isOfficeAddress(rule, 'info@ats-hj.com')).toBe(true)
    expect(isOfficeAddress(rule, 'desk@partner.co.jp')).toBe(true)
    expect(isOfficeAddress(rule, 'other@partner.co.jp')).toBe(false)
    expect(bareAddress('"A, B" <A@B.com>')).toBe('a@b.com')
  })
})

describe('wiring', () => {
  it('sync and the live poller judge direction by the rule, and the scheduled sync repairs stored mail', () => {
    const sync = readFileSync('lib/email/sync-mailbox.ts', 'utf8')
    expect(sync).toContain('isOfficeAddress(rule, from)')
    expect(sync).not.toMatch(/fromEmail === userEmail/)
    expect(readFileSync('app/api/gmail/poll/route.ts', 'utf8')).toContain('isOfficeAddress(officeRuleForPoll, fromEmail)')
    expect(readFileSync('app/api/cron/gmail-sync/route.ts', 'utf8')).toContain('applyOfficeRuleWhenDue(db, await loadOfficeRule(db))')
    expect(readFileSync('app/settings/email/page.tsx', 'utf8')).toContain('<OfficeAddressesCard />')
  })
})

describe('migration 20261020 — re-computing a conversation after mail is re-classified', () => {
  const TARGET = '20261020_email_office_addresses.sql'
  let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
    await db.exec(PRELUDE)
    await db.exec(TRACKER_BOOTSTRAP)
    for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f <= TARGET).sort()) {
      await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
      await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
    }
    await db.exec(`INSERT INTO email_conversations (thread_id, client_email) VALUES ('siwa', 'hello@travel2egypt.org')`)
    await db.exec(`INSERT INTO email_messages (conversation_id, message_id, thread_id, direction, from_address, sent_at, is_read)
      SELECT id, 'm1', 'siwa', 'inbound', 'poch.narcis@gmail.com', '2026-09-16T18:22:00Z', true FROM email_conversations;
      INSERT INTO email_messages (conversation_id, message_id, thread_id, direction, from_address, sent_at, is_read)
      SELECT id, 'm2', 'siwa', 'inbound', 'Hello <hello@travel2egypt.org>', '2026-09-16T19:59:00Z', true FROM email_conversations;`)
  })
  afterAll(async () => { await db?.close() })

  it('a hello@ reply stored as the customer, re-classified, answers the conversation', async () => {
    const waiting = async () => (await db.query(`SELECT awaiting_reply_since FROM email_conversations WHERE thread_id='siwa'`)).rows[0].awaiting_reply_since
    expect(await waiting()).not.toBeNull()
    await db.exec(`UPDATE email_messages SET direction = 'outbound' WHERE message_id = 'm2'`)
    await db.exec(`SELECT refresh_email_conversation_reply_state(id) FROM email_conversations WHERE thread_id='siwa'`)
    expect(await waiting()).toBeNull()
  })

  it('offices list defaults empty; only the service role may run the refresh', async () => {
    const { rows } = await db.query(`SELECT column_default FROM information_schema.columns WHERE table_name='organizations' AND column_name='office_email_addresses'`)
    expect(rows[0].column_default).toContain("'{}'")
    const can = async (role: string) => (await db.query(`SELECT has_function_privilege('${role}', 'public.refresh_email_conversation_reply_state(uuid)', 'EXECUTE') AS ok`)).rows[0].ok
    expect(await can('authenticated')).toBe(false)
    expect(await can('service_role')).toBe(true)
  })
})
