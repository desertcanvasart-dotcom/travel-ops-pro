import { describe, it, expect, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/gmail', () => ({ getAuthenticatedGmail: async () => ({}), GmailAuthError: class extends Error {} }))
import { isOwnNotificationMail, OWN_NOTIFICATION_HEADER_LINES } from '@/lib/email/own-notification-mail'
import { buildSimpleEmail } from '@/lib/email-send'

// Autoura's own notifications to staff are marked when sent and never filed
// as inbox conversations (ATS 2026-11-07).

describe('isOwnNotificationMail', () => {
  it('outbound + the marker header (any case), or outbound + the [Autoura] subject prefix', () => {
    expect(isOwnNotificationMail({ outbound: true, headers: { 'x-autoura-notification': '1' }, subject: 'Anything' })).toBe(true)
    expect(isOwnNotificationMail({ outbound: true, headers: {}, subject: '[Autoura] 料金変更: ホテル料金 15件' })).toBe(true)
    expect(isOwnNotificationMail({ outbound: true, headers: {}, subject: 'Re: [Autoura] something' })).toBe(false)
    expect(isOwnNotificationMail({ outbound: true, headers: {}, subject: 'Your Siwa quote' })).toBe(false)
  })
  it('never inbound mail — a customer cannot make their mail look like ours', () => {
    expect(isOwnNotificationMail({ outbound: false, headers: { 'X-Autoura-Notification': '1' }, subject: '[Autoura] x' })).toBe(false)
  })
})

describe('the send marks it', () => {
  const decode = (raw: string) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  it('marked mail carries the header lines before the MIME headers; customer mail does not', () => {
    const marked = decode(buildSimpleEmail('From: a@b.c', 'staff@b.c', 'Subject', '<p>x</p>', OWN_NOTIFICATION_HEADER_LINES))
    expect(marked).toContain('X-Autoura-Notification: 1\r\nAuto-Submitted: auto-generated\r\nMIME-Version: 1.0')
    const plain = decode(buildSimpleEmail('From: a@b.c', 'client@b.c', 'Subject', '<p>x</p>'))
    expect(plain).not.toContain('X-Autoura-Notification')
  })
})
