import { test, expect } from '@playwright/test'
import { STORAGE_STATE } from './helpers'

// ============================================
// Tier 2 — quote → booking conversion, end to end through the REAL route
// ============================================
// This is the only way to exercise POST /api/bookings/from-quote for real: the
// middleware gates every /api/* behind a session, so the assertions below run
// with the authenticated E2E cookie rather than a service-role shortcut that
// would skip the very gates worth testing.
//
// Everything is created in and removed from the seeded E2E org, so no real
// operator quote, booking or itinerary is touched.
//
// What it proves, in order: the deposit arithmetic and stored percentage; that
// balance_due is the FULL total at creation (record_booking_payment recomputes
// it as total_cost - total_paid, so anything else is a number the first payment
// contradicts); that one quote cannot produce two bookings — i.e. two deposits;
// and that a bad percentage or an unaccepted quote is refused before any row is
// written.

const HAVE_CREDS = !!process.env.E2E_EMAIL && !!process.env.E2E_PASSWORD
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

test.use({ storageState: STORAGE_STATE })
test.skip(!HAVE_CREDS, 'E2E_EMAIL / E2E_PASSWORD not set')
test.skip(!SUPABASE_URL || !SERVICE_KEY, 'Supabase service credentials not set')

const ITIN_CODE = 'E2E-SMOKE-001'
const QUOTE_NUMBER = 'E2E-Q2B-001'
/** The agreed total under test. Deliberately not round, to catch bad rounding. */
const SELLING_PRICE = 5822.05

// --- direct REST helpers (fixture setup/teardown only; never the assertions) ---
function headers() {
  return {
    apikey: SERVICE_KEY!,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: headers() })
  const text = await res.text()
  if (!res.ok) throw new Error(`REST ${path} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

let itineraryId: string
let orgId: string
let quoteId: string
/** Itinerary status before the test, so the conversion's side effect is undone. */
let originalItineraryStatus: string

test.beforeAll(async () => {
  const [itin] = await rest(
    `itineraries?itinerary_code=eq.${ITIN_CODE}&select=id,org_id,status,start_date,end_date`
  )
  expect(itin, `seeded itinerary ${ITIN_CODE} must exist — run npm run seed:e2e`).toBeTruthy()
  itineraryId = itin.id
  orgId = itin.org_id
  originalItineraryStatus = itin.status
  // The route refuses an itinerary without real dates; the seed provides them.
  expect(itin.start_date, 'seeded itinerary needs a start date').toBeTruthy()
  expect(itin.end_date, 'seeded itinerary needs an end date').toBeTruthy()

  // Clean any leftovers from an interrupted previous run.
  await rest(`bookings?quote_type=eq.b2c&itinerary_id=eq.${itineraryId}`, { method: 'DELETE' })
  await rest(`b2c_quotes?quote_number=eq.${QUOTE_NUMBER}`, { method: 'DELETE' })

  const [quote] = await rest('b2c_quotes', {
    method: 'POST',
    body: JSON.stringify({
      org_id: orgId,
      itinerary_id: itineraryId,
      quote_number: QUOTE_NUMBER,
      num_travelers: 3,
      total_cost: 4500,
      margin_percent: 25,
      selling_price: SELLING_PRICE,
      currency: 'EUR',
      status: 'accepted',
    }),
  })
  quoteId = quote.id
})

test.afterAll(async () => {
  if (!quoteId) return
  // Bookings first — booking_supplier_status cascades from them.
  await rest(`bookings?quote_id=eq.${quoteId}`, { method: 'DELETE' })
  await rest(`b2c_quotes?id=eq.${quoteId}`, { method: 'DELETE' })
  if (itineraryId && originalItineraryStatus) {
    await rest(`itineraries?id=eq.${itineraryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: originalItineraryStatus }),
    })
  }
})

test('rejects a deposit percentage that would misprice the deposit', async ({ request }) => {
  // Unvalidated these reach (total * pct) / 100: -50 yields a negative deposit,
  // 500 bills five times the trip. Both must fail BEFORE any row is written.
  for (const bad of [-50, 500, 100.01, 'abc']) {
    const res = await request.post('/api/bookings/from-quote', {
      data: { quote_id: quoteId, quote_type: 'b2c', deposit_percent: bad },
    })
    expect(res.status(), `deposit_percent ${bad} must be rejected`).toBe(400)
  }

  // And nothing was created by those attempts.
  const bookings = await rest(`bookings?quote_id=eq.${quoteId}&select=id`)
  expect(bookings).toHaveLength(0)
})

test('rejects an unknown quote type and a missing quote', async ({ request }) => {
  const badType = await request.post('/api/bookings/from-quote', {
    data: { quote_id: quoteId, quote_type: 'b2x' },
  })
  expect(badType.status()).toBe(400)

  const missing = await request.post('/api/bookings/from-quote', {
    data: { quote_id: '00000000-0000-0000-0000-000000000000', quote_type: 'b2c' },
  })
  expect(missing.status()).toBe(404)
})

test('converts an accepted quote, with the deposit computed from the percentage', async ({
  request,
}) => {
  const res = await request.post('/api/bookings/from-quote', {
    data: { quote_id: quoteId, quote_type: 'b2c', deposit_percent: 25 },
  })
  expect(res.status(), await res.text()).toBe(201)
  const body = await res.json()
  expect(body.success).toBe(true)

  const booking = body.data
  // 5822.05 × 25% = 1455.5125 → 1455.51
  expect(Number(booking.deposit_amount)).toBe(1455.51)
  expect(Number(booking.deposit_percent)).toBe(25)
  // The QUOTE's price, not the itinerary's (the seed itinerary total is 0).
  expect(Number(booking.total_cost)).toBe(SELLING_PRICE)
  // THE money invariant: nothing paid yet, so the whole total is outstanding.
  expect(Number(booking.balance_due)).toBe(SELLING_PRICE)
  expect(booking.deposit_paid).toBe(false)
  expect(booking.payment_status).toBe('pending')
  expect(booking.status).toBe('pending')
  // Traceable back to the quote it came from.
  expect(booking.quote_id).toBe(quoteId)
  expect(booking.quote_type).toBe('b2c')
  expect(booking.booking_code).toMatch(/^BKG-/)
  // A deposit needs a date to be paid by.
  expect(booking.payment_deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/)

  // Side effect: the trip is now operationally committed.
  const [itin] = await rest(`itineraries?id=eq.${itineraryId}&select=status`)
  expect(itin.status).toBe('confirmed')
})

test('a second conversion returns the SAME booking — never a second deposit', async ({
  request,
}) => {
  const [existing] = await rest(`bookings?quote_id=eq.${quoteId}&select=id,booking_code`)
  expect(existing, 'the previous test must have created a booking').toBeTruthy()

  const res = await request.post('/api/bookings/from-quote', {
    data: { quote_id: quoteId, quote_type: 'b2c', deposit_percent: 25 },
  })
  expect(res.status()).toBe(409)
  const body = await res.json()
  expect(body.booking_id).toBe(existing.id)
  expect(body.booking_code).toBe(existing.booking_code)

  // Still exactly one booking, so exactly one deposit.
  const all = await rest(`bookings?quote_id=eq.${quoteId}&select=id`)
  expect(all).toHaveLength(1)
})

test('refuses to book a quote that is not accepted', async ({ request }) => {
  // A fresh draft quote on the same itinerary: the status gate must fire.
  const [draft] = await rest('b2c_quotes', {
    method: 'POST',
    body: JSON.stringify({
      org_id: orgId,
      itinerary_id: itineraryId,
      quote_number: `${QUOTE_NUMBER}-DRAFT`,
      num_travelers: 2,
      total_cost: 1000,
      selling_price: 1200,
      currency: 'EUR',
      status: 'draft',
    }),
  })

  try {
    const res = await request.post('/api/bookings/from-quote', {
      data: { quote_id: draft.id, quote_type: 'b2c' },
    })
    expect(res.status()).toBe(422)
    expect((await res.json()).error).toContain('accepted')
  } finally {
    await rest(`b2c_quotes?id=eq.${draft.id}`, { method: 'DELETE' })
  }
})
