// A trip-chat reply emails the traveller (lib/trip-chat/notify-traveller.ts).
import { describe, it, expect, vi } from 'vitest'
import { notifyTravellerOfTripReply, tripReplyEmail, type NotifyTravellerDeps } from '@/lib/trip-chat/notify-traveller'

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
  const db = (rows: Rows) => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'order', 'limit']) q[m] = () => q
      q.maybeSingle = async () => ({ data: rows[table] ?? null })
      return q
    },
  })
  const TRIP = { itinerary_code: 'ITN-2026-1', trip_name: 'NEK803-ABCR — Cairo & Luxor', client_name: 'Hanako Sato', client_email: 'hanako@example.jp', client_id: 'c1' }
  const deps = (ok = true, noAccount = false) => {
    const mail = vi.fn(async () => ({ success: ok, noAccount }))
    return { mail, d: { mail } as NotifyTravellerDeps }
  }
  const args = { itineraryId: 'it', orgId: 'o', appUrl: 'https://app.example/' }

  it('emails the client with the newest live share link, in their language, the programme code left off', async () => {
    const { mail, d } = deps()
    const outcome = await notifyTravellerOfTripReply(
      db({ itineraries: TRIP, itinerary_shares: { token: 'tok' }, clients: { preferred_language: 'English' }, organizations: { name: 'Nile Tours' } }),
      args, d)
    expect(outcome).toBe('sent')
    const sent = (mail.mock.calls[0] as unknown as [{ to: string; subject: string; html: string }])[0]
    expect(sent.to).toBe('hanako@example.jp')
    expect(sent.subject).toBe('Cairo & Luxor: a reply from your travel team')
    expect(sent.html).toContain('https://app.example/share/tok')
  })

  it('Japanese when the client record says nothing', async () => {
    const { mail, d } = deps()
    await notifyTravellerOfTripReply(db({ itineraries: TRIP, itinerary_shares: { token: 'tok' } }), args, d)
    expect((mail.mock.calls[0] as unknown as [{ subject: string }])[0].subject).toBe('【Cairo & Luxor】担当者からのご返信')
  })

  it('says why it could not: no address, no link, no mailbox, a refused send', async () => {
    expect(await notifyTravellerOfTripReply(db({ itineraries: { ...TRIP, client_email: ' ' } }), args, deps().d)).toBe('no-recipient')
    expect(await notifyTravellerOfTripReply(db({ itineraries: TRIP }), args, deps().d)).toBe('no-link')
    const withLink = db({ itineraries: TRIP, itinerary_shares: { token: 'tok' } })
    expect(await notifyTravellerOfTripReply(withLink, args, deps(false, true).d)).toBe('no-account')
    expect(await notifyTravellerOfTripReply(withLink, args, deps(false).d)).toBe('failed')
  })
})
