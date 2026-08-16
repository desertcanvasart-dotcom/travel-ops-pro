import { test, expect } from '@playwright/test'
import { STORAGE_STATE } from './helpers'

// ============================================
// Tier 2 — the BOOKING SPINE, end to end, in yen
// ============================================
// Phase 1 of the A.T.S rollout. Their whole process hangs off a confirmed trip
// with a named passenger manifest, a deposit, a balance and a document pack —
// and in production that path has never carried a real traveller: zero
// bookings, zero passengers, one invoice, no yen.
//
// quote-to-booking.authed.spec.ts already proves the conversion. This picks up
// where it stops and walks the rest:
//
//   booking → passenger manifest → deposit invoice → recorded payment
//           → balance invoice reconciled against the deposit
//
// Two deliberate choices:
//
//   * It runs in JPY. A.T.S sells in yen and nothing in this system ever has,
//     so the currency is part of what needs proving, not a separate question.
//     Yen is zero-decimal — a fractional yen anywhere is a real defect.
//   * The totals do NOT divide evenly by the deposit percentage, so rounding
//     has to show itself rather than hide behind round numbers.
//
// Everything is created in and removed from the seeded E2E org. No real
// operator booking, invoice or passenger is touched.

const HAVE_CREDS = !!process.env.E2E_EMAIL && !!process.env.E2E_PASSWORD
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: 'serial' })
test.skip(!HAVE_CREDS, 'E2E_EMAIL / E2E_PASSWORD not set')
test.skip(!SUPABASE_URL || !SERVICE_KEY, 'Supabase service credentials not set')

const ITIN_CODE = 'E2E-SMOKE-001'
const QUOTE_NUMBER = 'E2E-SPINE-JPY-001'

/** An A.T.S-shaped sale: 3 travellers on a fixed 8-day program, priced in yen. */
const PAX = 3
/** Deliberately not divisible by 20% — ¥1,854,367 × 20% = ¥370,873.4 */
const SELLING_PRICE_JPY = 1854367
const DEPOSIT_PERCENT = 20

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

let orgId: string
let itineraryId: string
let itineraryStart: string | null
let originalItineraryStatus: string
let quoteId: string
let bookingId: string
let depositInvoiceId: string
let finalInvoiceId: string

/** Travellers, shaped like their 海外旅行参加申込書 rather than a generic manifest. */
const MANIFEST = [
  {
    title: 'Mr',
    first_name: 'Sotoo',
    last_name: 'E2E-Nakajima',
    date_of_birth: '1968-04-11',
    gender: 'male',
    nationality: 'Japan',
    email: 'e2e-spine-lead@travelops.test',
    phone: '+81-90-0000-0001',
    emergency_contact_name: 'E2E-Nakajima Hanako',
    emergency_contact_phone: '+81-3-0000-0001',
    passport_number: 'TR9900001',
    passport_expiry: '2031-09-30',
    passport_issuing_country: 'Japan',
    visa_required: true,
    passenger_type: 'adult',
    is_lead_passenger: true,
    room_type: 'twin',
    meal_preference: 'none',
    special_requests: 'Ground-floor room if available',
  },
  {
    title: 'Mrs',
    first_name: 'Kiyoko',
    last_name: 'E2E-Nakajima',
    date_of_birth: '1971-11-02',
    gender: 'female',
    nationality: 'Japan',
    passport_number: 'TR9900002',
    passport_expiry: '2030-02-14',
    passport_issuing_country: 'Japan',
    visa_required: true,
    passenger_type: 'adult',
    is_lead_passenger: false,
    room_type: 'twin',
    medical_conditions: 'Shellfish allergy',
  },
  {
    title: 'Ms',
    first_name: 'Erika',
    last_name: 'E2E-Tomoyose',
    date_of_birth: '1995-07-19',
    gender: 'female',
    nationality: 'Japan',
    passport_number: 'TR9900003',
    passport_expiry: '2029-12-01',
    passport_issuing_country: 'Japan',
    visa_required: true,
    passenger_type: 'adult',
    is_lead_passenger: false,
    room_type: 'single',
  },
]

test.beforeAll(async () => {
  const [itin] = await rest(
    `itineraries?itinerary_code=eq.${ITIN_CODE}&select=id,org_id,status,start_date,end_date`
  )
  expect(itin, `seeded itinerary ${ITIN_CODE} must exist — run npm run seed:e2e`).toBeTruthy()
  itineraryId = itin.id
  orgId = itin.org_id
  itineraryStart = itin.start_date
  originalItineraryStatus = itin.status

  // Clear anything an interrupted run left behind.
  const stale = await rest(`b2c_quotes?quote_number=eq.${QUOTE_NUMBER}&select=id`)
  for (const q of stale ?? []) {
    const bookings = await rest(`bookings?quote_id=eq.${q.id}&select=id`)
    for (const b of bookings ?? []) {
      await rest(`booking_passengers?booking_id=eq.${b.id}`, { method: 'DELETE' })
    }
    await rest(`bookings?quote_id=eq.${q.id}`, { method: 'DELETE' })
    await rest(`b2c_quotes?id=eq.${q.id}`, { method: 'DELETE' })
  }

  const [quote] = await rest('b2c_quotes', {
    method: 'POST',
    body: JSON.stringify({
      org_id: orgId,
      itinerary_id: itineraryId,
      quote_number: QUOTE_NUMBER,
      num_travelers: PAX,
      total_cost: 1400000,
      margin_percent: 25,
      selling_price: SELLING_PRICE_JPY,
      currency: 'JPY',
      status: 'accepted',
    }),
  })
  quoteId = quote.id
})

test.afterAll(async () => {
  for (const invId of [finalInvoiceId, depositInvoiceId]) {
    if (!invId) continue
    await rest(`invoice_payments?invoice_id=eq.${invId}`, { method: 'DELETE' })
    await rest(`invoices?id=eq.${invId}`, { method: 'DELETE' })
  }
  if (bookingId) {
    await rest(`booking_passengers?booking_id=eq.${bookingId}`, { method: 'DELETE' })
    await rest(`bookings?id=eq.${bookingId}`, { method: 'DELETE' })
  }
  if (quoteId) await rest(`b2c_quotes?id=eq.${quoteId}`, { method: 'DELETE' })
  if (itineraryId && originalItineraryStatus) {
    await rest(`itineraries?id=eq.${itineraryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: originalItineraryStatus }),
    })
  }
})

// ---------------------------------------------------------------------------

test('1 — an accepted yen quote becomes a booking', async ({ request }) => {
  const res = await request.post('/api/bookings/from-quote', {
    data: { quote_id: quoteId, quote_type: 'b2c', deposit_percent: DEPOSIT_PERCENT },
  })
  expect(res.status(), await res.text()).toBe(201)

  const booking = (await res.json()).data
  bookingId = booking.id

  expect(Number(booking.total_cost)).toBe(SELLING_PRICE_JPY)
  expect(Number(booking.balance_due)).toBe(SELLING_PRICE_JPY)
  // The currency the customer is actually being charged in must survive.
  expect(booking.currency, 'the booking must stay in JPY').toBe('JPY')
})

test('1b — the booking carries a payment schedule', async () => {
  expect(bookingId, 'booking must exist from step 1').toBeTruthy()

  const [booking] = await rest(
    `bookings?id=eq.${bookingId}&select=deposit_amount,payment_deadline,balance_due_date,payment_schedule_overridden,payment_schedule_note,balance_due,total_cost`
  )

  // The operator's terms: 20% within three days, balance sixty days before
  // departure. Asserted against the SEEDED dates rather than fixed ones, so
  // this keeps meaning as the fixture ages.
  expect(booking.payment_deadline, 'a deposit needs a date to pay it by').toMatch(
    /^\d{4}-\d{2}-\d{2}$/
  )
  expect(booking.payment_schedule_overridden).toBe(false)

  const departsIn = itineraryStart
    ? Math.round(
        (Date.parse(`${itineraryStart}T00:00:00Z`) - Date.parse(`${booking.payment_deadline}T00:00:00Z`)) /
          86_400_000
      )
    : null

  if (departsIn !== null && departsIn <= 60) {
    // The seeded trip departs in the past, so this is the LATE-BOOKING path:
    // splitting would date the balance before the deposit, so the whole amount
    // is asked for at once and the reason is recorded rather than left to be
    // worked out.
    expect(Number(booking.deposit_amount)).toBe(SELLING_PRICE_JPY)
    expect(booking.balance_due_date).toBeNull()
    expect(booking.payment_schedule_note).toMatch(/inside 60 days/)
  } else {
    expect(Number(booking.deposit_amount)).toBe(Math.round((SELLING_PRICE_JPY * DEPOSIT_PERCENT) / 100))
    expect(booking.balance_due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  }

  // Whatever the schedule, the OUTSTANDING money is still the whole total —
  // nothing has been paid yet. balance_due and balance_due_date read alike and
  // answer different questions.
  expect(Number(booking.balance_due)).toBe(SELLING_PRICE_JPY)
})

test('2 — the passenger manifest accepts a full traveller record', async ({ request }) => {
  expect(bookingId, 'booking must exist from step 1').toBeTruthy()

  for (const pax of MANIFEST) {
    const res = await request.post(`/api/bookings/${bookingId}/passengers`, { data: pax })
    expect(res.status(), `${pax.first_name}: ${await res.text()}`).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    // Passport data is the reason this table exists for A.T.S — Egypt entry
    // needs it, and it is what the Cairo operations sheet is built from.
    expect(body.data.passport_number).toBe(pax.passport_number)
    expect(body.data.passport_expiry).toBe(pax.passport_expiry)
    expect(body.data.nationality).toBe('Japan')
  }
})

test('3 — the manifest reads back with the lead traveller first', async ({ request }) => {
  const res = await request.get(`/api/bookings/${bookingId}/passengers`)
  expect(res.status(), await res.text()).toBe(200)

  const list = (await res.json()).data
  expect(list).toHaveLength(PAX)
  expect(list[0].is_lead_passenger, 'lead passenger must float to the top').toBe(true)
  expect(list[0].last_name).toBe('E2E-Nakajima')

  // full_name is a generated column; if the expression is wrong it fails here
  // rather than silently on a printed document.
  expect(list[0].full_name).toBe('Mr Sotoo E2E-Nakajima')

  // Rooming drives the hotel block on the Cairo sheet.
  const rooms = list.map((p: any) => p.room_type).sort()
  expect(rooms).toEqual(['single', 'twin', 'twin'])
})

test('4 — a deposit invoice bills the right share, in whole yen', async ({ request }) => {
  const res = await request.post('/api/invoices', {
    data: {
      client_name: 'E2E-Nakajima Sotoo',
      client_email: 'e2e-spine-lead@travelops.test',
      itinerary_id: itineraryId,
      invoice_type: 'deposit',
      deposit_percent: DEPOSIT_PERCENT,
      full_trip_cost: SELLING_PRICE_JPY,
      total_amount: SELLING_PRICE_JPY,
      currency: 'JPY',
      line_items: [{ description: 'NEK803-ABCR — 8-day Nile cruise program', amount: SELLING_PRICE_JPY }],
    },
  })
  expect(res.status(), await res.text()).toBe(201)

  const inv = await res.json()
  depositInvoiceId = inv.id

  expect(inv.invoice_number).toMatch(/-DEP$/)
  expect(inv.currency).toBe('JPY')

  // ¥1,854,367 × 20% = ¥370,873.4, which must be billed as ¥370,873.
  // Yen has no minor unit — a fractional yen is not an amount of money.
  const raw = (SELLING_PRICE_JPY * DEPOSIT_PERCENT) / 100
  expect(Number(inv.total_amount)).toBe(Math.round(raw))
  expect(
    Number.isInteger(Number(inv.total_amount)),
    `deposit ¥${inv.total_amount} must be a whole yen amount`
  ).toBe(true)
})

test('5 — a bank transfer against the deposit updates the invoice', async ({ request }) => {
  expect(depositInvoiceId, 'deposit invoice must exist from step 4').toBeTruthy()

  const [before] = await rest(`invoices?id=eq.${depositInvoiceId}&select=total_amount,balance_due`)
  const depositAmount = Number(before.total_amount)

  // A.T.S is paid by bank transfer; nothing reflects automatically, so this is
  // the manual record their whole process depends on.
  const res = await request.post(`/api/invoices/${depositInvoiceId}/payments`, {
    data: {
      amount: depositAmount,
      currency: 'JPY',
      payment_method: 'bank_transfer',
      payment_date: '2026-08-16',
      transaction_reference: 'E2E-MUFG-0788648',
      notes: 'E2E spine test — deposit',
    },
  })
  expect(res.status(), await res.text()).toBe(201)

  // The route relies on a DB trigger to roll the payment up onto the invoice.
  // If that trigger does not exist, the invoice looks unpaid forever.
  const [after] = await rest(
    `invoices?id=eq.${depositInvoiceId}&select=amount_paid,balance_due,status`
  )
  expect(Number(after.amount_paid), 'trigger must roll the payment onto the invoice').toBe(
    depositAmount
  )
  expect(Number(after.balance_due)).toBe(0)
})

test('6 — the balance invoice reconciles against the deposit actually charged', async ({
  request,
}) => {
  const [deposit] = await rest(`invoices?id=eq.${depositInvoiceId}&select=total_amount`)
  const depositAmount = Number(deposit.total_amount)

  const res = await request.post('/api/invoices', {
    data: {
      client_name: 'E2E-Nakajima Sotoo',
      client_email: 'e2e-spine-lead@travelops.test',
      itinerary_id: itineraryId,
      invoice_type: 'final',
      parent_invoice_id: depositInvoiceId,
      deposit_percent: DEPOSIT_PERCENT,
      full_trip_cost: SELLING_PRICE_JPY,
      total_amount: SELLING_PRICE_JPY,
      currency: 'JPY',
      line_items: [{ description: 'NEK803-ABCR — balance', amount: SELLING_PRICE_JPY }],
    },
  })
  expect(res.status(), await res.text()).toBe(201)

  const inv = await res.json()
  finalInvoiceId = inv.id

  expect(inv.invoice_number).toMatch(/-FIN$/)
  expect(inv.currency).toBe('JPY')

  // THE money invariant: deposit + balance is exactly what was quoted. If these
  // drift, a customer is over- or under-charged by the rounding delta.
  expect(Number(inv.total_amount) + depositAmount).toBe(SELLING_PRICE_JPY)
})
