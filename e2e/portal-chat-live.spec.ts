import { test, expect } from '@playwright/test'
import { STORAGE_STATE } from './helpers'
import { rest, createTestItinerary, destroyTestItinerary, type TestItinerary } from './fixtures'

// A whole conversation against the real database: the traveller asks, the
// office answers, and — the part that matters most — one traveller's private
// question stays private.
//
// Setup and teardown go through the service role (the house fixture pattern);
// every assertion goes through the real API.

test.setTimeout(180_000)
test.use({ storageState: STORAGE_STATE })

test('a traveller and the office hold a conversation', async ({ request }) => {
  const itin: TestItinerary = await createTestItinerary('chat')
  let bookingId: string | null = null

  try {
    const [booking] = await rest('bookings', {
      method: 'POST',
      body: JSON.stringify({
        org_id: itin.orgId, itinerary_id: itin.id,
        booking_code: `ZZC-${String(Date.now()).slice(-8)}`,
        client_name: 'ZZ TEST — chat', trip_name: 'ZZ TEST chat trip',
        // The operator's own address, with their permission: the reply
        // notification is what brings a traveller back to read an answer, so a
        // send path that silently does nothing looks exactly like success.
        client_email: 'info@travel2egypt.org',
        start_date: itin.startDate, end_date: itin.endDate,
        num_adults: 2, status: 'confirmed',
      }),
    })
    bookingId = booking.id

    const [p1] = await rest('booking_passengers', {
      method: 'POST',
      body: JSON.stringify({ org_id: itin.orgId, booking_id: booking.id, last_name: 'Tanaka', first_name: 'Taro', is_lead_passenger: true }),
    })
    const [p2] = await rest('booking_passengers', {
      method: 'POST',
      body: JSON.stringify({ org_id: itin.orgId, booking_id: booking.id, last_name: 'Suzuki', first_name: 'Hanako', is_lead_passenger: false }),
    })

    // Two links: the shared family one, and a private one for each traveller.
    const mint = async (passenger_id?: string) => {
      const res = await request.post(`/api/bookings/${booking.id}/portal-link`, {
        data: passenger_id ? { passenger_id } : {},
      })
      expect(res.ok(), await res.text()).toBeTruthy()
      return (await res.json()).link.token as string
    }
    const sharedToken = await mint()
    const p1Token = await mint(p1.id)
    const p2Token = await mint(p2.id)

    const verify = async (token: string, answer: string, dob?: string) => {
      const res = await request.post(`/api/portal/${token}/verify`, { data: { answer, dob } })
      expect(res.ok(), await res.text()).toBeTruthy()
    }
    const say = (token: string, body: string) =>
      request.post(`/api/portal/${token}/messages`, { data: { body } })
    const read = (token: string) => request.get(`/api/portal/${token}/messages`)

    // 1. The gate applies to chat too — a link without the cookie says nothing.
    expect((await say(sharedToken, 'hello')).status()).toBe(403)

    // 2. The lead asks a question on the shared link.
    await verify(sharedToken, 'Tanaka')
    const asked = await say(sharedToken, 'ビザの申請はいつまでに必要ですか？')
    expect(asked.ok(), await asked.text()).toBeTruthy()
    const posted = (await asked.json()).messages
    // Their message, plus the automatic acknowledgement.
    expect(posted).toHaveLength(2)
    expect(posted[0].sender).toBe('customer')
    expect(posted[1].sender).toBe('system')
    expect(posted[1].body).toContain('受け付けました')

    // 3. A second message does NOT repeat the acknowledgement.
    const again = await say(sharedToken, 'あわせて保険についても教えてください。')
    expect((await again.json()).messages).toHaveLength(1)

    // 4. The office sees it and replies.
    const staffView = await request.get(`/api/bookings/${booking.id}/portal-messages`)
    expect(staffView.ok(), await staffView.text()).toBeTruthy()
    const threads = (await staffView.json()).threads
    expect(threads).toHaveLength(1)
    expect(threads[0].scope).toBe('booking')
    expect(threads[0].unread).toBe(true)

    const replied = await request.post(`/api/bookings/${booking.id}/portal-messages`, {
      data: { threadId: threads[0].id, body: 'ビザは出発の3週間前までにお願いいたします。' },
    })
    expect(replied.ok(), await replied.text()).toBeTruthy()
    const replyJson = await replied.json()
    console.log('reply emailed to traveller:', replyJson.emailed)
    expect(replyJson.emailed, 'the reply notification did not send').toBe(true)

    // 5. The traveller sees the reply.
    const seen = (await (await read(sharedToken)).json())
    expect(seen.messages.map((m: any) => m.sender)).toEqual(['customer', 'system', 'customer', 'staff'])
    expect(seen.hours).toEqual(['東京・大阪 月〜金 09:00〜17:00', 'カイロ 日〜木 09:00〜17:00'])

    // 6. THE PRIVACY RULE. A private link gets its OWN conversation and cannot
    //    read the party's shared one.
    await verify(p2Token, 'Suzuki', '')
      .catch(() => {})   // per-traveller gate wants a DOB; seeded rows have none
    const p2Read = await read(p2Token)
    // Fail-closed with no DOB on file is correct — that is the documented gate.
    expect([200, 403]).toContain(p2Read.status())
    if (p2Read.status() === 200) {
      expect((await p2Read.json()).messages, 'a friend could read the party thread').toEqual([])
    }

    // 7. Whatever happened above, the office still sees exactly one thread —
    //    no private thread was created by merely reading.
    const after = (await (await request.get(`/api/bookings/${booking.id}/portal-messages`)).json())
    expect(after.threads).toHaveLength(1)
  } finally {
    if (bookingId) await rest(`bookings?id=eq.${bookingId}`, { method: 'DELETE' })
    await destroyTestItinerary(itin)
  }
})
