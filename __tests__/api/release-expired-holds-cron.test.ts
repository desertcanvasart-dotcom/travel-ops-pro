// A quote past its valid-until date released none of its seat holds: expiry
// is read, never stored (lib/quotes/validity.ts), so the 20261215 trigger on
// status = 'expired' never fired for it. The daily release-expired-holds job
// releases the pending holds of draft/sent quotes whose date has gone by.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { lapsedHolds, releaseNote, type HoldQuote, type PendingHold } from '@/lib/departures/expired-holds'

type Call = { table: string; op: string; args: unknown[] }
const calls: Call[] = []
let holdRows: PendingHold[] = []
let quoteRows: HoldQuote[] = []
let updatedIds: string[] | null = null

function builder(table: string) {
  let op = 'select'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {}
  for (const m of ['select', 'eq', 'not', 'order', 'range', 'in', 'lt']) {
    b[m] = (...args: unknown[]) => { calls.push({ table, op: m, args }); return b }
  }
  b.update = (vals: unknown) => { op = 'update'; calls.push({ table, op: 'update', args: [vals] }); return b }
  b.then = (resolve: (v: unknown) => void) => {
    if (op === 'update') {
      const id = calls.filter(c => c.table === table && c.op === 'eq' && c.args[0] === 'id').at(-1)?.args[1] as string
      return resolve({ data: (updatedIds ?? [id]).includes(id) ? [{ id }] : [], error: null })
    }
    return resolve({ data: table === 'departure_bookings' ? holdRows : quoteRows, error: null })
  }
  return b
}

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => ({ from: builder }) }))
vi.mock('@/lib/support/job-runs', () => ({ withJobRun: (_n: string, _db: unknown, h: unknown) => h }))
const todayInTimeZone = vi.fn((_tz: string) => '2026-10-13')
vi.mock('@/lib/today', () => ({ todayInTimeZone: (tz: string) => todayInTimeZone(tz) }))
const notifyOrgManagers = vi.fn(async (..._a: unknown[]) => ({ created: 1, failed: 0 }))
vi.mock('@/lib/notify-managers', () => ({ notifyOrgManagers: (...a: unknown[]) => notifyOrgManagers(...a) }))

import { GET } from '@/app/api/cron/release-expired-holds/route'
import { internalCronToken } from '@/lib/cron/auth'
import { CRON_JOBS } from '@/lib/cron/scheduler'
import { JOB_NAMES, SCHEDULED_IN_PROCESS } from '@/lib/support/job-names.mjs'

const run = async (auth = true) => (GET as (r: NextRequest) => Promise<Response>)(
  new NextRequest('http://x/api/cron/release-expired-holds', auth ? { headers: { authorization: `Bearer ${internalCronToken()}` } } : {})
)
const hold = (id: string, quote: string | null, org = 'o1', dep = 'd1'): PendingHold =>
  ({ id, org_id: org, departure_id: dep, quote_id: quote, notes: 'ウェブ注文 QT-1' })
const quote = (id: string, status: string, validUntil: string | null, org = 'o1'): HoldQuote =>
  ({ id, org_id: org, quote_number: `QT-${id}`, status, valid_until: validUntil })

beforeEach(() => {
  calls.length = 0
  holdRows = []
  quoteRows = []
  updatedIds = null
  notifyOrgManagers.mockClear()
  todayInTimeZone.mockClear()
})

describe('lapsedHolds: which holds a lapsed quote releases', () => {
  const today = '2026-10-13'
  it('a draft or sent quote whose last valid day was yesterday', () => {
    const r = lapsedHolds([hold('h1', 'q1'), hold('h2', 'q2')], [quote('q1', 'sent', '2026-10-12'), quote('q2', 'draft', '2026-10-01')], today)
    expect(r.map(x => x.hold.id)).toEqual(['h1', 'h2'])
  })

  it('not on its last valid day, and never without a date', () => {
    expect(lapsedHolds([hold('h1', 'q1')], [quote('q1', 'sent', today)], today)).toEqual([])
    expect(lapsedHolds([hold('h1', 'q1')], [quote('q1', 'sent', null)], today)).toEqual([])
  })

  it('accepted and converted quotes keep their holds', () => {
    const r = lapsedHolds([hold('h1', 'q1'), hold('h2', 'q2')], [quote('q1', 'accepted', '2026-10-01'), quote('q2', 'converted', '2026-10-01')], today)
    expect(r).toEqual([])
  })

  it("another company's quote never releases a hold", () => {
    expect(lapsedHolds([hold('h1', 'q1', 'o1')], [quote('q1', 'sent', '2026-10-01', 'o2')], today)).toEqual([])
  })

  it('a hold with no quote is left alone', () => {
    expect(lapsedHolds([hold('h1', null)], [quote('q1', 'sent', '2026-10-01')], today)).toEqual([])
  })

  it('the note keeps the order line and says why', () => {
    expect(releaseNote('ウェブ注文 QT-9', { quote_number: 'QT-9', valid_until: '2026-10-12' }, today))
      .toBe('ウェブ注文 QT-9\n見積 QT-9 の有効期限（2026-10-12）切れにより 2026-10-13 自動解放')
    expect(releaseNote(null, { quote_number: 'QT-9', valid_until: '2026-10-12' }, today)).toMatch(/^見積 QT-9/)
  })
})

describe('the release-expired-holds job', () => {
  it('fails closed without the cron token', async () => {
    expect((await run(false)).status).toBe(401)
  })

  it("uses Japan's date and reads only open quotes past it", async () => {
    holdRows = [hold('h1', 'q1')]
    quoteRows = []
    const body = await (await run()).json()
    expect(todayInTimeZone).toHaveBeenCalledWith('Asia/Tokyo')
    expect(body).toMatchObject({ ok: true, today: '2026-10-13', released: 0 })
    const q = calls.filter(c => c.table === 'tour_quotes')
    expect(q).toContainEqual({ table: 'tour_quotes', op: 'in', args: ['status', ['draft', 'sent']] })
    expect(q).toContainEqual({ table: 'tour_quotes', op: 'lt', args: ['valid_until', '2026-10-13'] })
    // Only pending holds that name a quote.
    expect(calls).toContainEqual({ table: 'departure_bookings', op: 'eq', args: ['status', 'pending'] })
    expect(calls).toContainEqual({ table: 'departure_bookings', op: 'not', args: ['quote_id', 'is', null] })
  })

  it('releases a lapsed hold as cancelled with a note, only while still pending, and tells the managers', async () => {
    holdRows = [hold('h1', 'q1', 'o1', 'd7'), hold('h2', 'q2')]
    quoteRows = [quote('q1', 'sent', '2026-10-12'), quote('q2', 'accepted', '2026-10-01')]
    const body = await (await run()).json()
    expect(body).toMatchObject({ released: 1, failed: 0 })
    const update = calls.find(c => c.op === 'update')!.args[0] as Record<string, unknown>
    expect(update.status).toBe('cancelled')
    expect(update.notes).toContain('有効期限（2026-10-12）切れ')
    const afterUpdate = calls.slice(calls.findIndex(c => c.op === 'update'))
    expect(afterUpdate).toContainEqual({ table: 'departure_bookings', op: 'eq', args: ['status', 'pending'] })
    expect(afterUpdate).toContainEqual({ table: 'departure_bookings', op: 'eq', args: ['org_id', 'o1'] })
    expect(calls.filter(c => c.op === 'update')).toHaveLength(1)
    expect(notifyOrgManagers).toHaveBeenCalledTimes(1)
    expect(notifyOrgManagers.mock.calls[0][1]).toBe('o1')
    expect(notifyOrgManagers.mock.calls[0][2]).toMatchObject({ link: '/departures/d7', send_email: false })
  })

  it('a hold the office already handled is not counted and nobody is told', async () => {
    holdRows = [hold('h1', 'q1')]
    quoteRows = [quote('q1', 'draft', '2026-10-01')]
    updatedIds = []
    const body = await (await run()).json()
    expect(body).toMatchObject({ released: 0 })
    expect(notifyOrgManagers).not.toHaveBeenCalled()
  })

  it('is registered daily at 00:20 UTC (09:20 in Tokyo), in both job lists', () => {
    expect(CRON_JOBS.find(j => j.name === 'release-expired-holds')?.schedule).toBe('20 0 * * *')
    expect(JOB_NAMES).toContain('release-expired-holds')
    expect(SCHEDULED_IN_PROCESS).toContain('release-expired-holds')
  })
})
