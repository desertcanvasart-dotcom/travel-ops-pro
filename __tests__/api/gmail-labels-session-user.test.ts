// Sweep H11: POST/DELETE /api/gmail/labels took userId from the request body,
// so any signed-in user could create or delete labels in a colleague's Gmail.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const tokenLookups: unknown[] = []
// The route asks lib/gmail for the mailbox (one client per request, round 14);
// record whose mailbox it asked for.
vi.mock('@/lib/gmail', () => {
  class GmailAuthError extends Error {}
  return {
    GmailAuthError,
    getAuthenticatedGmail: async (userId: string) => { tokenLookups.push(userId); throw new GmailAuthError('none') },
  }
})
let sessionUser: string | null = 'me'
vi.mock('@/lib/auth/current-org', () => ({ getCurrentUserId: async () => sessionUser }))

import { POST, DELETE } from '@/app/api/gmail/labels/route'

const req = (method: string, body: unknown) =>
  new NextRequest('http://x/api/gmail/labels', { method, body: JSON.stringify(body) })

beforeEach(() => { tokenLookups.length = 0; sessionUser = 'me' })

describe('gmail labels act on the session user only', () => {
  it('POST ignores a userId in the body', async () => {
    await POST(req('POST', { userId: 'colleague', name: 'X' }))
    expect(tokenLookups).toEqual(['me'])
  })
  it('DELETE ignores a userId in the body', async () => {
    await DELETE(req('DELETE', { userId: 'colleague', labelId: 'L1' }))
    expect(tokenLookups).toEqual(['me'])
  })
  it('no session → 401', async () => {
    sessionUser = null
    expect((await POST(req('POST', { userId: 'colleague', name: 'X' }))).status).toBe(401)
  })
})
