// A trip-chat reply emails the traveller (lib/trip-chat/notify-traveller.ts).
import { describe, it, expect, vi } from 'vitest'
import { groupedWithEarlierEmail, notifyTravellerOfTripReply, tripReplyEmail, type NotifyTravellerDeps } from '@/lib/trip-chat/notify-traveller'

describe('the email', () => {
  it('Japanese: name with 様, the trip, the link — never the reply itself', () => {
    const e = tripReplyEmail({ language: 'ja', clientName: '佐藤 花子', tripName: 'カイロ5日間', itineraryCode: 'ITN-2026-1234', agency: 'Nile Tours', url: 'https://app.example/share/tok' })
    expect(e.subject).toBe('【カイロ5日間】担当者からのご返信')
    expect(e.html).toContain('佐藤 花子 様')
    expect(e.html).toContain('<a href="https://app.example/share/tok">')
    expect(e.html).toContain('旅程番号：ITN-2026-1234')
  })

  it('English, and what comes from records is escaped', () => {
    const e = tripReplyEmail({ language: 'en', clientName: 'Ann <b>', tripName: null, itineraryCode: null, agency: null, url: 'https://x/share/t' })
    expect(e.subject).toBe('Your trip: a reply from your travel team')
    expect(e.html).toContain('Dear Ann &lt;b&gt;,')
    expect(e.html).not.toContain('Reference:')
  })
})

describe('sending it', () => {
  type Rows = Record<string, unknown | null>
  /** A fake client: single rows per table, the thread for trip_messages, and the stamps recorded. */
  const db = (rows: Rows, thread: Array<Record<string, unknown>> | { error: string } = []) => {
    const stamps: Array<Record<string, unknown>> = []
    const client = {
      from: (table: string) => {
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'neq', 'is', 'order']) q[m] = () => q
        q.limit = () => (table === 'trip_messages'
          ? Promise.resolve(Array.isArray(thread) ? { data: thread, error: null } : { data: null, error: { message: thread.error } })
          : q)
        q.maybeSingle = async () => ({ data: rows[table] ?? null })
        q.update = (patch: Record<string, unknown>) => ({ eq: async () => { stamps.push(patch); return { error: null } } })
        return q
      },
    }
    return { client, stamps }
  }
  const TRIP = { itinerary_code: 'ITN-2026-1', trip_name: 'NEK803-ABCR — Cairo & Luxor', client_name: 'Hanako Sato', client_email: 'hanako@example.jp', client_id: 'c1' }
  const deps = (ok = true, noAccount = false) => {
    const mail = vi.fn(async () => ({ success: ok, noAccount }))
    return { mail, d: { mail } as NotifyTravellerDeps }
  }
  const NOW = new Date('2026-10-08T10:00:00Z')
  const args = { itineraryId: 'it', orgId: 'o', messageId: 'new', appUrl: 'https://app.example/', now: NOW }
  const LINKED = { itineraries: TRIP, itinerary_shares: { token: 'tok' } }

  it('emails the client with the newest live share link, in their language, the programme code left off — and records it', async () => {
    const { mail, d } = deps()
    const { client, stamps } = db({ ...LINKED, clients: { preferred_language: 'English' }, organizations: { name: 'Nile Tours' } })
    expect((await notifyTravellerOfTripReply(client, args, d)).outcome).toBe('sent')
    const sent = (mail.mock.calls[0] as unknown as [{ to: string; subject: string; html: string }])[0]
    expect(sent.to).toBe('hanako@example.jp')
    expect(sent.subject).toBe('Cairo & Luxor: a reply from your travel team')
    expect(sent.html).toContain('https://app.example/share/tok')
    expect(stamps).toEqual([{ traveller_notified: 'sent' }])
  })

  it('Japanese when the client record says nothing', async () => {
    const { mail, d } = deps()
    await notifyTravellerOfTripReply(db(LINKED).client, args, d)
    expect((mail.mock.calls[0] as unknown as [{ subject: string }])[0].subject).toBe('【Cairo & Luxor】担当者からのご返信')
  })

  it('says why it could not: no address, no link, no mailbox, a refused send', async () => {
    const outcome = async (rows: Rows, dep = deps().d) => (await notifyTravellerOfTripReply(db(rows).client, args, dep)).outcome
    expect(await outcome({ itineraries: { ...TRIP, client_email: ' ' } })).toBe('no-recipient')
    expect(await outcome({ itineraries: TRIP })).toBe('no-link')
    expect(await outcome(LINKED, deps(false, true).d)).toBe('no-account')
    expect(await outcome(LINKED, deps(false).d)).toBe('failed')
  })

  it('a reply a few minutes after an emailed one rides on that email', async () => {
    const { mail, d } = deps()
    const { client, stamps } = db(LINKED, [{ direction: 'outbound', created_at: '2026-10-08T09:55:00Z', traveller_notified: 'sent' }])
    expect(await notifyTravellerOfTripReply(client, args, d)).toEqual({ outcome: 'grouped', emailedAt: '2026-10-08T09:55:00Z' })
    expect(mail).not.toHaveBeenCalled()
    expect(stamps).toEqual([{ traveller_notified: 'grouped' }])
  })

  it('before the migration (the thread cannot be read with the column), it just emails', async () => {
    const { mail, d } = deps()
    expect((await notifyTravellerOfTripReply(db(LINKED, { error: 'column trip_messages.traveller_notified does not exist' }).client, args, d)).outcome).toBe('sent')
    expect(mail).toHaveBeenCalledOnce()
  })
})

describe('which replies are grouped', () => {
  const NOW = new Date('2026-10-08T10:00:00Z')
  const out = (created_at: string, traveller_notified: string | null = 'sent') => ({ direction: 'outbound', created_at, traveller_notified })
  const inb = (created_at: string) => ({ direction: 'inbound', created_at })

  it('within ten minutes of the last email, the traveller silent since: grouped', () => {
    expect(groupedWithEarlierEmail([out('2026-10-08T09:51:00Z')], NOW).grouped).toBe(true)
  })

  it('ten minutes or more since that email: emailed again', () => {
    expect(groupedWithEarlierEmail([out('2026-10-08T09:50:00Z')], NOW).grouped).toBe(false)
  })

  it('the window runs from the last EMAIL, not the last reply: a long back-and-forth still emails every so often', () => {
    expect(groupedWithEarlierEmail([out('2026-10-08T09:58:00Z', 'grouped'), out('2026-10-08T09:49:00Z', 'grouped'), out('2026-10-08T09:40:00Z')], NOW).grouped).toBe(false)
  })

  it('once the traveller writes back, the next reply is emailed', () => {
    expect(groupedWithEarlierEmail([inb('2026-10-08T09:57:00Z'), out('2026-10-08T09:55:00Z')], NOW).grouped).toBe(false)
  })

  it('an earlier reply that was NOT emailed (no link, failed) groups nothing', () => {
    expect(groupedWithEarlierEmail([out('2026-10-08T09:59:00Z', 'failed'), out('2026-10-08T09:58:00Z', null)], NOW).grouped).toBe(false)
  })
})
