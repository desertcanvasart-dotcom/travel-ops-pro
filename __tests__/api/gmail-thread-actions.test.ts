// Archive / mark read / mark unread sent the conversation's THREAD id as a
// MESSAGE id, so only the thread's first message changed.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const threadsModify = vi.fn(async () => ({}))
const batchModify = vi.fn(async () => ({}))
const messagesDelete = vi.fn(async () => ({}))
vi.mock('@/lib/gmail', () => ({
  getAuthenticatedGmail: async () => ({ gmail: { users: { threads: { modify: threadsModify }, messages: { batchModify, delete: messagesDelete } } } }),
  GmailAuthError: class extends Error {},
}))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentUserId: async () => 'me' }))

import { POST } from '@/app/api/gmail/actions/route'
const post = (body: unknown) => POST(new NextRequest('http://x/api/gmail/actions', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { threadsModify.mockClear(); batchModify.mockClear(); messagesDelete.mockClear() })

describe('Gmail actions', () => {
  it.each([
    ['markRead', { removeLabelIds: ['UNREAD'] }],
    ['markUnread', { addLabelIds: ['UNREAD'] }],
    ['archive', { removeLabelIds: ['INBOX'] }],
  ])('%s on a thread modifies the whole thread', async (action, labels) => {
    expect((await post({ threadIds: ['t1'], action })).status).toBe(200)
    expect(threadsModify).toHaveBeenCalledWith({ userId: 'me', id: 't1', requestBody: expect.objectContaining(labels) })
    expect(batchModify).not.toHaveBeenCalled()
  })
  it('message ids still batch-modify messages', async () => {
    await post({ messageIds: ['m1', 'm2'], action: 'star' })
    expect(batchModify).toHaveBeenCalledWith({ userId: 'me', requestBody: expect.objectContaining({ ids: ['m1', 'm2'], addLabelIds: ['STARRED'] }) })
  })
  it('permanent delete is never applied to thread ids', async () => {
    expect((await post({ threadIds: ['t1'], action: 'permanentDelete' })).status).toBe(400)
    expect(messagesDelete).not.toHaveBeenCalled()
  })
  it('move without a label is refused', async () => {
    expect((await post({ messageIds: ['m1'], action: 'move' })).status).toBe(400)
  })
})
