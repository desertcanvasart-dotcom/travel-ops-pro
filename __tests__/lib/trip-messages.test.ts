// The traveller chat: what crosses to the share page, what a traveller's text
// is cleaned to, and what the office notification records
// (lib/itinerary-share, lib/trip-message-notify — ported from autoura-saas).
import { describe, it, expect, vi } from 'vitest'
import { cleanClientText, toClientTripMessages } from '@/lib/itinerary-share'
import { decideTripNotifyOutcome, notifyTripMessage, type NotifyDeps } from '@/lib/trip-message-notify'

describe('the thread on the share page', () => {
  it('only direction, text, display name and time cross — oldest first; junk is dropped', () => {
    const out = toClientTripMessages([
      { direction: 'outbound', content: 'See you at 8', sender_name: 'Adham', created_at: '2026-10-08T10:00:00Z', team_member_id: 'tm', org_id: 'o', is_read: true, notify_outcome: null },
      { direction: 'inbound', content: 'What time tomorrow?', sender_name: 'Hanako', created_at: '2026-10-08T09:00:00Z' },
      { direction: 'sideways', content: 'x', created_at: '2026-10-08T11:00:00Z' },
      { direction: 'inbound', content: '', created_at: '2026-10-08T12:00:00Z' },
    ])
    expect(out).toEqual([
      { direction: 'inbound', content: 'What time tomorrow?', senderName: 'Hanako', createdAt: '2026-10-08T09:00:00Z' },
      { direction: 'outbound', content: 'See you at 8', senderName: 'Adham', createdAt: '2026-10-08T10:00:00Z' },
    ])
  })

  it("a traveller's text loses control characters, keeps its lines, and is capped", () => {
    expect(cleanClientText('  hello\u0000\nworld\u0007  ', 100)).toBe('hello\nworld')
    expect(cleanClientText('abcdef', 3)).toBe('abc')
    expect(cleanClientText('   ', 10)).toBeNull()
    expect(cleanClientText(42, 10)).toBeNull()
  })
})

describe('telling the office', () => {
  it('the outcome table', () => {
    expect(decideTripNotifyOutcome('sent', { attempted: false, success: false })).toBe('push_sent')
    expect(decideTripNotifyOutcome('no_subscriptions', { attempted: true, success: true })).toBe('email_sent')
    expect(decideTripNotifyOutcome('not_configured', { attempted: true, success: false, configError: true })).toBe('not_configured')
    expect(decideTripNotifyOutcome('no_subscriptions', { attempted: true, success: false })).toBe('failed')
    expect(decideTripNotifyOutcome('not_configured', { attempted: false, success: false })).toBe('not_configured')
    expect(decideTripNotifyOutcome('no_subscriptions', { attempted: false, success: false })).toBe('no_recipients')
  })

  const deps = (push: NotifyDeps['push'], contactEmail: string | null, mailOk = true) => {
    const stamps: Record<string, unknown>[] = []
    const mail = vi.fn(async () => ({ success: mailOk }))
    const d: NotifyDeps = {
      push,
      mail,
      db: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { contact_email: contactEmail } }) }) }),
          update: (patch: Record<string, unknown>) => ({ eq: async () => { stamps.push(patch); return { error: null } } }),
        }),
      }),
    }
    return { d, stamps, mail }
  }
  const input = { orgId: 'o', itineraryId: 'it', messageId: 'm', senderName: 'Hanako', tripName: 'Cairo', content: 'What time <b>tomorrow</b>?' }

  it('a push that reached a browser is enough; no email', async () => {
    const { d, stamps, mail } = deps(async () => ({ outcome: 'sent', delivered: 1 }), 'office@example.com')
    expect(await notifyTripMessage(input, d)).toBe('push_sent')
    expect(mail).not.toHaveBeenCalled()
    expect(stamps).toEqual([{ notify_outcome: 'push_sent' }])
  })

  it('no push: an email to the contact address, the text escaped', async () => {
    const { d, stamps, mail } = deps(async () => ({ outcome: 'no_subscriptions', delivered: 0 }), 'office@example.com')
    expect(await notifyTripMessage(input, d)).toBe('email_sent')
    const sent = (mail.mock.calls[0] as unknown as [{ to: string; html: string }])[0]
    expect(sent.to).toBe('office@example.com')
    expect(sent.html).toContain('&lt;b&gt;tomorrow&lt;/b&gt;')
    expect(stamps).toEqual([{ notify_outcome: 'email_sent' }])
  })

  it('nobody reachable is recorded, not swallowed; a throwing push is "failed"', async () => {
    expect(await notifyTripMessage(input, deps(async () => ({ outcome: 'no_subscriptions', delivered: 0 }), null).d)).toBe('no_recipients')
    expect(await notifyTripMessage(input, deps(async () => { throw new Error('boom') }, 'x@example.com').d)).toBe('failed')
  })
})
