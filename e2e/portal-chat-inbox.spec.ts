import { test, expect } from '@playwright/test'
import { STORAGE_STATE } from './helpers'
import { rest, createTestItinerary, destroyTestItinerary, type TestItinerary } from './fixtures'

// A portal conversation must appear in the unified inbox beside WhatsApp and
// email, and be answerable from there — with the SAME reply path the booking
// page uses, so the two surfaces cannot drift on the part that matters:
// actually telling the traveller.

test.setTimeout(180_000)
test.use({ storageState: STORAGE_STATE })

test('a portal conversation reaches the unified inbox', async ({ request }) => {
  const itin: TestItinerary = await createTestItinerary('inbox')
  let bookingId: string | null = null

  try {
    const [booking] = await rest('bookings', {
      method: 'POST',
      body: JSON.stringify({
        org_id: itin.orgId, itinerary_id: itin.id,
        booking_code: `ZZI-${String(Date.now()).slice(-8)}`,
        client_name: 'ZZ TEST — inbox', trip_name: 'ZZ TEST inbox trip',
        client_email: 'info@travel2egypt.org',
        start_date: itin.startDate, end_date: itin.endDate,
        num_adults: 1, status: 'confirmed',
      }),
    })
    bookingId = booking.id
    await rest('booking_passengers', {
      method: 'POST',
      body: JSON.stringify({ org_id: itin.orgId, booking_id: booking.id, last_name: 'Tanaka', first_name: 'Taro', is_lead_passenger: true }),
    })

    const mint = await request.post(`/api/bookings/${booking.id}/portal-link`, { data: {} })
    const token = (await mint.json()).link.token as string
    await request.post(`/api/portal/${token}/verify`, { data: { answer: 'Tanaka' } })
    const asked = await request.post(`/api/portal/${token}/messages`, {
      data: { body: '空港での待ち合わせ場所を教えてください。' },
    })
    expect(asked.ok(), await asked.text()).toBeTruthy()

    // 1. It shows up in the inbox, as its own channel.
    const list = await request.get('/api/unified/conversations?channel=all&limit=100')
    expect(list.ok(), await list.text()).toBeTruthy()
    const all = (await list.json()).conversations ?? (await list.json()).data ?? []
    const mine = all.find((c: any) => c.channel === 'portal' && c.identifier === booking.booking_code)
    expect(mine, 'the portal conversation is missing from the inbox').toBeTruthy()
    expect(mine.unread_count).toBe(1)
    // The subject says WHICH conversation — a booking can hold several.
    expect(mine.subject).toContain('whole party')

    // 2. Filtering by channel finds it and excludes the others.
    const filtered = await request.get('/api/unified/conversations?channel=portal&limit=100')
    const onlyPortal = (await filtered.json()).conversations ?? []
    expect(onlyPortal.every((c: any) => c.channel === 'portal')).toBe(true)

    // 3. Opening it loads the messages in the inbox's own shape.
    const thread = await request.get(`/api/portal-chat/messages?conversation_id=${mine.id}`)
    expect(thread.ok(), await thread.text()).toBeTruthy()
    const msgs = (await thread.json()).messages
    expect(msgs[0].direction).toBe('inbound')
    expect(msgs[0].message_body).toContain('待ち合わせ')

    // 4. Replying from the inbox works AND emails the traveller — the same
    //    path the booking page uses.
    const replied = await request.post('/api/portal-chat/messages', {
      data: { conversationId: mine.id, message: '到着ロビーの出口でお待ちしております。' },
    })
    expect(replied.ok(), await replied.text()).toBeTruthy()
    const replyJson = await replied.json()
    expect(replyJson.emailed, 'replying from the inbox did not notify the traveller').toBe(true)

    // 5. Opening it marked it read, so it stops shouting at the whole team.
    const after = await request.get('/api/unified/conversations?channel=portal&limit=100')
    const refreshed = ((await after.json()).conversations ?? []).find((c: any) => c.id === mine.id)
    expect(refreshed.unread_count).toBe(0)

    // 6. The traveller sees the inbox reply on their own page.
    const seen = await request.get(`/api/portal/${token}/messages`)
    const bodies = (await seen.json()).messages.map((m: any) => m.body)
    expect(bodies.some((b: string) => b.includes('到着ロビー'))).toBe(true)
  } finally {
    if (bookingId) await rest(`bookings?id=eq.${bookingId}`, { method: 'DELETE' })
    await destroyTestItinerary(itin)
  }
})
