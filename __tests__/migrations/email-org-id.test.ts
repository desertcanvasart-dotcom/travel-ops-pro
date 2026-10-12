// Migration 20261204, executed against a real Postgres with RLS enforced.
//
// gmail_tokens, email_conversations, email_messages and email_templates had
// no org_id, and copilot threads / concierge briefs could have none. Every
// existing row of each kind is seeded BEFORE the migration (all the others
// replayed first), the migration is applied twice, and then: which company
// each row went to, what was listed for review, NOT NULL, the per-company
// unique keys, the trigger, and what a signed-in user of each company may
// read through PostgREST.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const FILE = '20261204_email_org_id.sql'
const ORG_T = '70000000-0000-4000-8000-000000000001' // Travel2Egypt (older, the default)
const ORG_A = '70000000-0000-4000-8000-000000000002' // ATS
const T_ONLY = '71000000-0000-4000-8000-000000000001'
const A_ONLY = '71000000-0000-4000-8000-000000000002'
const BOTH = '71000000-0000-4000-8000-000000000003' // in both, @travel2egypt.org
const BOTH_ATS = '71000000-0000-4000-8000-000000000004' // in both, @ats-hj.com
const NOBODY = '71000000-0000-4000-8000-000000000005' // in no company
const T_NOTOKEN = '71000000-0000-4000-8000-000000000006' // in T, never connected
const C_T = '72000000-0000-4000-8000-000000000001'
const C_A = '72000000-0000-4000-8000-000000000002'
const WA_A = '73000000-0000-4000-8000-000000000001'
const B_CLIENT = '74000000-0000-4000-8000-000000000001'
const B_THREAD = '74000000-0000-4000-8000-000000000002'
const B_NONE = '74000000-0000-4000-8000-000000000003'
const conv = (n: number) => `75000000-0000-4000-8000-00000000000${n}`
const thread = (n: number) => `76000000-0000-4000-8000-00000000000${n}`
const msg = (n: number) => `77000000-0000-4000-8000-00000000000${n}`
const tpl = (n: number) => `78000000-0000-4000-8000-00000000000${n}`
const TM_BOTH_T = '79000000-0000-4000-8000-000000000001'
const TM_BOTH_A = '79000000-0000-4000-8000-000000000002'
const TM_T_ONLY = '79000000-0000-4000-8000-000000000003'

const TABLES = ['gmail_tokens', 'email_conversations', 'email_messages', 'email_templates', 'email_sync_state',
  'communication_threads', 'communication_inbox', 'communication_drafts', 'concierge_briefs']

let db: { query(s: string): Promise<{ rows: any[]; affectedRows?: number }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const sql = readFileSync(path.join(MIGRATIONS, FILE), 'utf8')
const one = async (q: string) => (await db.query(q)).rows[0]
const orgOf = async (table: string, id: string) => (await one(`SELECT org_id FROM ${table} WHERE id = '${id}'`))?.org_id
const reviewed = async (table: string) =>
  Object.fromEntries((await db.query(`SELECT row_id, assigned_org, reason FROM org_backfill_review WHERE table_name = '${table}' ORDER BY row_id`)).rows
    .map((r: any) => [r.row_id, { org: r.assigned_org, reason: r.reason }]))

async function as<T>(uid: string, q: string): Promise<T[]> {
  await db.exec('BEGIN')
  try {
    await db.exec(`SELECT set_config('test.uid', '${uid}', true); SET LOCAL row_security = on; SET LOCAL ROLE authenticated;`)
    return (await db.query(q)).rows as T[]
  } finally {
    await db.exec('ROLLBACK')
  }
}

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
    -- Slugged as 20261202 slugs them on the live install.
    INSERT INTO organizations (id, name, created_at, office_email_addresses, slug) VALUES
      ('${ORG_T}', 'Travel2Egypt', '2025-01-01', '{}', 'travel2egypt'), ('${ORG_A}', 'ATS', '2026-06-01', '{ats-hj.com}', 'ats');
    INSERT INTO auth.users (id, email) VALUES
      ('${T_ONLY}', 'ops@travel2egypt.org'), ('${A_ONLY}', 'staff@ats-hj.com'), ('${BOTH}', 'owner@travel2egypt.org'),
      ('${BOTH_ATS}', 'boss@ats-hj.com'), ('${NOBODY}', 'gone@gmail.com'), ('${T_NOTOKEN}', 'sales@travel2egypt.org')
      ON CONFLICT DO NOTHING;
    INSERT INTO user_profiles (id, email, role, is_active) VALUES
      ('${T_ONLY}', 'ops@travel2egypt.org', 'agent', true), ('${A_ONLY}', 'staff@ats-hj.com', 'agent', true),
      ('${BOTH}', 'owner@travel2egypt.org', 'admin', true), ('${BOTH_ATS}', 'boss@ats-hj.com', 'admin', true)
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    DELETE FROM organization_members WHERE user_id IN ('${T_ONLY}', '${A_ONLY}', '${BOTH}', '${BOTH_ATS}', '${NOBODY}', '${T_NOTOKEN}');
    INSERT INTO organization_members (org_id, user_id, role) VALUES
      ('${ORG_T}', '${T_ONLY}', 'agent'), ('${ORG_A}', '${A_ONLY}', 'agent'),
      ('${ORG_T}', '${BOTH}', 'owner'), ('${ORG_A}', '${BOTH}', 'admin'),
      ('${ORG_T}', '${BOTH_ATS}', 'admin'), ('${ORG_A}', '${BOTH_ATS}', 'owner'),
      ('${ORG_T}', '${T_NOTOKEN}', 'agent');
    INSERT INTO clients (id, client_code, first_name, last_name, email, org_id) VALUES
      ('${C_T}', 'C-T', 'Taro', 'T', 'taro@cust.example', '${ORG_T}'),
      ('${C_A}', 'C-A', 'Aiko', 'A', 'aiko@cust.example', '${ORG_A}');
    INSERT INTO whatsapp_conversations (id, phone_number, org_id) VALUES ('${WA_A}', '+819000000001', '${ORG_A}');
    -- As 20261203 (batch 1a) leaves team_members: an org_id, and one row per
    -- company for a person in both.
    ALTER TABLE team_members ADD COLUMN IF NOT EXISTS org_id uuid;
    INSERT INTO team_members (id, name, email, user_id, org_id) VALUES
      ('${TM_BOTH_T}', 'Owner', 'owner@travel2egypt.org', '${BOTH}', '${ORG_T}'),
      ('${TM_BOTH_A}', 'Owner', 'owner@travel2egypt.org', '${BOTH}', '${ORG_A}'),
      ('${TM_T_ONLY}', 'Ops', 'ops@travel2egypt.org', '${T_ONLY}', '${ORG_T}');

    -- Mailboxes, one per kind.
    INSERT INTO gmail_tokens (user_id, email, access_token, refresh_token, token_expiry, created_at) VALUES
      ('${T_ONLY}', 'info@travel2egypt.org', 'x', 'y', now(), '2026-01-01'),
      ('${A_ONLY}', 'yoyaku@ats-hj.com', 'x', 'y', now(), '2026-02-01'),
      ('${BOTH}', 'owner@travel2egypt.org', 'x', 'y', now(), '2026-03-01'),
      ('${BOTH_ATS}', 'boss@ats-hj.com', 'x', 'y', now(), '2026-04-01'),
      ('${NOBODY}', 'gone@gmail.com', 'x', 'y', now(), '2026-05-01');

    -- Conversations, one per rule.
    INSERT INTO email_conversations (id, thread_id, user_id, client_id, client_email, mailbox_email) VALUES
      ('${conv(1)}', 'th-client', '${T_ONLY}', '${C_A}', 'aiko@cust.example', 'info@travel2egypt.org'), -- client (A) vs mailbox (T)
      ('${conv(2)}', 'th-mailbox', NULL, NULL, 'x@cust.example', 'yoyaku@ats-hj.com'),                  -- mailbox → A
      ('${conv(3)}', 'th-user-token', '${A_ONLY}', NULL, 'y@cust.example', NULL),                        -- user's token → A
      ('${conv(4)}', 'th-user-org', '${T_NOTOKEN}', NULL, 'z@cust.example', 'old@travel2egypt.org'),     -- user's one company → T
      ('${conv(5)}', 'th-office', NULL, NULL, 'w@cust.example', 'desk@ats-hj.com'),                      -- ATS lists ats-hj.com → A
      ('${conv(6)}', 'th-office-reply', NULL, NULL, 'v@cust.example', NULL),                            -- replied from desk@ats-hj.com → A
      ('${conv(7)}', 'th-nothing', NULL, NULL, 'u@cust.example', 'random@else.example'),                 -- default + review
      ('${conv(8)}', 'th-both', '${BOTH}', NULL, 's@cust.example', NULL);                                -- follows BOTH's token
    -- Assigned to the person's row in the other company; to someone with no row there.
    UPDATE email_conversations SET assigned_team_member_id = '${TM_BOTH_A}' WHERE id = '${conv(8)}';
    UPDATE email_conversations SET assigned_team_member_id = '${TM_T_ONLY}' WHERE id = '${conv(2)}';
    INSERT INTO email_messages (id, conversation_id, message_id, thread_id, direction, from_address, sent_at) VALUES
      ('${msg(1)}', '${conv(1)}', 'g-1', 'th-client', 'inbound', 'aiko@cust.example', '2026-09-01'),
      ('${msg(2)}', '${conv(6)}', 'g-2', 'th-office-reply', 'outbound', 'Desk <desk@ats-hj.com>', '2026-09-02'),
      ('${msg(3)}', NULL, 'g-3', 'th-mailbox', 'inbound', 'x@cust.example', '2026-09-03'),               -- orphan, thread → A
      ('${msg(4)}', NULL, 'g-4', 'th-nowhere', 'inbound', 'q@cust.example', '2026-09-04');               -- orphan, untraceable

    INSERT INTO email_templates (id, user_id, name, subject, content) VALUES
      ('${tpl(1)}', '${A_ONLY}', 'A', 's', 'c'), ('${tpl(2)}', '${BOTH}', 'Both', 's', 'c');

    -- Briefs and copilot threads with no org.
    INSERT INTO concierge_briefs (id, conversation_id, client_id, raw_payload) VALUES
      ('${B_CLIENT}', 'cv-1', '${C_A}', '{}'), ('${B_THREAD}', 'cv-2', NULL, '{}'), ('${B_NONE}', 'cv-3', NULL, '{}');
    INSERT INTO communication_threads (id, channel, contact_info, org_id, whatsapp_conversation_id, email_conversation_id, brief_id, client_id) VALUES
      ('${thread(1)}', 'whatsapp', '+81', NULL, '${WA_A}', NULL, NULL, NULL),
      ('${thread(2)}', 'email', 'x', NULL, NULL, '${conv(2)}', NULL, NULL),
      ('${thread(3)}', 'email', 'x', NULL, NULL, NULL, '${B_CLIENT}', NULL),
      ('${thread(4)}', 'email', 'x', NULL, NULL, NULL, NULL, '${C_T}'),
      ('${thread(5)}', 'email', 'x', NULL, NULL, NULL, NULL, NULL),
      ('${thread(6)}', 'email', 'x', '${ORG_A}', NULL, NULL, '${B_THREAD}', NULL);
    INSERT INTO communication_inbox (thread_id, channel, source_message_id, sender_contact, message_body) VALUES
      ('${thread(1)}', 'whatsapp', 'src-1', '+81', 'hi'), ('${thread(4)}', 'email', 'src-4', 'x', 'hi');
    INSERT INTO email_sync_state (user_id) VALUES ('${T_ONLY}'), ('${A_ONLY}');
  `)
  await db.exec(sql)
  await db.exec(sql) // twice: idempotent
  await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $fn$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $fn$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ${TABLES.join(', ')} TO authenticated;`)
})

afterAll(async () => {
  await db?.close()
})

describe('every mailbox serves one company', () => {
  it('by its owner, by an ATS address, else the default — listed when the owner is in both', async () => {
    const orgs = Object.fromEntries((await db.query('SELECT user_id, org_id FROM gmail_tokens')).rows.map((r: any) => [r.user_id, r.org_id]))
    expect(orgs).toEqual({ [T_ONLY]: ORG_T, [A_ONLY]: ORG_A, [BOTH]: ORG_T, [BOTH_ATS]: ORG_A, [NOBODY]: ORG_T })
    const review = Object.values(await reviewed('gmail_tokens')) as Array<{ org: string; reason: string }>
    expect(review.map(r => r.reason).sort()).toEqual([
      'mailbox owner in no company — mailbox assigned to default',
      'person in both companies — mailbox assigned to default; reconnect from the other company to move it',
    ])
    expect(review.every(r => r.org === ORG_T)).toBe(true)
  })
})

describe('email conversations', () => {
  it('client, then mailbox, then user, then office address, else default', async () => {
    expect(await orgOf('email_conversations', conv(1))).toBe(ORG_A) // its client's
    expect(await orgOf('email_conversations', conv(2))).toBe(ORG_A) // its mailbox's
    expect(await orgOf('email_conversations', conv(3))).toBe(ORG_A) // its user's connection
    expect(await orgOf('email_conversations', conv(4))).toBe(ORG_T) // its user's one company
    expect(await orgOf('email_conversations', conv(5))).toBe(ORG_A) // ATS's listed domain
    expect(await orgOf('email_conversations', conv(6))).toBe(ORG_A) // replied from ATS's domain
    expect(await orgOf('email_conversations', conv(7))).toBe(ORG_T) // default
    expect(await orgOf('email_conversations', conv(8))).toBe(ORG_T) // BOTH's connection (defaulted)
  })

  it('lists the client-vs-mailbox conflict and the untraceable one', async () => {
    const review = await reviewed('email_conversations')
    expect(Object.keys(review).sort()).toEqual([conv(1), conv(2), conv(7)].sort())
    expect(review[conv(1)]).toEqual({ org: ORG_A, reason: 'linked client and mailbox in different companies — assigned by the client' })
    expect(review[conv(7)]).toEqual({ org: ORG_T, reason: 'untraceable conversation — assigned to default' })
  })

  it("an assignment moves to the same person's team member row in the conversation's company, else is listed", async () => {
    expect((await one(`SELECT assigned_team_member_id AS t FROM email_conversations WHERE id = '${conv(8)}'`)).t).toBe(TM_BOTH_T)
    expect((await one(`SELECT assigned_team_member_id AS t FROM email_conversations WHERE id = '${conv(2)}'`)).t).toBe(TM_T_ONLY)
    expect((await reviewed('email_conversations'))[conv(2)]).toEqual({
      org: ORG_A, reason: "email_conversations.assigned_team_member_id points at another company's team member",
    })
  })

  it('the same Gmail thread id is a conversation in each company — and one per mailbox within one', async () => {
    await db.exec(`INSERT INTO email_conversations (thread_id, org_id, mailbox_email) VALUES ('th-shared', '${ORG_T}', 'info@travel2egypt.org'), ('th-shared', '${ORG_A}', 'yoyaku@ats-hj.com')`)
    await expect(db.exec(`INSERT INTO email_conversations (thread_id, org_id, mailbox_email) VALUES ('th-shared', '${ORG_T}', 'INFO@travel2egypt.org')`)).rejects.toThrow()
    // Address unknown: one per company and thread too.
    await db.exec(`INSERT INTO email_conversations (thread_id, org_id) VALUES ('th-legacy', '${ORG_T}')`)
    await expect(db.exec(`INSERT INTO email_conversations (thread_id, org_id) VALUES ('th-legacy', '${ORG_T}')`)).rejects.toThrow()
    await db.exec("DELETE FROM email_conversations WHERE thread_id IN ('th-shared', 'th-legacy')")
  })

  it('links a conversation only to a client of its own company', async () => {
    await db.exec(`INSERT INTO email_conversations (id, thread_id, org_id, mailbox_email, client_email) VALUES
      ('${conv(9)}', 'th-link-own', '${ORG_T}', 'info@travel2egypt.org', 'TARO@cust.example')`)
    expect((await one(`SELECT client_id FROM email_conversations WHERE id = '${conv(9)}'`)).client_id).toBe(C_T)
    await db.exec(`INSERT INTO email_conversations (thread_id, org_id, mailbox_email, client_email) VALUES
      ('th-link-foreign', '${ORG_T}', 'info@travel2egypt.org', 'aiko@cust.example')`)
    expect((await one("SELECT client_id FROM email_conversations WHERE thread_id = 'th-link-foreign'")).client_id).toBeNull()
    await db.exec(`DELETE FROM email_conversations WHERE thread_id IN ('th-link-own', 'th-link-foreign')`)
  })
})

describe('email messages', () => {
  it('follow their conversation; an orphan its thread; else the default, listed', async () => {
    expect(await orgOf('email_messages', msg(1))).toBe(ORG_A)
    expect(await orgOf('email_messages', msg(2))).toBe(ORG_A)
    expect(await orgOf('email_messages', msg(3))).toBe(ORG_A)
    expect(await orgOf('email_messages', msg(4))).toBe(ORG_T)
    expect(Object.keys(await reviewed('email_messages'))).toEqual([msg(4)])
  })

  it('the same Gmail message id can be stored once per company', async () => {
    await db.exec(`INSERT INTO email_messages (conversation_id, org_id, message_id, thread_id, direction, from_address, sent_at) VALUES
      ('${conv(7)}', '${ORG_T}', 'g-1', 'th-nothing', 'inbound', 'a@b', now())`)
    await expect(db.exec(`INSERT INTO email_messages (conversation_id, org_id, message_id, thread_id, direction, from_address, sent_at) VALUES
      ('${conv(7)}', '${ORG_T}', 'g-1', 'th-nothing', 'inbound', 'a@b', now())`)).rejects.toThrow()
    await db.exec(`DELETE FROM email_messages WHERE org_id = '${ORG_T}' AND message_id = 'g-1'`)
  })

  it('a message cannot sit in another company than its conversation', async () => {
    await expect(db.exec(`INSERT INTO email_messages (conversation_id, org_id, message_id, thread_id, direction, from_address, sent_at) VALUES
      ('${conv(2)}', '${ORG_T}', 'g-x', 'th-mailbox', 'inbound', 'a@b', now())`)).rejects.toThrow()
  })

  it('the reply state is recomputed from the conversation\'s own company\'s messages', async () => {
    await db.exec(`SELECT refresh_email_conversation_reply_state('${conv(1)}')`)
    expect((await one(`SELECT last_inbound_at FROM email_conversations WHERE id = '${conv(1)}'`)).last_inbound_at).not.toBeNull()
  })
})

describe('templates, copilot threads and concierge briefs', () => {
  it('templates go to their owner\'s one company, else the default (listed)', async () => {
    expect(await orgOf('email_templates', tpl(1))).toBe(ORG_A)
    expect(await orgOf('email_templates', tpl(2))).toBe(ORG_T)
    expect(Object.keys(await reviewed('email_templates'))).toEqual([tpl(2)])
  })

  it('NULL-org threads and briefs are assigned, and org_id is NOT NULL', async () => {
    expect(await orgOf('communication_threads', thread(1))).toBe(ORG_A) // WhatsApp conversation
    expect(await orgOf('communication_threads', thread(2))).toBe(ORG_A) // email conversation
    expect(await orgOf('communication_threads', thread(3))).toBe(ORG_A) // brief (by its client)
    expect(await orgOf('communication_threads', thread(4))).toBe(ORG_T) // client
    expect(await orgOf('communication_threads', thread(5))).toBe(ORG_T) // default
    expect(await orgOf('communication_threads', thread(6))).toBe(ORG_A) // already set, unchanged
    expect(Object.keys(await reviewed('communication_threads'))).toEqual([thread(5)])
    expect(await orgOf('concierge_briefs', B_CLIENT)).toBe(ORG_A)
    expect(await orgOf('concierge_briefs', B_THREAD)).toBe(ORG_A)
    expect(await orgOf('concierge_briefs', B_NONE)).toBe(ORG_T)
    expect(Object.keys(await reviewed('concierge_briefs'))).toEqual([B_NONE])
  })

  it('every org_id is NOT NULL, with no default — the code stamps it', async () => {
    const { rows } = await db.query(`SELECT table_name, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'org_id' AND table_name IN
      ('gmail_tokens', 'email_conversations', 'email_messages', 'email_templates', 'communication_threads', 'concierge_briefs')`)
    expect(rows).toHaveLength(6)
    for (const r of rows) expect(r, r.table_name).toMatchObject({ is_nullable: 'NO', column_default: null })
  })

  it('the dead union view is gone', async () => {
    expect((await one("SELECT to_regclass('public.unified_conversations') AS v")).v).toBeNull()
  })
})

describe('through PostgREST (RLS)', () => {
  const orgsSeen = async (uid: string, table: string) =>
    [...new Set((await as<{ o: string }>(uid, `SELECT org_id AS o FROM ${table}`)).map(r => r.o))].sort()

  it("each company's agent reads only its own mail, templates, threads and briefs", async () => {
    for (const t of ['email_conversations', 'email_messages', 'communication_threads', 'concierge_briefs']) {
      expect(await orgsSeen(T_ONLY, t), t).toEqual([ORG_T])
      expect(await orgsSeen(A_ONLY, t), t).toEqual([ORG_A])
    }
    expect(await orgsSeen(A_ONLY, 'email_templates')).toEqual([ORG_A])
  })

  it('inbox messages follow their thread', async () => {
    expect((await as<{ thread_id: string }>(A_ONLY, 'SELECT thread_id FROM communication_inbox')).map(r => r.thread_id)).toEqual([thread(1)])
    expect((await as<{ thread_id: string }>(T_ONLY, 'SELECT thread_id FROM communication_inbox')).map(r => r.thread_id)).toEqual([thread(4)])
  })

  it('a mailbox connection is readable only by its owner; sync state only by its user', async () => {
    expect((await as<{ user_id: string }>(A_ONLY, 'SELECT user_id FROM gmail_tokens')).map(r => r.user_id)).toEqual([A_ONLY])
    expect((await as<{ user_id: string }>(A_ONLY, 'SELECT user_id FROM email_sync_state')).map(r => r.user_id)).toEqual([A_ONLY])
  })

  it("nobody writes into the other company's mail", async () => {
    await expect(as(A_ONLY, `INSERT INTO email_conversations (thread_id, org_id) VALUES ('th-x', '${ORG_T}')`)).rejects.toThrow()
    expect((await as(A_ONLY, `UPDATE email_conversations SET subject = 'x' WHERE org_id = '${ORG_T}' RETURNING id`))).toEqual([])
  })

  it('a member of both companies sees both — they belong to both', async () => {
    expect(await orgsSeen(BOTH, 'email_conversations')).toEqual([ORG_T, ORG_A].sort())
  })

  it('no policy on these tables is left without an org (or own-row) condition', async () => {
    const { rows } = await db.query(`SELECT tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
      FROM pg_policies WHERE schemaname = 'public' AND tablename IN (${TABLES.map(t => `'${t}'`).join(', ')})`)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      const own = r.tablename === 'email_sync_state'
      expect(r.expr, `${r.tablename}.${r.policyname}`).toContain(own ? 'auth.uid()' : 'user_is_in_org')
    }
  })
})
