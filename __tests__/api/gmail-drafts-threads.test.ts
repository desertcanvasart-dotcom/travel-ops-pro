// Inbox vs Gmail (operator, 2026-10-15): saved drafts, the whole
// conversation, CC/BCC and Reply all.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'

const drafts = {
  list: vi.fn(async (_p: { pageToken?: string }) => ({ data: { drafts: [{ id: 'd-other', message: { id: 'm-other' } }, { id: 'd-1', message: { id: 'm-1' } }] } })),
  get: vi.fn(async () => ({
    data: {
      id: 'd-1',
      message: {
        id: 'm-1', threadId: 't-1', labelIds: ['DRAFT'],
        payload: {
          mimeType: 'text/html',
          headers: [
            { name: 'To', value: 'aiko@example.jp' }, { name: 'Cc', value: 'agent@hisgo.jp' },
            { name: 'Bcc', value: 'boss@ats-hj.com' }, { name: 'Subject', value: 'Re: Luxor' },
          ],
          body: { data: Buffer.from('<p>Half written</p>').toString('base64') },
        },
      },
    },
  })),
  create: vi.fn(async (_p: unknown) => ({ data: { id: 'd-new', message: { id: 'm-new' } } })),
  update: vi.fn(async (_p: unknown) => ({ data: { id: 'd-1', message: { id: 'm-1b' } } })),
  delete: vi.fn(async () => ({})),
}
const threadsGet = vi.fn(async (p: { format: string }) => p.format === 'metadata'
  ? { data: { messages: [{ payload: { headers: [{ name: 'Message-ID', value: '<abc@mail>' }] } }] } }
  : { data: { messages: [
    { id: 'm1', threadId: 't-1', labelIds: ['INBOX'], payload: { mimeType: 'text/html', headers: [{ name: 'From', value: 'aiko@example.jp' }], body: { data: Buffer.from('first').toString('base64') } } },
    { id: 'm-draft', threadId: 't-1', labelIds: ['DRAFT'], payload: { mimeType: 'text/html', headers: [], body: {} } },
    { id: 'm2', threadId: 't-1', labelIds: ['SENT'], payload: { mimeType: 'text/html', headers: [{ name: 'From', value: 'yoyaku@ats-hj.com' }], body: { data: Buffer.from('second').toString('base64') } } },
  ] } })
const gmail = { users: { drafts, threads: { get: threadsGet } } }

vi.mock('@/lib/auth/current-org', () => ({ getCurrentUserId: async () => 'me' }))
vi.mock('@/lib/gmail-mailbox', () => ({
  getMailboxGmail: async () => ({ gmail, accessToken: 'a', refreshToken: 'r', mailboxUserId: 'me', shared: false, email: '' }),
}))

import * as draftsRoute from '@/app/api/gmail/drafts/route'
import * as threadsRoute from '@/app/api/gmail/threads/route'

const req = (url: string, init?: { method: string; body?: unknown }) =>
  new NextRequest(url, init ? { method: init.method, body: init.body === undefined ? undefined : JSON.stringify(init.body) } : undefined)
const decode = (raw: string) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

beforeEach(() => { for (const f of Object.values(drafts)) f.mockClear(); threadsGet.mockClear() })

describe('/api/gmail/drafts', () => {
  it('opens a draft from the Drafts list by its message id, with Cc and Bcc', async () => {
    const res = await draftsRoute.GET(req('http://x/api/gmail/drafts?messageId=m-1'))
    const { draft } = await res.json()
    expect(draft).toMatchObject({ id: 'd-1', threadId: 't-1', to: 'aiko@example.jp', cc: 'agent@hisgo.jp', bcc: 'boss@ats-hj.com', subject: 'Re: Luxor' })
    expect(draft.body).toContain('Half written')
  })

  it('creates a draft — incomplete recipients are fine — threaded as a reply', async () => {
    const res = await draftsRoute.POST(req('http://x/api/gmail/drafts', { method: 'POST', body: { to: 'aiko@example.jp, half-typed', cc: '', subject: 'Re: Luxor', body: '<p>x</p>', threadId: 't-1' } }))
    expect(await res.json()).toEqual({ id: 'd-new', messageId: 'm-new' })
    const call = drafts.create.mock.calls[0][0] as { requestBody: { message: { raw: string; threadId: string } } }
    expect(call.requestBody.message.threadId).toBe('t-1')
    const text = decode(call.requestBody.message.raw)
    expect(text).toContain('To: aiko@example.jp\r\n')
    expect(text).toContain('In-Reply-To: <abc@mail>')
  })

  it('updates the draft it was given', async () => {
    await draftsRoute.POST(req('http://x/api/gmail/drafts', { method: 'POST', body: { id: 'd-1', to: 'aiko@example.jp', subject: 's', body: 'b' } }))
    expect(drafts.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'd-1' }))
    expect(drafts.create).not.toHaveBeenCalled()
  })

  it('discards a draft; refuses a malformed id', async () => {
    expect((await draftsRoute.DELETE(req('http://x/api/gmail/drafts?id=d-1', { method: 'DELETE' }))).status).toBe(200)
    expect(drafts.delete).toHaveBeenCalledWith({ userId: 'me', id: 'd-1' })
    expect((await draftsRoute.DELETE(req('http://x/api/gmail/drafts?id=../x', { method: 'DELETE' }))).status).toBe(400)
  })
})

describe('/api/gmail/threads', () => {
  it('returns the conversation oldest first, without drafts', async () => {
    const res = await threadsRoute.GET(req('http://x/api/gmail/threads?id=t-1'))
    const { messages } = await res.json()
    expect(messages.map((m: { id: string }) => m.id)).toEqual(['m1', 'm2'])
  })
  it('refuses a malformed thread id', async () => {
    expect((await threadsRoute.GET(req('http://x/api/gmail/threads?id=a%20b'))).status).toBe(400)
  })
})

describe('send and the inbox page', () => {
  const send = readFileSync('app/api/gmail/send/route.ts', 'utf8')
  const page = readFileSync('app/inbox/_views/EmailView.tsx', 'utf8')
  it('send takes Cc and Bcc, refuses what is not an address, stores them, removes a sent draft', () => {
    expect(send).toContain('const ccList = parseRecipients(cc)')
    expect(send).toContain('Not an email address:')
    expect(send).toContain('cc_addresses: ccList.list')
    expect(send).toContain("gmail.users.drafts.delete({ userId: 'me', id: draftId })")
  })
  it('the inbox has Reply all, Forward, the conversation and drafts that reopen', () => {
    expect(page).toContain("openCompose('replyAll')")
    expect(page).toContain("openCompose('forward')")
    expect(page).toContain('/api/gmail/threads?id=')
    expect(page).toContain("folder === 'drafts' ? openDraft(email) : setSelectedEmail(email)")
    expect(page).toContain('Save draft')
  })
})
