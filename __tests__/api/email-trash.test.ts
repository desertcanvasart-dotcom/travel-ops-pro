// Trash and Spam (operator, 2026-10-11): a deleted email vanished with no way
// back, Spam was invisible from the system, and a reply to a conversation
// deleted in Communicate was synced but never seen.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

const messagesUntrash = vi.fn(async () => ({}))
const threadsUntrash = vi.fn(async () => ({}))
const threadsTrash = vi.fn(async (_args: unknown): Promise<unknown> => ({}))
const batchModify = vi.fn(async () => ({}))
const list = vi.fn(async (_args: unknown) => ({ data: { messages: [] } }))
vi.mock('@/lib/gmail', () => ({
  getAuthenticatedGmail: async () => ({
    gmail: {
      users: {
        threads: { untrash: threadsUntrash, trash: threadsTrash },
        messages: { untrash: messagesUntrash, batchModify },
      },
    },
  }),
  GmailAuthError: class extends Error {},
}))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentUserId: async () => 'me' }))
vi.mock('@/lib/gmail-mailbox', async () => {
  const g = await import('@/lib/gmail')
  return { getMailboxGmail: (id: string) => g.getAuthenticatedGmail(id) }
})

import { POST } from '@/app/api/gmail/actions/route'
import { moveThreadInGmail } from '@/lib/email/conversation-trash'

const post = (body: unknown) => POST(new NextRequest('http://x/api/gmail/actions', { method: 'POST', body: JSON.stringify(body) }))
const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

beforeEach(() => {
  for (const f of [messagesUntrash, threadsUntrash, threadsTrash, batchModify, list]) f.mockClear()
})

describe('Inbox: Trash and Spam', () => {
  it('restore takes messages (or a thread) out of Gmail’s Trash', async () => {
    expect((await post({ messageIds: ['m1', 'm2'], action: 'restore' })).status).toBe(200)
    expect(messagesUntrash).toHaveBeenCalledTimes(2)
    expect(messagesUntrash).toHaveBeenCalledWith({ userId: 'me', id: 'm1' })
    expect((await post({ threadIds: ['t1'], action: 'restore' })).status).toBe(200)
    expect(threadsUntrash).toHaveBeenCalledWith({ userId: 'me', id: 't1' })
  })

  it('not spam moves the message back to the inbox', async () => {
    expect((await post({ messageIds: ['m1'], action: 'notSpam' })).status).toBe(200)
    expect(batchModify).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: expect.objectContaining({ ids: ['m1'], addLabelIds: ['INBOX'], removeLabelIds: ['SPAM'] }),
    })
  })

  it('Trash and Spam are listed — Gmail leaves them out unless asked', () => {
    const gmail = src('lib/gmail.ts')
    expect(gmail).toContain("labelIds?.some(l => l === 'TRASH' || l === 'SPAM') ? { includeSpamTrash: true } : {}")
    const page = src('app/inbox/page.tsx')
    expect(page).toContain("spam: 'SPAM', trash: 'TRASH'")
    expect(page).toContain("handleEmailAction(folder === 'trash' ? 'restore' : folder === 'spam' ? 'notSpam' : 'archive')")
    // Delete in Trash is for good, and asks first.
    expect(page).toContain("if (!window.confirm('Delete forever? This cannot be undone.')) return")
  })
})

describe('Communicate: Trash', () => {
  it('a deleted conversation’s thread goes to Gmail’s Trash, and comes back on restore', async () => {
    expect(await moveThreadInGmail('owner', 't1', 'trash')).toEqual({ ok: true })
    expect(threadsTrash).toHaveBeenCalledWith({ userId: 'me', id: 't1' })
    expect(await moveThreadInGmail('owner', 't1', 'untrash')).toEqual({ ok: true })
    expect(threadsUntrash).toHaveBeenCalledWith({ userId: 'me', id: 't1' })
  })

  it('a thread already gone from Gmail is not an error; a failure is reported', async () => {
    threadsTrash.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { code: 404 }))
    expect(await moveThreadInGmail('owner', 't1', 'trash')).toEqual({ ok: true })
    threadsTrash.mockRejectedValueOnce(new Error('invalid_grant'))
    expect(await moveThreadInGmail('owner', 't1', 'trash')).toEqual({ ok: false, error: 'invalid_grant' })
    expect(await moveThreadInGmail(null, 't1', 'trash')).toMatchObject({ ok: false })
  })

  it('the routes trash and restore in Gmail, and delete is role-gated', () => {
    const r = src('app/api/email/conversations/route.ts')
    const del = r.slice(r.indexOf('export async function DELETE'))
    expect(del).toContain("requireRole(['admin', 'manager', 'agent'])")
    expect(del).toContain("moveThreadInGmail(data.user_id, data.thread_id, 'trash')")
    expect(r).toContain("moveThreadInGmail(data.user_id, data.thread_id, 'untrash')")
  })

  it('Trash lists only deleted email conversations', () => {
    const r = src('app/api/unified/conversations/route.ts')
    // Deleted in Communicate (status 'trashed'), never mail hidden to keep it
    // private (is_hidden alone — scripts/scope-inbox).
    expect(r).toContain("? emailQuery.eq('is_hidden', true).eq('status', 'trashed')")
    const conv = src('app/api/email/conversations/route.ts')
    expect(conv).toContain("status: 'trashed',")
    expect(conv).toContain("updateData.status = 'active' // out of Trash (see DELETE)")
    for (const ch of ['whatsapp', 'portal', 'trip']) expect(r).toContain(`if (!trash && (channel === 'all' || channel === '${ch}'))`)
  })

  it('new mail from a person brings a deleted conversation back — in the sync and the poll', () => {
    const sync = src('lib/email/sync-mailbox.ts')
    expect(sync).toContain("...(revive ? { is_hidden: false, status: 'active' } : {}),")
    // Only conversations deleted in Communicate — never mail hidden as private.
    expect(sync).toContain("if (r.is_hidden && r.status === 'trashed') deletedConversations.add(r.id)")
    expect(sync).toContain("revive = msgDirection === 'outbound' || !looksAutomated({")
    const poll = src('app/api/gmail/poll/route.ts')
    expect(poll).toContain('if (!msgInsertError && existingConv?.id) {')
    expect(poll).toContain(".update({ is_hidden: false, status: 'active' })")
    expect(poll).toContain(".eq('status', 'trashed')")
  })

  it('the screen restores, and says when a delete fails', () => {
    const thread = src('components/unified/UnifiedMessageThread.tsx')
    expect(thread).toContain("action: 'unhide'")
    expect(thread).toContain("await dialog.alert(t('deleteFailedTitle'), data.error || t('deleteFailed'), 'warning')")
    expect(src('components/unified/UnifiedConversationList.tsx')).toContain("if (filters.trash) params.set('trash', 'true')")
  })
})
