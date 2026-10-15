// Schedule send (operator, 2026-10-15): the scheduler sends each due draft
// once, retries what Gmail may get over, and tells the sender about the rest.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { sendDueScheduledEmails, MAX_ATTEMPTS } from '@/lib/email/send-scheduled'

const NOW = new Date('2026-10-16T00:00:00Z')
const row = (over: Record<string, unknown> = {}) => ({
  id: 's1', org_id: 'org', created_by: 'u1', mailbox_user_id: 'mb', draft_id: 'd1',
  subject: 'Your Luxor tour', to_summary: 'aiko@example.jp', attempts: 0,
  status: 'scheduled', send_at: '2026-10-16T00:00:00.000Z', ...over,
})

let tables: { scheduled_emails: Record<string, unknown>[] }
const send = vi.fn()
const notify = vi.fn(async () => ({}))
const deps = () => ({ db: createMockClient(), gmailFor: async () => ({ users: { drafts: { send } } }), notify, now: NOW })

beforeEach(() => {
  send.mockReset()
  notify.mockClear()
})

describe('sendDueScheduledEmails', () => {
  it('sends a due draft and records it', async () => {
    tables = { scheduled_emails: [row()] }
    setMockTables(tables)
    send.mockResolvedValue({ data: { id: 'msg-9' } })
    expect(await sendDueScheduledEmails(deps())).toEqual({ sent: 1, retried: 0, failed: 0 })
    expect(send).toHaveBeenCalledWith({ userId: 'me', requestBody: { id: 'd1' } })
    expect(tables.scheduled_emails[0]).toMatchObject({ status: 'sent', sent_message_id: 'msg-9', attempts: 1 })
  })

  it('leaves what is not due yet, and what is cancelled', async () => {
    tables = { scheduled_emails: [row({ send_at: '2026-10-16T00:05:00.000Z' }), row({ id: 's2', status: 'cancelled' })] }
    setMockTables(tables)
    expect(await sendDueScheduledEmails(deps())).toEqual({ sent: 0, retried: 0, failed: 0 })
    expect(send).not.toHaveBeenCalled()
  })

  it('a rate limit is tried again five minutes later', async () => {
    tables = { scheduled_emails: [row()] }
    setMockTables(tables)
    send.mockRejectedValue(Object.assign(new Error('Rate limit'), { response: { status: 429 } }))
    expect(await sendDueScheduledEmails(deps())).toEqual({ sent: 0, retried: 1, failed: 0 })
    expect(tables.scheduled_emails[0]).toMatchObject({ status: 'scheduled', send_at: '2026-10-16T00:05:00.000Z' })
    expect(notify).not.toHaveBeenCalled()
  })

  it(`gives up after ${MAX_ATTEMPTS} tries, and a deleted draft at once — and says so`, async () => {
    tables = { scheduled_emails: [row({ attempts: MAX_ATTEMPTS - 1 }), row({ id: 's2', draft_id: 'gone' })] }
    setMockTables(tables)
    send.mockImplementation(async ({ requestBody }: { requestBody: { id: string } }) => {
      throw Object.assign(new Error('x'), { response: { status: requestBody.id === 'gone' ? 404 : 503 } })
    })
    expect(await sendDueScheduledEmails(deps())).toEqual({ sent: 0, retried: 0, failed: 2 })
    expect(tables.scheduled_emails[1]).toMatchObject({ status: 'failed', error: 'The draft no longer exists (sent or deleted in Drafts).' })
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1', title: 'A scheduled email was not sent' }))
  })
})
