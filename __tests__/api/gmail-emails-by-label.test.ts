// A folder is listed by its Gmail label, not the lagging search index: a
// trashed email came back on the next `in:inbox` search and a just-received
// one could be missing (operator, 2026-10-10).
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const fetchEmails = vi.fn(async (..._args: unknown[]) => ({ messages: [], nextPageToken: null }))
vi.mock('@/lib/gmail', () => ({
  fetchEmails: (...args: unknown[]) => fetchEmails(...args),
  getAuthenticatedGmail: async () => ({ accessToken: 'a', refreshToken: 'r' }),
  GmailAuthError: class extends Error {},
}))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentUserId: async () => 'me' }))

import { GET } from '@/app/api/gmail/emails/route'
const get = (qs: string) => GET(new NextRequest(`http://x/api/gmail/emails?${qs}`))

beforeEach(() => fetchEmails.mockClear())

describe('GET /api/gmail/emails', () => {
  it('passes the folder label to Gmail, with no search for a plain folder', async () => {
    expect((await get('labelIds=INBOX&maxResults=25')).status).toBe(200)
    expect(fetchEmails).toHaveBeenCalledWith('a', 'r', { maxResults: 25, query: '', pageToken: undefined, labelIds: ['INBOX'] })
  })

  it("keeps the operator's search within the folder, and drops a malformed label", async () => {
    await get('labelIds=SENT,bad%20label&query=invoice')
    expect(fetchEmails).toHaveBeenCalledWith('a', 'r', expect.objectContaining({ query: 'invoice', labelIds: ['SENT'] }))
  })
})
