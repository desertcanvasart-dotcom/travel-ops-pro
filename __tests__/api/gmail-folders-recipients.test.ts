// Inbox vs Gmail, round 2 (operator, 2026-10-15): renaming and deleting a
// folder, and address suggestions in To / Cc / Bcc.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { rankRecipients, formatRecipient } from '@/lib/email/recipient-suggestions'
import { currentToken, withPicked } from '@/components/email/RecipientField'

const labels = {
  patch: vi.fn(async (_p: unknown) => ({ data: { id: 'Label_7', name: 'VIP' } })),
  delete: vi.fn(async (_p: unknown) => ({})),
}
const messages = {
  list: vi.fn(async (p: { pageToken?: string }) => p.pageToken
    ? { data: { messages: [{ id: 'm3' }] } }
    : { data: { messages: [{ id: 'm1' }, { id: 'm2' }], nextPageToken: 'p2' } }),
  batchModify: vi.fn(async (_p: unknown) => ({})),
}
vi.mock('@/lib/auth/current-org', () => ({ getCurrentUserId: async () => 'me' }))
vi.mock('@/lib/gmail-mailbox', () => ({
  getMailboxGmail: async () => ({ gmail: { users: { labels, messages } } }),
}))

import * as labelsRoute from '@/app/api/gmail/labels/route'

const req = (method: string, body: unknown) =>
  new NextRequest('http://x/api/gmail/labels', { method, body: JSON.stringify(body) })

beforeEach(() => { labels.patch.mockClear(); labels.delete.mockClear(); messages.list.mockClear(); messages.batchModify.mockClear() })

describe('folders', () => {
  it('renames a folder the user made', async () => {
    const res = await labelsRoute.PATCH(req('PATCH', { labelId: 'Label_7', name: '  VIP  ' }))
    expect(res.status).toBe(200)
    expect(labels.patch).toHaveBeenCalledWith({ userId: 'me', id: 'Label_7', requestBody: { name: 'VIP' } })
  })

  it('never renames or deletes a Gmail system label', async () => {
    expect((await labelsRoute.PATCH(req('PATCH', { labelId: 'INBOX', name: 'x' }))).status).toBe(400)
    expect((await labelsRoute.DELETE(req('DELETE', { labelId: 'SENT' }))).status).toBe(400)
    expect(labels.patch).not.toHaveBeenCalled()
    expect(labels.delete).not.toHaveBeenCalled()
  })

  it("deleting a folder puts its emails back in the Inbox first, every page", async () => {
    expect((await labelsRoute.DELETE(req('DELETE', { labelId: 'Label_7' }))).status).toBe(200)
    expect(messages.batchModify).toHaveBeenNthCalledWith(1, { userId: 'me', requestBody: { ids: ['m1', 'm2'], addLabelIds: ['INBOX'] } })
    expect(messages.batchModify).toHaveBeenNthCalledWith(2, { userId: 'me', requestBody: { ids: ['m3'], addLabelIds: ['INBOX'] } })
    const restored = messages.batchModify.mock.invocationCallOrder[1]
    expect(labels.delete.mock.invocationCallOrder[0]).toBeGreaterThan(restored)
  })
})

describe('address suggestions', () => {
  it('one entry per address: the most specific source and the best name', () => {
    const out = rankRecipients([
      { email: 'Aiko@Example.jp', name: '', source: 'email' },
      { email: 'aiko@example.jp', name: 'Aiko Tanaka', source: 'client' },
      { email: 'not an address', name: 'x', source: 'client' },
    ], 'aiko', 10)
    expect(out).toEqual([{ email: 'Aiko@Example.jp', name: 'Aiko Tanaka', source: 'client' }])
  })

  it('matches at the start come first', () => {
    const out = rankRecipients([
      { email: 'info@grandtaka.jp', name: 'Grand Hotel', source: 'supplier' },
      { email: 'taka@example.jp', name: 'Taka Sato', source: 'email' },
    ], 'taka', 10)
    expect(out.map(s => s.email)).toEqual(['taka@example.jp', 'info@grandtaka.jp'])
  })

  it('a picked suggestion replaces what was being typed and leaves room for the next', () => {
    expect(currentToken('a@b.co, aik')).toEqual({ head: 'a@b.co,', token: 'aik' })
    expect(withPicked('a@b.co, aik', { email: 'aiko@example.jp', name: 'Aiko Tanaka', source: 'client' }))
      .toBe('a@b.co, Aiko Tanaka <aiko@example.jp>, ')
    expect(withPicked('aik', { email: 'aiko@example.jp', name: '', source: 'email' })).toBe('aiko@example.jp, ')
  })

  it('a name with separators cannot break the address list', () => {
    expect(formatRecipient({ email: 'a@b.co', name: 'Smith, John <x>' })).toBe('Smith John x <a@b.co>')
  })
})
