// "Select all N" in the inbox: an action on every email in a folder/search.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const list = vi.fn(async (p: { pageToken?: string; q?: string; labelIds: string[] }) => p.pageToken
  ? { data: { messages: Array.from({ length: 300 }, (_, i) => ({ id: `b${i}` })) } }
  : { data: { messages: Array.from({ length: 900 }, (_, i) => ({ id: `a${i}` })), nextPageToken: 'p2' } })
const batchModify = vi.fn(async (_p: unknown) => ({}))
const trash = vi.fn(async (_p: unknown) => ({}))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentUserId: async () => 'me' }))
vi.mock('@/lib/gmail-mailbox', () => ({
  getMailboxGmail: async () => ({ gmail: { users: { messages: { list, batchModify, trash } } } }),
}))

import { POST } from '@/app/api/gmail/actions/route'
const post = (body: unknown) => POST(new NextRequest('http://x/api/gmail/actions', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { list.mockClear(); batchModify.mockClear(); trash.mockClear() })

describe('match', () => {
  it('archives every email of the folder search, across pages, 1,000 per batch', async () => {
    const res = await post({ action: 'archive', match: { labelIds: ['INBOX'], query: 'from:@booking.com is:unread' } })
    expect(await res.json()).toEqual({ success: true, count: 1200, capped: false })
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ labelIds: ['INBOX'], q: 'from:@booking.com is:unread' }))
    expect(batchModify).toHaveBeenCalledTimes(2)
    expect((batchModify.mock.calls[0][0] as { requestBody: { ids: string[] } }).requestBody.ids).toHaveLength(1000)
  })
  it('report spam on every match', async () => {
    await post({ action: 'spam', match: { labelIds: ['INBOX'] } })
    expect(batchModify).toHaveBeenCalledWith(expect.objectContaining({ requestBody: expect.objectContaining({ addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] }) }))
  })
  it('trash goes one by one (Gmail has no batch trash)', async () => {
    await post({ action: 'delete', match: { labelIds: ['INBOX'] } })
    expect(trash).toHaveBeenCalledTimes(1200)
  })
  it('never "delete forever" on a match, and never without a folder', async () => {
    expect((await post({ action: 'permanentDelete', match: { labelIds: ['TRASH'] } })).status).toBe(400)
    expect((await post({ action: 'archive', match: { labelIds: [] } })).status).toBe(400)
    expect(batchModify).not.toHaveBeenCalled()
  })
})
