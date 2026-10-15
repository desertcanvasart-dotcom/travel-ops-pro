// /api/gmail/scheduled: what can be scheduled, and cancelling.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const draftsGet = vi.fn(async (_p: { id: string }) => ({ data: { id: 'd1' } }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => createMockClient() }))
vi.mock('@/lib/auth/current-org', () => ({
  requireRole: async () => null,
  getCurrentOrgId: async () => 'org-1',
  getCurrentUserId: async () => 'u1',
  noOrgResponse: () => new Response(null, { status: 403 }),
}))
vi.mock('@/lib/gmail-mailbox', () => ({
  getMailboxGmail: async () => ({ mailboxUserId: 'mb', gmail: { users: { drafts: { get: draftsGet } } } }),
}))

import * as route from '@/app/api/gmail/scheduled/route'

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()
const post = (body: Record<string, unknown>) =>
  route.POST(new NextRequest('http://x/api/gmail/scheduled', { method: 'POST', body: JSON.stringify(body) }))

let tables: { scheduled_emails: Record<string, unknown>[] }
beforeEach(() => {
  tables = { scheduled_emails: [] }
  setMockTables(tables)
  draftsGet.mockClear()
})

describe('POST', () => {
  it('schedules a draft in the mailbox, in the time zone it was picked in', async () => {
    const res = await post({ draftId: 'd1', sendAt: inAnHour(), timeZone: 'Asia/Tokyo', toSummary: 'aiko@example.jp', subject: 'Luxor' })
    expect(res.status).toBe(200)
    expect(tables.scheduled_emails[0]).toMatchObject({ org_id: 'org-1', created_by: 'u1', mailbox_user_id: 'mb', draft_id: 'd1', time_zone: 'Asia/Tokyo' })
  })

  it.each([
    [{ draftId: 'd1', sendAt: new Date(Date.now() - 1000).toISOString() }, 'at least a minute'],
    [{ draftId: 'd1', sendAt: new Date(Date.now() + 400 * 24 * 3600 * 1000).toISOString() }, 'within a year'],
    [{ draftId: 'd1', sendAt: 'soon' }, 'Pick a date and time'],
    [{ draftId: 'd1', sendAt: inAnHour(), timeZone: 'Mars/Olympus' }, 'Unknown time zone'],
    [{ draftId: '../x', sendAt: inAnHour() }, 'Invalid draft id'],
  ])('refuses %j', async (body, message) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain(message)
    expect(tables.scheduled_emails).toHaveLength(0)
  })

  it('a draft that is not in the mailbox cannot be scheduled', async () => {
    draftsGet.mockRejectedValueOnce(Object.assign(new Error('nf'), { response: { status: 404 } }))
    expect((await post({ draftId: 'd9', sendAt: inAnHour() })).status).toBe(404)
  })
})

describe('DELETE', () => {
  it('cancels one that has not gone; refuses one already sending', async () => {
    const id = '33333333-3333-4333-8333-333333333333'
    const busy = '44444444-4444-4444-8444-444444444444'
    tables.scheduled_emails.push({ id, org_id: 'org-1', draft_id: 'd1', status: 'scheduled' }, { id: busy, org_id: 'org-1', draft_id: 'd2', status: 'sending' })
    const del = (x: string) => route.DELETE(new NextRequest(`http://x/api/gmail/scheduled?id=${x}`, { method: 'DELETE' }))
    expect((await del(id)).status).toBe(200)
    expect(tables.scheduled_emails[0].status).toBe('cancelled')
    expect((await del(busy)).status).toBe(409)
  })
})
