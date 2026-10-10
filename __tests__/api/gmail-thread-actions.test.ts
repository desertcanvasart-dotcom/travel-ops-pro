// Archive / mark read / mark unread sent the conversation's THREAD id as a
// MESSAGE id, so only the thread's first message changed.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const threadsModify = vi.fn(async () => ({}))
const batchModify = vi.fn(async () => ({}))
const messagesDelete = vi.fn(async () => ({}))
const messagesTrash = vi.fn(async () => ({}))
const threadsTrash = vi.fn(async () => ({}))
vi.mock('@/lib/gmail', () => ({
  getAuthenticatedGmail: async () => ({ gmail: { users: { threads: { modify: threadsModify, trash: threadsTrash }, messages: { batchModify, delete: messagesDelete, trash: messagesTrash } } } }),
  GmailAuthError: class extends Error {},
}))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentUserId: async () => 'me' }))

vi.mock('@/lib/gmail-mailbox', async () => {
  // The mailbox resolver (own, else shared) is tested on its own; here the
  // session user's mailbox is their own.
  const g = await import('@/lib/gmail')
  return {
    getMailboxGmail: (id: string) => g.getAuthenticatedGmail(id),
    resolveMailbox: async (id: string) => ({ mailboxUserId: id, shared: false, email: '' }),
  }
})

import { POST } from '@/app/api/gmail/actions/route'
const post = (body: unknown) => POST(new NextRequest('http://x/api/gmail/actions', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { threadsModify.mockClear(); batchModify.mockClear(); messagesDelete.mockClear(); messagesTrash.mockClear(); threadsTrash.mockClear() })

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
  // "Deleted, not deleted" (operator, 2026-10-10): delete is Gmail's own
  // trash call — never a label edit, never a permanent delete.
  it('delete trashes each message', async () => {
    expect((await post({ messageIds: ['m1', 'm2'], action: 'delete' })).status).toBe(200)
    expect(messagesTrash).toHaveBeenCalledTimes(2)
    expect(messagesTrash).toHaveBeenCalledWith({ userId: 'me', id: 'm1' })
    expect(batchModify).not.toHaveBeenCalled()
    expect(messagesDelete).not.toHaveBeenCalled()
  })
  it('delete on a thread trashes the whole thread', async () => {
    expect((await post({ threadIds: ['t1'], action: 'delete' })).status).toBe(200)
    expect(threadsTrash).toHaveBeenCalledWith({ userId: 'me', id: 't1' })
    expect(threadsModify).not.toHaveBeenCalled()
  })
  it('move without a label is refused', async () => {
    expect((await post({ messageIds: ['m1'], action: 'move' })).status).toBe(400)
  })
})
