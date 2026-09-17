import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { claimSend, finishSend, replyBodyHash, threadConflict } from '@/lib/email/send-guard'
import { hoursWaiting, isReplyOverdue, waitingLabel, REPLY_OVERDUE_HOURS } from '@/lib/email/reply-status'

// Operator, 2026-09-17: "a guard for not sending or replying to the same
// message more than one time" — and a check that a customer was answered.

type Row = Record<string, any>

/** Just enough of a Supabase client for the guard: filters, order, limit. */
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const data = (tables[table] ??= [])
      const filters: Array<(r: Row) => boolean> = []
      let order: { col: string; asc: boolean } | null = null
      let limit = Infinity
      let patch: Row | null = null
      let selectAfterUpdate = false
      const run = () => {
        let out = data.filter(r => filters.every(f => f(r)))
        if (patch) { for (const r of out) Object.assign(r, patch); return { data: selectAfterUpdate ? out : null, error: null } }
        if (order) out = [...out].sort((a, b) => (a[order!.col] < b[order!.col] ? -1 : 1) * (order!.asc ? 1 : -1))
        return { data: out.slice(0, limit), error: null }
      }
      const q: any = {
        select: () => { if (patch) selectAfterUpdate = true; return q },
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
        gt: (c: string, v: string) => { filters.push(r => r[c] > v); return q },
        in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return q },
        order: (col: string, o: { ascending: boolean }) => { order = { col, asc: o.ascending }; return q },
        limit: (n: number) => { limit = n; return q },
        maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
        then: (res: (v: unknown) => void) => res(run()),
        update: (p: Row) => { patch = p; return q },
        insert: async (row: Row) => {
          if (table === 'email_send_claims' && data.some(r => r.request_key === row.request_key)) return { error: { code: '23505' } }
          data.push({ created_at: new Date().toISOString(), ...row }); return { error: null }
        },
      }
      return q
    },
  }
}

describe('one reply, one email', () => {
  it('the same attempt key is claimed once; the second answer is the first attempt', async () => {
    const db = fakeDb({})
    const info = { userId: 'u1', threadId: 't1', bodyHash: 'h' }
    expect(await claimSend(db, 'k1', info)).toEqual({ ok: true })
    expect(await claimSend(db, 'k1', info)).toMatchObject({ ok: false, status: 'sending' })
    await finishSend(db, 'k1', { ok: true, gmailMessageId: 'g1', gmailThreadId: 't1' })
    expect(await claimSend(db, 'k1', info)).toEqual({ ok: false, status: 'sent', gmailMessageId: 'g1', gmailThreadId: 't1' })
  })

  it('before migration 20261019 (no claims table) sending still works', async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: 'PGRST205' } }) }) }
    expect(await claimSend(db, 'k1', { userId: 'u1', threadId: 't1', bodyHash: 'h' })).toEqual({ ok: true })
  })

  it('a failed attempt can be retried with its key', async () => {
    const db = fakeDb({})
    await claimSend(db, 'k1', { userId: 'u1', threadId: 't1', bodyHash: 'h' })
    await finishSend(db, 'k1', { ok: false })
    expect(await claimSend(db, 'k1', { userId: 'u1', threadId: 't1', bodyHash: 'h' })).toEqual({ ok: true })
  })
})

describe('somebody already answered', () => {
  const tables = () => ({
    email_messages: [
      { thread_id: 't1', direction: 'inbound', sent_at: '2026-09-17T08:00:00.000Z', sent_by: null },
      { thread_id: 't1', direction: 'outbound', sent_at: '2026-09-17T09:30:00.000Z', sent_by: 'u2' },
    ],
    user_profiles: [{ id: 'u2', full_name: 'Sara', email: 'sara@example.com' }],
    email_send_claims: [],
  })

  it('a reply sent after the message on screen is reported, with who and when', async () => {
    const c = await threadConflict(fakeDb(tables()), { threadId: 't1', requestKey: 'k9', seenUpTo: '2026-09-17T08:00:00.000Z', bodyHash: 'h' })
    expect(c).toEqual({ code: 'ALREADY_REPLIED', repliedAt: '2026-09-17T09:30:00.000Z', repliedBy: 'Sara' })
  })

  it('no conflict when the sender was already looking at that reply', async () => {
    expect(await threadConflict(fakeDb(tables()), { threadId: 't1', requestKey: 'k9', seenUpTo: '2026-09-17T09:30:00.000Z', bodyHash: 'h' })).toBeNull()
  })

  it('a colleague\'s reply still being sent counts too', async () => {
    const t = tables()
    t.email_messages.pop()
    ;(t.email_send_claims as Row[]).push({ request_key: 'other', thread_id: 't1', status: 'sending', user_id: 'u2', created_at: '2026-09-17T09:31:00.000Z' })
    expect(await threadConflict(fakeDb(t), { threadId: 't1', requestKey: 'k9', seenUpTo: '2026-09-17T08:00:00.000Z', bodyHash: 'h' }))
      .toMatchObject({ code: 'ALREADY_REPLIED', repliedBy: 'Sara' })
  })

  it('the same text to the same thread within 10 minutes under a new key', async () => {
    const now = new Date('2026-09-17T10:05:00.000Z')
    const t = { email_messages: [], email_send_claims: [{ request_key: 'k1', thread_id: 't1', body_hash: replyBodyHash('<p>Thank you</p>'), status: 'sent', created_at: '2026-09-17T10:00:00.000Z' }] }
    expect(await threadConflict(fakeDb(t), { threadId: 't1', requestKey: 'k2', seenUpTo: undefined, bodyHash: replyBodyHash('thank  you'), now }))
      .toEqual({ code: 'SAME_REPLY', sentAt: '2026-09-17T10:00:00.000Z' })
    expect(await threadConflict(fakeDb(t), { threadId: 't1', requestKey: 'k2', seenUpTo: undefined, bodyHash: replyBodyHash('thank you'), now: new Date('2026-09-17T10:30:00.000Z') })).toBeNull()
  })
})

describe('waiting for an answer', () => {
  const now = new Date('2026-09-17T12:00:00Z')
  it('reads how long, and overdue after 24 hours', () => {
    expect(REPLY_OVERDUE_HOURS).toBe(24)
    expect(waitingLabel('2026-09-17T11:30:00Z', now)).toBe('30m')
    expect(waitingLabel('2026-09-17T07:00:00Z', now)).toBe('5h')
    expect(waitingLabel('2026-09-14T12:00:00Z', now)).toBe('3d')
    expect(isReplyOverdue('2026-09-16T12:00:00Z', now)).toBe(true)
    expect(isReplyOverdue('2026-09-16T13:00:00Z', now)).toBe(false)
    expect(hoursWaiting(null, now)).toBeNull()
  })
})

describe('wiring', () => {
  it('the send route checks and claims BEFORE Gmail is called, and threads the reply', () => {
    const src = readFileSync('app/api/gmail/send/route.ts', 'utf8')
    const send = src.indexOf('gmail.users.messages.send')
    expect(src.indexOf('threadConflict(')).toBeGreaterThan(0)
    expect(src.indexOf('threadConflict(')).toBeLessThan(send)
    expect(src.indexOf('claimSend(')).toBeLessThan(send)
    expect(src).toContain('In-Reply-To:')
    expect(src).toContain('sent_by: userId')
  })

  it('every email composer goes through the guard', () => {
    for (const f of ['app/inbox/page.tsx', 'components/unified/UnifiedMessageThread.tsx', 'components/unified/ComposeEmailModal.tsx']) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toContain('sendGuardedEmail(')
      expect(src, f).not.toContain("fetch('/api/gmail/send'")
    }
  })

  it('mail syncs on a schedule, and overdue replies reach the dashboard', () => {
    expect(readFileSync('lib/cron/scheduler.ts', 'utf8')).toContain("name: 'gmail-sync'")
    expect(readFileSync('app/api/dashboard/attention/route.ts', 'utf8')).toContain("type: 'reply_overdue'")
  })
})
