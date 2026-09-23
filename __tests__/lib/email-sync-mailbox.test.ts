// App sweep, 2026-09-23: the scheduled Gmail sync (every 10 minutes) listed the
// last 50 messages and downloaded every one in full, one at a time — mail it
// already had — checked each against the store one query at a time, and
// rewrote every conversation it saw (firing auto_link_email_to_client). And it
// stored Gmail's resultSizeEstimate as the history id, so the incremental
// path could never be used. These pin the fixes (lib/email/sync-mailbox.ts).
import { vi, describe, it, expect, beforeEach } from 'vitest'

type Row = Record<string, any>

// ── An in-memory Supabase that records every write ────────────────────────
const h = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, Row[]>,
    writes: [] as Array<{ table: string; op: 'insert' | 'update' | 'upsert'; payload: Row }>,
    reads: [] as Array<{ table: string; filters: string[] }>,
    seq: 0,
  }
  const db = {
    from(table: string) {
      const rows = (state.tables[table] ??= [])
      const filters: Array<(r: Row) => boolean> = []
      const described: string[] = []
      let op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
      let payload: Row | null = null
      let result: Row[] | null = null
      const run = () => {
        if (result) return result
        if (op === 'insert') {
          const row = { id: `${table}-${++state.seq}`, ...payload }
          rows.push(row)
          state.writes.push({ table, op, payload: payload! })
          return (result = [row])
        }
        if (op === 'upsert') {
          state.writes.push({ table, op, payload: payload! })
          const existing = rows.find(r => r.user_id === payload!.user_id)
          const clean = Object.fromEntries(Object.entries(payload!).filter(([, v]) => v !== undefined))
          if (existing) Object.assign(existing, clean)
          else rows.push({ id: `${table}-${++state.seq}`, ...clean })
          return (result = [])
        }
        const matched = rows.filter(r => filters.every(f => f(r)))
        if (op === 'update') {
          state.writes.push({ table, op, payload: payload! })
          for (const r of matched) Object.assign(r, payload)
          return (result = matched)
        }
        state.reads.push({ table, filters: described })
        return (result = matched)
      }
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); described.push(`${c}=`); return q },
        in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); described.push(`${c} in`); return q },
        insert: (p: Row) => { op = 'insert'; payload = p; return q },
        update: (p: Row) => { op = 'update'; payload = p; return q },
        upsert: (p: Row) => { op = 'upsert'; payload = p; return q },
        single: async () => { const r = run(); return r[0] ? { data: r[0], error: null } : { data: null, error: { message: 'No rows' } } },
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve({ data: run(), error: null }).then(res, rej),
      }
      return q
    },
  }

  // ── Gmail ───────────────────────────────────────────────────────────────
  const gmail = {
    mailbox: new Map<string, Row>(), // id → full message
    listed: [] as string[], // what messages.list answers
    historyPages: [] as Array<Row | Error>,
    profileHistoryId: '9001',
    failGet: new Set<string>(),
    calls: { list: 0, get: [] as string[], threads: [] as string[], history: [] as Row[], profile: 0 },
  }
  const client = {
    users: {
      getProfile: async () => { gmail.calls.profile++; return { data: { emailAddress: 'info@travel2egypt.org', historyId: gmail.profileHistoryId } } },
      messages: {
        list: async () => {
          gmail.calls.list++
          const messages = gmail.listed.map(id => ({ id, threadId: gmail.mailbox.get(id)!.threadId }))
          // A COUNT — what the old code stored as the history id.
          return { data: { messages, resultSizeEstimate: 201 } }
        },
        get: async ({ id }: { id: string }) => {
          gmail.calls.get.push(id)
          if (gmail.failGet.has(id)) throw Object.assign(new Error('backend error'), { code: 500 })
          const m = gmail.mailbox.get(id)
          if (!m) throw Object.assign(new Error('Not Found'), { code: 404 })
          return { data: m }
        },
      },
      threads: {
        get: async ({ id }: { id: string }) => {
          gmail.calls.threads.push(id)
          return { data: { id, messages: [...gmail.mailbox.values()].filter(m => m.threadId === id) } }
        },
      },
      history: {
        list: async (params: Row) => {
          gmail.calls.history.push(params)
          const page = gmail.historyPages.shift()
          if (!page) return { data: { historyId: gmail.profileHistoryId } }
          if (page instanceof Error) throw page
          return { data: page }
        },
      },
    },
  }
  return { state, db, gmail, client }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.db }))
vi.mock('@/lib/gmail', () => ({
  getAuthenticatedGmail: async () => ({ gmail: h.client, accessToken: 'x', refreshToken: 'y', emailAddress: 'info@travel2egypt.org' }),
  getUserEmail: async () => 'info@travel2egypt.org',
}))
vi.mock('@/lib/copilot-intake', () => ({ createCopilotInboxEntry: async () => undefined }))

import { mapWithConcurrency, syncMailbox, FETCH_CONCURRENCY } from '@/lib/email/sync-mailbox'

const CUSTOMER = 'Narcis Poch <poch.narcis@gmail.com>'
const OFFICE = 'Info <info@travel2egypt.org>'

function msg(id: string, threadId: string, from: string, to: string, minute: number, labelIds = ['INBOX']) {
  return {
    id, threadId, labelIds, snippet: `snippet ${id}`,
    internalDate: String(Date.UTC(2026, 8, 23, 9, minute)),
    payload: {
      mimeType: 'text/plain',
      headers: [{ name: 'From', value: from }, { name: 'To', value: to }, { name: 'Subject', value: 'Siwa in November' }],
      body: { data: Buffer.from(`body ${id}`).toString('base64') },
    },
  }
}

/** The store as a previous run left it: thread t1 with m1, m2. */
function seedStore(opts: { historyId?: string | null } = {}) {
  h.state.tables = {
    email_conversations: [{ id: 'c1', thread_id: 't1', client_email: 'poch.narcis@gmail.com', subject: 'Siwa in November', message_count: 2 }],
    email_messages: [
      { id: 'e1', conversation_id: 'c1', message_id: 'm1', thread_id: 't1' },
      { id: 'e2', conversation_id: 'c1', message_id: 'm2', thread_id: 't1' },
    ],
    email_sync_state: opts.historyId === undefined ? [] : [{ id: 's1', user_id: 'u1', last_history_id: opts.historyId }],
    gmail_tokens: [{ email: 'info@travel2egypt.org' }],
    organizations: [{ office_email_addresses: [] }],
    clients: [], suppliers: [], b2b_partners: [],
  }
}

const writesTo = (table: string, op?: string) => h.state.writes.filter(w => w.table === table && (!op || w.op === op))
const storedHistoryId = () => h.state.tables.email_sync_state.find(r => r.user_id === 'u1')?.last_history_id

beforeEach(() => {
  h.state.writes = []
  h.state.reads = []
  h.gmail.mailbox = new Map()
  h.gmail.listed = []
  h.gmail.historyPages = []
  h.gmail.profileHistoryId = '9001'
  h.gmail.failGet = new Set()
  h.gmail.calls = { list: 0, get: [], threads: [], history: [], profile: 0 }
  for (const m of [
    msg('m1', 't1', CUSTOMER, OFFICE, 0),
    msg('m2', 't1', OFFICE, CUSTOMER, 5),
    msg('m3', 't1', CUSTOMER, OFFICE, 10),
  ]) h.gmail.mailbox.set(m.id, m)
})

describe('list-based sync (no usable history id)', () => {
  it('downloads only messages not already stored, checking the store in ONE query', async () => {
    seedStore()
    h.gmail.listed = ['m3', 'm2', 'm1'] // newest first, as Gmail lists
    const r = await syncMailbox('u1', { max_results: 50, days_back: 3 })
    expect(h.gmail.calls.get).toEqual(['m3']) // was: m3, m2, m1 — every run
    expect(h.state.reads.filter(q => q.table === 'email_messages')).toHaveLength(1)
    expect(writesTo('email_messages', 'insert').map(w => w.payload.message_id)).toEqual(['m3'])
    expect(r).toMatchObject({ messages_created: 1, messages_fetched: 1, messages_already_stored: 2, sync_mode: 'list' })
  })

  it('stores Gmail\'s real historyId, not resultSizeEstimate', async () => {
    seedStore()
    h.gmail.listed = ['m3', 'm2', 'm1']
    const r = await syncMailbox('u1', { max_results: 50, days_back: 3 })
    expect(h.gmail.calls.profile).toBe(1)
    expect(r.history_id).toBe('9001')
    expect(storedHistoryId()).toBe('9001') // was '201' — a message count
  })

  it('a run with nothing new writes no conversation and no message', async () => {
    seedStore()
    h.gmail.listed = ['m2', 'm1']
    const r = await syncMailbox('u1', { max_results: 50, days_back: 3 })
    expect(h.gmail.calls.get).toEqual([])
    expect(writesTo('email_conversations')).toEqual([]) // was: rewritten every run
    expect(writesTo('email_messages')).toEqual([])
    expect(r).toMatchObject({ conversations_updated: 0, messages_created: 0 })
  })

  it('a conversation that did get a message is touched once, and only last_sync_at', async () => {
    seedStore()
    h.gmail.listed = ['m3', 'm2', 'm1']
    const r = await syncMailbox('u1', { max_results: 50, days_back: 3 })
    const updates = writesTo('email_conversations', 'update')
    expect(updates).toHaveLength(1)
    expect(Object.keys(updates[0].payload)).toEqual(['last_sync_at'])
    expect(r.conversations_updated).toBe(1)
    // message_count is left to the insert trigger — not reset to "how many
    // this run listed" (it was set to 3 here, then the trigger added 1).
    expect(h.state.tables.email_conversations[0].message_count).toBe(2)
  })

  it('a draft is never stored — it would read as our reply', async () => {
    seedStore()
    h.gmail.mailbox.set('d1', msg('d1', 't1', OFFICE, CUSTOMER, 12, ['DRAFT']))
    h.gmail.listed = ['d1', 'm2', 'm1']
    await syncMailbox('u1', { max_results: 50, days_back: 3 })
    expect(writesTo('email_messages', 'insert')).toEqual([])
  })

  it('manual Sync (no use_history) lists even when a history id is stored', async () => {
    seedStore({ historyId: '5000' })
    h.gmail.listed = ['m3']
    await syncMailbox('u1', { max_results: 100, days_back: 30 })
    expect(h.gmail.calls.history).toHaveLength(0)
    expect(h.gmail.calls.list).toBe(1)
    expect(storedHistoryId()).toBe('9001')
  })
})

describe('history-based sync (the scheduled run)', () => {
  const cron = { max_results: 50, days_back: 3, use_history: true }

  it('replays history since the stored id instead of listing, and stores the new id', async () => {
    seedStore({ historyId: '5000' })
    h.gmail.historyPages = [{
      historyId: '5100',
      history: [
        { id: '5050', messagesAdded: [{ message: { id: 'm3', threadId: 't1', labelIds: ['INBOX', 'UNREAD'] } }] },
        // Gmail autosaving a reply the operator is still writing.
        { id: '5060', messagesAdded: [{ message: { id: 'd9', threadId: 't1', labelIds: ['DRAFT'] } }] },
      ],
    }]
    const r = await syncMailbox('u1', cron)
    expect(h.gmail.calls.history[0]).toMatchObject({ startHistoryId: '5000' })
    expect(h.gmail.calls.list).toBe(0)
    expect(h.gmail.calls.get).toEqual(['m3'])
    expect(writesTo('email_messages', 'insert').map(w => w.payload.message_id)).toEqual(['m3'])
    expect(r).toMatchObject({ sync_mode: 'history', history_id: '5100' })
    expect(storedHistoryId()).toBe('5100')
  })

  it('a reply sent from Gmail directly arrives through the history feed', async () => {
    seedStore({ historyId: '5000' })
    h.gmail.mailbox.set('m4', msg('m4', 't1', OFFICE, CUSTOMER, 20, ['SENT']))
    // A sent draft can keep its id: it shows up as SENT being added.
    h.gmail.historyPages = [{ historyId: '5200', history: [{ id: '5150', labelsAdded: [{ message: { id: 'm4', threadId: 't1', labelIds: ['SENT'] }, labelIds: ['SENT'] }] }] }]
    await syncMailbox('u1', cron)
    const inserted = writesTo('email_messages', 'insert')
    expect(inserted.map(w => [w.payload.message_id, w.payload.direction])).toEqual([['m4', 'outbound']])
  })

  it('falls back to listing when Gmail answers 404 (history id too old), and stores a fresh id', async () => {
    seedStore({ historyId: '5000' })
    h.gmail.historyPages = [Object.assign(new Error('Requested entity was not found.'), { code: 404 })]
    h.gmail.listed = ['m3', 'm2', 'm1']
    const r = await syncMailbox('u1', cron)
    expect(h.gmail.calls.history).toHaveLength(1)
    expect(h.gmail.calls.list).toBe(1)
    expect(h.gmail.calls.get).toEqual(['m3'])
    expect(r).toMatchObject({ sync_mode: 'list', history_id: '9001' })
    expect(storedHistoryId()).toBe('9001')
  })

  it('the resultSizeEstimate the old code stored (Gmail: 400) also falls back', async () => {
    seedStore({ historyId: '201' })
    h.gmail.historyPages = [Object.assign(new Error('Invalid startHistoryId'), { code: 400 })]
    h.gmail.listed = ['m3']
    const r = await syncMailbox('u1', cron)
    expect(r).toMatchObject({ sync_mode: 'list', history_id: '9001' })
  })

  it('a failed download holds the history id back, so the message is tried again', async () => {
    seedStore({ historyId: '5000' })
    h.gmail.failGet.add('m3')
    h.gmail.historyPages = [{ historyId: '5100', history: [{ id: '5050', messagesAdded: [{ message: { id: 'm3', threadId: 't1', labelIds: ['INBOX'] } }] }] }]
    const r = await syncMailbox('u1', cron)
    expect(r.history_id).toBe('5000')
    expect(storedHistoryId()).toBe('5000')
  })

  it('a thread new to the store is fetched whole, and judged on all of it', async () => {
    seedStore({ historyId: '5000' })
    // A customer wrote an hour ago (not yet stored — say, synced as machine
    // mail); now the operator replies from Gmail. History names the reply only.
    h.gmail.mailbox.set('n1', msg('n1', 't2', 'Booking <no-reply@bookings.example>', OFFICE, 1))
    h.gmail.mailbox.set('n2', msg('n2', 't2', OFFICE, 'Booking <no-reply@bookings.example>', 30, ['SENT']))
    h.gmail.historyPages = [{ historyId: '5300', history: [{ id: '5250', messagesAdded: [{ message: { id: 'n2', threadId: 't2', labelIds: ['SENT'] } }] }] }]
    const r = await syncMailbox('u1', cron)
    expect(h.gmail.calls.threads).toEqual(['t2'])
    expect(h.gmail.calls.get).toEqual([])
    expect(writesTo('email_messages', 'insert').map(w => w.payload.message_id)).toEqual(['n1', 'n2'])
    const conv = writesTo('email_conversations', 'insert')[0].payload
    expect(conv).toMatchObject({ thread_id: 't2', client_email: 'no-reply@bookings.example', message_count: 0 })
    expect(r.conversations_created).toBe(1)
  })

  it('a backlog larger than one run resumes from the last record read', async () => {
    seedStore({ historyId: '5000' })
    h.gmail.historyPages = Array.from({ length: 6 }, (_, i) => ({
      historyId: '9999', nextPageToken: `p${i + 1}`, history: [{ id: String(5001 + i) }],
    }))
    const r = await syncMailbox('u1', cron)
    expect(h.gmail.calls.history).toHaveLength(5)
    expect(r.history_id).toBe('5005') // not 9999: pages 6+ are still to read
  })
})

describe('bounded concurrency', () => {
  it('never has more than FETCH_CONCURRENCY in flight, and keeps input order', async () => {
    let inFlight = 0
    let peak = 0
    const out = await mapWithConcurrency(Array.from({ length: 17 }, (_, i) => i), FETCH_CONCURRENCY, async i => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise(r => setTimeout(r, 1 + (i % 3)))
      inFlight--
      return i * 2
    })
    expect(peak).toBe(FETCH_CONCURRENCY)
    expect(out).toEqual(Array.from({ length: 17 }, (_, i) => i * 2))
  })
})

describe('the office-address repair runs when there can be something to repair', () => {
  // applyOfficeRule scans email_messages with from_address ILIKE '%…%' — no
  // index serves that — and the cron ran it every 10 minutes.
  const scanningDb = () => {
    const scans: string[] = []
    const q: any = { select: () => q, eq: () => q, or: () => q, limit: () => q, then: (res: (v: unknown) => void) => res({ data: [], error: null }) }
    return { scans, from: (t: string) => { scans.push(t); return q }, rpc: async () => ({ data: null, error: null }) }
  }

  it('same rule within six hours: skipped; a changed rule or six hours later: runs', async () => {
    const { applyOfficeRuleWhenDue, resetOfficeRuleRepairSchedule } = await import('@/lib/email/office-addresses-server')
    const { officeRule } = await import('@/lib/email/office-addresses')
    resetOfficeRuleRepairSchedule()
    const db = scanningDb()
    const rule = officeRule(['info@travel2egypt.org'], [])
    const t0 = Date.UTC(2026, 8, 23, 9)

    expect(await applyOfficeRuleWhenDue(db, rule, t0)).toEqual({ messages: 0, conversations: 0 })
    const afterFirst = db.scans.length
    expect(afterFirst).toBeGreaterThan(0)

    expect(await applyOfficeRuleWhenDue(db, rule, t0 + 10 * 60_000)).toBeNull()
    expect(db.scans.length).toBe(afterFirst) // no scan at all

    // An address added in Settings changes the rule: repaired at once.
    const wider = officeRule(['info@travel2egypt.org'], ['ats-hj.com'])
    expect(await applyOfficeRuleWhenDue(db, wider, t0 + 20 * 60_000)).not.toBeNull()
    const afterChange = db.scans.length
    expect(afterChange).toBeGreaterThan(afterFirst)

    expect(await applyOfficeRuleWhenDue(db, wider, t0 + 7 * 3600_000)).not.toBeNull()
    expect(db.scans.length).toBeGreaterThan(afterChange)
  })
})
