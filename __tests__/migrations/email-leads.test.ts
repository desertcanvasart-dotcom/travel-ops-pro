// Migration 20261021 on a real Postgres. Operator, 2026-09-17: "a lead is a
// potential customer … if he confirmed, turn it into a customer" — and leads
// from new email only.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PRELUDE, MIGRATIONS } from '@/scripts/replay-core.mjs'
import { TRACKER_BOOTSTRAP } from '@/scripts/migrate-core.mjs'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const TARGET = '20261021_email_leads.sql'
const ORG = '11111111-1111-4111-8111-111111111111'
let db: { query(s: string): Promise<{ rows: any[] }>; exec(s: string): Promise<unknown>; close(): Promise<void> }
const rows = async (s: string) => (await db.query(s)).rows
const statusOf = async (email: string) => (await rows(`SELECT status FROM clients WHERE email = '${email}'`))[0]?.status

const client = (email: string, status: string) =>
  db.exec(`INSERT INTO clients (org_id, client_code, first_name, last_name, email, status) VALUES ('${ORG}', 'C-${email.split('@')[0]}', 'A', 'B', '${email}', '${status}')`)
const itinerary = async (code: string, clientEmail: string | null) => {
  const clientId = clientEmail ? `(SELECT id FROM clients WHERE email = '${clientEmail}')` : 'NULL'
  await db.exec(`INSERT INTO itineraries (org_id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, client_id)
                 VALUES ('${ORG}', '${code}', 'A B', 'Trip', '2026-11-01', '2026-11-05', 5, ${clientId})`)
}
const booking = (code: string, itineraryCode: string, email: string | null, status = 'pending') =>
  db.exec(`INSERT INTO bookings (org_id, booking_code, itinerary_id, client_name, client_email, trip_name, start_date, end_date, status)
           SELECT '${ORG}', '${code}', id, 'A B', ${email ? `'${email}'` : 'NULL'}, 'Trip', '2026-11-01', '2026-11-05', '${status}' FROM itineraries WHERE itinerary_code = '${itineraryCode}'`)

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } }) as any
  await db.exec(PRELUDE)
  await db.exec(TRACKER_BOOTSTRAP)
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql') && f < TARGET).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    await db.exec("SELECT pg_catalog.set_config('search_path','public',false);")
  }
  await db.exec(`INSERT INTO organizations (id, name) VALUES ('${ORG}', 'ATS')`)
  // Before the migration: a lead already booked, a lead not booked, an inbox conversation.
  await client('booked@example.com', 'lead')
  await itinerary('IT-1', 'booked@example.com')
  await booking('BK-1', 'IT-1', 'booked@example.com')
  await client('waiting@example.com', 'lead')
  await db.exec(`INSERT INTO email_conversations (thread_id, client_email) VALUES ('old-thread', 'someone@example.com')`)
  await db.exec(readFileSync(path.join(MIGRATIONS, TARGET), 'utf8'))
})

afterAll(async () => { await db?.close() })

describe('new email only', () => {
  it('every conversation already in the inbox is marked checked', async () => {
    expect(await rows(`SELECT lead_check FROM email_conversations WHERE thread_id = 'old-thread'`)).toEqual([{ lead_check: 'skipped' }])
  })
})

describe('a lead who books is a customer', () => {
  it('a lead already booked became a customer; one who has not stays a lead', async () => {
    expect(await statusOf('booked@example.com')).toBe('customer')
    expect(await statusOf('waiting@example.com')).toBe('lead')
  })

  it('a new booking promotes the itinerary\'s client', async () => {
    await itinerary('IT-2', 'waiting@example.com')
    await booking('BK-2', 'IT-2', null)
    expect(await statusOf('waiting@example.com')).toBe('customer')
  })

  it('without a client on the itinerary, the booking\'s email finds them; a cancelled booking promotes nobody', async () => {
    await client('by-email@example.com', 'lead')
    await client('cancelled@example.com', 'lead')
    await itinerary('IT-3', null)
    await booking('BK-3', 'IT-3', 'BY-EMAIL@example.com')
    await itinerary('IT-4', null)
    await booking('BK-4', 'IT-4', 'cancelled@example.com', 'cancelled')
    expect(await statusOf('by-email@example.com')).toBe('customer')
    expect(await statusOf('cancelled@example.com')).toBe('lead')
  })

  it('never demotes: an inactive client stays inactive', async () => {
    await client('inactive@example.com', 'inactive')
    await itinerary('IT-5', 'inactive@example.com')
    await booking('BK-5', 'IT-5', null)
    expect(await statusOf('inactive@example.com')).toBe('inactive')
  })

  it('runs again unchanged', async () => {
    await db.exec(readFileSync(path.join(MIGRATIONS, TARGET), 'utf8'))
    expect(await statusOf('waiting@example.com')).toBe('customer')
  })
})
