import { test, expect } from '@playwright/test'
import { STORAGE_STATE } from './helpers'
import { rest, createTestItinerary, destroyTestItinerary, type TestItinerary } from './fixtures'

// The upload path against a REAL private bucket, which did not exist anywhere
// until the migration landed — everything before this was unit tests and a
// build. This is the feature that stores passports, so the assertions that
// matter most are the negative ones: an HTML file cannot arrive dressed as a
// JPEG, and the stored object is NOT readable without a signed URL.
//
// Setup and teardown go through the service role (the house fixture pattern);
// every assertion goes through the real API.

test.use({ storageState: STORAGE_STATE })

const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(512, 0x41)])
const html = () => Buffer.from('<!DOCTYPE html><script>alert(1)</script>')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

test('passport upload, end to end, against the real private bucket', async ({ request }) => {
  // A throwaway itinerary this spec owns; bookings require one.
  const itin: TestItinerary = await createTestItinerary('passport')
  const orgId = itin.orgId

  // Everything from here is inside the try: a failure between creating the
  // itinerary and creating the booking used to orphan the itinerary, because
  // the cleanup block had not been entered yet.
  let bookingId: string | null = null
  let storagePath: string | null = null
  try {
  const [booking] = await rest('bookings', {
    method: 'POST',
    body: JSON.stringify({
      org_id: orgId,
      itinerary_id: itin.id,
      booking_code: `ZZT-${String(Date.now()).slice(-10)}`,
      client_name: 'ZZ TEST — passport upload',
      trip_name: 'ZZ TEST trip',
      start_date: itin.startDate,
      end_date: itin.endDate,
      num_adults: 1,
      status: 'confirmed',
    }),
  })

    bookingId = booking.id
    const [pax] = await rest('booking_passengers', {
      method: 'POST',
      body: JSON.stringify({
        org_id: orgId, booking_id: booking.id,
        last_name: 'Tanaka', first_name: 'Taro', is_lead_passenger: true,
      }),
    })

    const mint = await request.post(`/api/bookings/${bookingId}/portal-link`, { data: {} })
    expect(mint.ok(), await mint.text()).toBeTruthy()
    const token: string = (await mint.json()).link.token

    const upload = (body: Buffer, name: string, type: string, kind = 'passport') =>
      request.post(`/api/portal/${token}/travellers/${pax.id}/documents`, {
        multipart: { file: { name, mimeType: type, buffer: body }, kind },
      })

    // 1. The gate. No confirmation cookie yet — a forwarded link cannot upload.
    expect((await upload(jpeg(), 'p.jpg', 'image/jpeg')).status()).toBe(403)

    // 2. Pass the real gate with the lead's family name.
    const verify = await request.post(`/api/portal/${token}/verify`, { data: { answer: 'Tanaka' } })
    expect(verify.ok(), await verify.text()).toBeTruthy()

    // 3. An HTML file announced as a JPEG. The magic-byte sniff is the whole
    //    reason the MIME allowlist means anything.
    const disguised = await upload(html(), 'passport.jpg', 'image/jpeg')
    expect(disguised.status()).toBe(415)

    // 4. A real passport photo.
    const ok = await upload(jpeg(), 'passport.jpg', 'image/jpeg')
    expect(ok.ok(), await ok.text()).toBeTruthy()
    const doc = (await ok.json()).document
    expect(doc.kind).toBe('passport')

    // 5. The operator sees it, with a retention date already stamped.
    const listed = await request.get(`/api/bookings/${bookingId}/passenger-documents`)
    const row = (await listed.json()).travellers.flatMap((t: any) => t.documents)[0]
    expect(row.kind).toBe('passport')
    // Day after the booking's end date, stamped at upload.
    const dayAfterEnd = new Date(`${itin.endDate}T00:00:00Z`)
    dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1)
    expect(row.purgeAfter?.slice(0, 10)).toBe(dayAfterEnd.toISOString().slice(0, 10))

    // 6. THE POINT OF THE PRIVATE BUCKET: the object is not readable by URL.
    const [stored] = await rest(
      `booking_passenger_documents?id=eq.${row.id}&select=storage_path`
    )
    storagePath = stored.storage_path
    const anon = await fetch(`${SUPABASE_URL}/storage/v1/object/public/traveller-documents/${storagePath}`)
    expect(anon.ok, 'passport scan was PUBLICLY READABLE').toBe(false)

    // 7. The operator route mints a signed URL that does work.
    const opened = await request.get(
      `/api/bookings/${bookingId}/passenger-documents/${row.id}`,
      { maxRedirects: 0 }
    )
    expect([302, 307]).toContain(opened.status())
    const signed = opened.headers()['location']
    expect(signed).toContain('token=')
    const viaSigned = await fetch(signed)
    expect(viaSigned.ok, 'signed URL did not serve the file').toBe(true)

    // 8. The traveller can take it back off — row AND object.
    //    Checked against the storage API, not by re-fetching the signed URL:
    //    that URL was already fetched above and Supabase serves storage through
    //    a CDN, so a cached 200 would prove nothing about the bucket.
    const removed = await request.delete(`/api/portal/${token}/travellers/${pax.id}/documents/${row.id}`)
    expect(removed.ok(), await removed.text()).toBeTruthy()

    const stillIndexed = await rest(`booking_passenger_documents?id=eq.${row.id}&select=id`)
    expect(stillIndexed, 'index row survived deletion').toHaveLength(0)

    const prefix = storagePath!.split('/').slice(0, -1).join('/')
    const name = storagePath!.split('/').pop()
    const bucketList = await fetch(`${SUPABASE_URL}/storage/v1/object/list/traveller-documents`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix, limit: 100 }),
    })
    const objects = await bucketList.json()
    expect(
      objects.map((o: any) => o.name),
      'passport object survived deletion'
    ).not.toContain(name)
    storagePath = null
  } finally {
    if (bookingId) await rest(`bookings?id=eq.${bookingId}`, { method: 'DELETE' })
    await destroyTestItinerary(itin)
    if (storagePath) {
      console.warn('LEFTOVER OBJECT — remove manually:', storagePath)
    }
  }
})
