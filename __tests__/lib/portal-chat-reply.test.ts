import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================
// The staff-reply notification outcome
// ============================================
// A staff reply must TELL the traveller, and when it cannot, say WHY — the
// outcome taxonomy (sent / no-account / no-recipient / no-link / no-booking /
// failed) is what the UIs and the e2e suite key off. These tests pin it with
// a faked database and mail sender, because the real distinction between
// 'no-account' and 'failed' only shows up in environments nobody wants to
// reproduce on purpose (no Gmail connected; Gmail refusing).

// A hand-rolled stub rather than vi.fn(): resetting a vi.fn between tests
// made vitest attribute the 'failed' test's caught rejection to the test as
// unhandled (empirically — the SUT's warn fires and its result is correct).
// A plain holder has no lifecycle to trip over.
const mail: { impl: (...args: unknown[]) => Promise<unknown>; calls: number; last: unknown } = {
  impl: async () => ({ success: true }),
  calls: 0,
  last: null,
}
vi.mock('@/lib/email-send', () => ({
  sendEmailInternal: (...args: unknown[]) => {
    mail.calls++
    mail.last = args[0]
    return mail.impl(...args)
  },
}))

import { sendStaffReply } from '@/lib/portal/chat-reply'

// A minimal chainable fake of the Supabase client: each table resolves to a
// canned row. Only the shapes chat-reply actually touches are implemented.
function fakeDb(rows: Record<string, unknown>) {
  const result = (table: string) => ({ data: rows[table] ?? null, error: null })
  const chain = (table: string) => {
    const p: any = Promise.resolve(result(table))  // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const m of ['select', 'insert', 'update', 'eq', 'is', 'limit', 'order']) {
      p[m] = () => chain(table)
    }
    p.maybeSingle = () => Promise.resolve(result(table))
    p.single = () => Promise.resolve(result(table))
    return p
  }
  return { from: (table: string) => chain(table) }
}

const THREAD = { id: 'th-1', booking_id: 'bk-1', passenger_id: null }
const ARGS = { thread: THREAD, orgId: 'org-1', userId: 'u-1', body: 'こんにちは', appUrl: 'https://x.test' }

const BASE_ROWS = {
  team_members: { name: 'Staff' },
  portal_messages: { id: 'm-1', sender: 'staff', sender_name: 'Staff', body: 'こんにちは', created_at: 'now' },
  portal_message_threads: {},
  bookings: { booking_code: 'B-1', trip_name: 'Trip', client_name: 'Zehra', client_email: 'z@example.com' },
  booking_portal_links: [{ token: 'tok-1', passenger_id: null }],
}

beforeEach(() => {
  mail.impl = async () => ({ success: true })
  mail.calls = 0
  mail.last = null
})

describe('sendStaffReply notification outcome', () => {
  it("'sent' when the mail goes out — and only then is emailed true", async () => {
    mail.impl = async () => ({ success: true })
    const r = await sendStaffReply(fakeDb(BASE_ROWS), ARGS)
    expect(r.ok).toBe(true)
    expect(r.notified).toBe('sent')
    expect(r.emailed).toBe(true)
  })

  it("'no-account' when no Gmail is connected — a setup condition, not a failure", async () => {
    mail.impl = async () => ({ success: false, noAccount: true })
    const r = await sendStaffReply(fakeDb(BASE_ROWS), ARGS)
    expect(r.notified).toBe('no-account')
    expect(r.emailed).toBe(false)
  })

  it("'failed' when Gmail was asked and refused", async () => {
    mail.impl = async () => ({ success: false, error: 'quota' })
    const r = await sendStaffReply(fakeDb(BASE_ROWS), ARGS)
    expect(r.notified).toBe('failed')
  })

  it("'failed' when the send throws — the stored reply survives", async () => {
    mail.impl = async () => { throw new Error('network') }
    const r = await sendStaffReply(fakeDb(BASE_ROWS), ARGS)
    expect(r.ok).toBe(true)
    expect(r.notified).toBe('failed')
    expect(r.message?.id).toBe('m-1')
  })

  it("'no-recipient' when nobody on the booking has an address", async () => {
    const r = await sendStaffReply(
      fakeDb({ ...BASE_ROWS, bookings: { ...(BASE_ROWS.bookings as object), client_email: null } }),
      ARGS
    )
    expect(r.notified).toBe('no-recipient')
    expect(mail.calls).toBe(0)
  })

  it("'no-link' when the booking has no live portal link", async () => {
    const r = await sendStaffReply(fakeDb({ ...BASE_ROWS, booking_portal_links: [] }), ARGS)
    expect(r.notified).toBe('no-link')
    expect(mail.calls).toBe(0)
  })

  it("'no-booking' when the thread points at a booking that is gone", async () => {
    const r = await sendStaffReply(fakeDb({ ...BASE_ROWS, bookings: null }), ARGS)
    expect(r.notified).toBe('no-booking')
  })
})

describe('which portal link the notification carries', () => {
  // Traveller A's private thread on a booking where only traveller B (and
  // nobody else) has a private link: B's link must never be mailed to A.
  const PRIVATE_A = { ...ARGS, thread: { ...THREAD, passenger_id: 'pax-a' } }
  const rows = (links: Array<{ token: string; passenger_id: string | null }>) =>
    fakeDb({ ...BASE_ROWS, booking_passengers: { email: 'a@example.com' }, booking_portal_links: links })
  const html = () => String((mail.last as { html?: string } | null)?.html ?? '')

  it("a private thread with no link of its own: 'no-link', never another traveller's private link", async () => {
    const r = await sendStaffReply(rows([{ token: 'tok-b', passenger_id: 'pax-b' }]), PRIVATE_A)
    expect(r.notified).toBe('no-link')
    expect(mail.calls).toBe(0)
  })

  it("a private thread is not sent the shared link either — that page does not hold it", async () => {
    const r = await sendStaffReply(rows([{ token: 'tok-shared', passenger_id: null }]), PRIVATE_A)
    expect(r.notified).toBe('no-link')
  })

  it('a private thread gets its own traveller\'s link', async () => {
    const r = await sendStaffReply(rows([
      { token: 'tok-b', passenger_id: 'pax-b' },
      { token: 'tok-a', passenger_id: 'pax-a' },
    ]), PRIVATE_A)
    expect(r.notified).toBe('sent')
    expect(html()).toContain('https://x.test/portal/tok-a')
    expect(html()).not.toContain('tok-b')
  })

  it("the shared thread gets the shared link, never a traveller's private one", async () => {
    expect((await sendStaffReply(rows([{ token: 'tok-b', passenger_id: 'pax-b' }]), ARGS)).notified).toBe('no-link')
    const r = await sendStaffReply(rows([
      { token: 'tok-b', passenger_id: 'pax-b' },
      { token: 'tok-shared', passenger_id: null },
    ]), ARGS)
    expect(r.notified).toBe('sent')
    expect(html()).toContain('/portal/tok-shared')
  })
})
