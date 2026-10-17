// The bookings routes' guards (in-memory Supabase mock).
//
//   - POST /api/bookings booked a draft or a ¥0 trip (a ¥0 deposit in front of
//     the client) and copied whatever partner the trip pointed at — another
//     company's included — onto the booking.
//   - PUT /api/bookings/[id] took payment_status, deposit_paid, deposit_amount
//     and balance_due from the browser: any agent could mark a booking Paid
//     with nothing paid.
//   - DELETE /api/bookings/[id] took the recorded customer payments with it.
//   - Approving a party-size change twice added the travellers twice and
//     raised the price twice.
//   - Booking codes: numbered per company by the database; a taken code
//     draws another instead of a 500 (or, on Confirm, no booking at all).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setMockTables, createMockClient } from '../_mock-supabase'

// staleRead: the next read of a change request answers "pending" whatever is
// stored — the moment where a second click has read the request and the first
// click's approval has just landed.
const hooks = vi.hoisted(() => ({ staleRead: false }))
vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return {
    createClient: () => {
      const base = mock.createMockClient()
      return {
        ...base,
        from: (t: string) => {
          const b = base.from(t) as any
          if (t === 'booking_change_requests' && hooks.staleRead) {
            const read = b.maybeSingle
            b.maybeSingle = async () => {
              hooks.staleRead = false
              const r = await read()
              return { data: r.data ? { ...r.data, status: 'pending' } : null, error: null }
            }
          }
          return b
        },
        storage: { from: () => ({ remove: async () => ({ error: null }) }) },
      }
    },
  }
})
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: vi.fn(async () => 'org-1'),
  getCurrentUserId: vi.fn(async () => 'user-1'),
  noOrgResponse: () => new Response(JSON.stringify({ success: false }), { status: 403 }),
}))

import { POST, bookingsPageSize, tripNotBookable } from '@/app/api/bookings/route'
import { PUT as PUT_BOOKING, DELETE as DELETE_BOOKING } from '@/app/api/bookings/[id]/route'
import { POST as RESOLVE_REQUEST } from '@/app/api/bookings/[id]/change-requests/[cid]/route'
import { insertBookingWithCode, isBookingCodeClash } from '@/lib/bookings/booking-code'

const TRIP = {
  id: 'itin-1', org_id: 'org-1', itinerary_code: 'ITN-1', client_name: 'A', trip_name: 'Nile', start_date: '2026-12-05',
  end_date: '2026-12-12', total_days: 8, num_adults: 2, num_children: 0, total_cost: 400000, currency: 'JPY', status: 'confirmed',
  b2b_partners: null as unknown,
}
const BOOKING = {
  id: 'bk-1', org_id: 'org-1', itinerary_id: 'itin-1', booking_code: 'BKG-2026-0001', status: 'pending', payment_status: 'pending',
  total_cost: 1000, deposit_amount: 200, balance_due: 1000, deposit_paid: false, num_adults: 2, num_children: 0, currency: 'JPY', deposit_percent: 20,
}

const rows = async (t: string) => ((await (createMockClient().from(t) as any).select('*')).data as any[])
function tables(extra: Record<string, unknown[]> = {}) {
  setMockTables({
    itineraries: [structuredClone(TRIP)],
    organizations: [{ id: 'org-1' }],
    bookings: [], booking_payments: [], booking_passengers: [], booking_change_requests: [], booking_passenger_documents: [],
    itinerary_days: [], itinerary_services: [], booking_supplier_status: [],
    ...extra,
  } as never)
}
beforeEach(() => tables())

const post = async (body: unknown) => {
  const res = await POST({ json: async () => body } as any)
  return { status: res.status, json: await res.json() }
}

describe('POST /api/bookings', () => {
  it.each([
    ['a draft', { status: 'draft' }],
    ['a cancelled trip', { status: 'cancelled' }],
    ['a trip with no price', { total_cost: 0 }],
  ])('refuses %s with 422 and books nothing', async (_l, over) => {
    tables({ itineraries: [{ ...TRIP, ...over }] })
    const { status, json } = await post({ itinerary_id: 'itin-1' })
    expect(status).toBe(422)
    expect(json.code).toBe('not_bookable')
    expect(await rows('bookings')).toHaveLength(0)
  })

  it("never copies another company's partner name onto the booking", async () => {
    tables({ itineraries: [{ ...TRIP, b2b_partners: { id: 'p', company_name: 'Their Partner', partner_code: 'X', org_id: 'org-2' } }] })
    expect((await post({ itinerary_id: 'itin-1' })).status).toBe(201)
    const [b] = await rows('bookings')
    expect(JSON.stringify(b)).not.toContain('Their Partner')
  })

  it('the trip helper agrees', () => {
    expect(tripNotBookable({ status: 'sent', total_cost: 1, currency: 'JPY' })).toBeNull()
    expect(tripNotBookable({ status: 'confirmed', total_cost: 1, currency: null })).not.toBeNull()
  })
})

describe('PUT /api/bookings/[id] cannot write money', () => {
  it('payment status, deposit paid, deposit and balance are ignored; notes are written', async () => {
    tables({ bookings: [structuredClone(BOOKING)] })
    const res = await PUT_BOOKING({ json: async () => ({
      payment_status: 'paid', balance_due: 0, deposit_paid: true, deposit_paid_date: '2026-10-01', deposit_amount: 0, operational_notes: 'gate 3',
    }) } as any, { params: Promise.resolve({ id: 'bk-1' }) })
    expect(res.status).toBe(200)
    const [b] = await rows('bookings')
    expect(b).toMatchObject({ payment_status: 'pending', balance_due: 1000, deposit_paid: false, deposit_amount: 200, operational_notes: 'gate 3' })
    expect(b.deposit_paid_date).toBeUndefined()
  })

  it("another company's vehicle → 404", async () => {
    tables({ bookings: [structuredClone(BOOKING)], vehicles: [{ id: 'v-other', org_id: 'org-2' }] })
    const res = await PUT_BOOKING({ json: async () => ({ assigned_vehicle_id: 'v-other' }) } as any, { params: Promise.resolve({ id: 'bk-1' }) })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/bookings/[id] keeps recorded money', () => {
  const del = () => DELETE_BOOKING({} as any, { params: Promise.resolve({ id: 'bk-1' }) })

  it('a booking with a recorded payment → 409, booking and payment remain', async () => {
    tables({ bookings: [structuredClone(BOOKING)], booking_payments: [{ id: 'p1', booking_id: 'bk-1', amount: 200 }] })
    const res = await del()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Cancel it instead/)
    expect(await rows('bookings')).toHaveLength(1)
    expect(await rows('booking_payments')).toHaveLength(1)
  })

  it('a booking marked deposit-paid → 409', async () => {
    tables({ bookings: [{ ...BOOKING, deposit_paid: true }] })
    expect((await del()).status).toBe(409)
  })

  it('a booking with no money recorded can still be deleted', async () => {
    tables({ bookings: [structuredClone(BOOKING)] })
    expect((await del()).status).toBe(200)
    expect(await rows('bookings')).toHaveLength(0)
  })
})

describe('approving a party-size change is claimed once', () => {
  it('a second approval is refused; travellers are added once and the price raised once', async () => {
    tables({
      bookings: [structuredClone(BOOKING)],
      booking_change_requests: [{ id: 'cr-1', booking_id: 'bk-1', org_id: 'org-1', requested_count: 1, status: 'pending' }],
    })
    const approve = () => RESOLVE_REQUEST({ json: async () => ({ action: 'approve' }) } as any, { params: Promise.resolve({ id: 'bk-1', cid: 'cr-1' }) })
    expect((await approve()).status).toBe(200)
    // The second click read the request while it was still pending; the
    // approval it then attempts finds it resolved (the conditional claim).
    hooks.staleRead = true
    const second = await approve()
    expect(second.status).toBe(409)
    expect(await rows('booking_passengers')).toHaveLength(1)
    const [b] = await rows('bookings')
    expect(b.num_adults).toBe(3)
    expect(b.total_cost).toBe(1500)
    expect((await rows('booking_change_requests'))[0].status).toBe('approved')
  })
})

describe('booking codes', () => {
  it('a clash on the code draws another; the per-company function is asked by org', async () => {
    const asked: Array<Record<string, unknown> | undefined> = []
    let inserts = 0
    const fake = {
      rpc: async (_fn: string, args?: Record<string, unknown>) => {
        asked.push(args)
        return { data: `BKG-2026-000${asked.length}`, error: null }
      },
      from: () => ({
        insert: (row: { booking_code: string }) => ({
          select: () => ({
            single: async () => (++inserts === 1
              ? { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "bookings_org_booking_code_key"' } }
              : { data: { id: 'b', booking_code: row.booking_code }, error: null }),
          }),
        }),
      }),
    }
    const out = await insertBookingWithCode(fake, 'org-9', code => ({ booking_code: code }))
    expect(out.error).toBeNull()
    expect(out.bookingCode).toBe('BKG-2026-0002')
    expect(asked).toEqual([{ p_org_id: 'org-9' }, { p_org_id: 'org-9' }])
  })

  it('one booking per quote is not a code clash (from-quote handles it)', () => {
    expect(isBookingCodeClash({ code: '23505', message: 'duplicate key value violates unique constraint "uq_bookings_one_per_quote"' })).toBe(false)
  })

  it('no route draws a code from the shared MAX()+1 or the clock any more', () => {
    for (const f of ['app/api/bookings/route.ts', 'app/api/bookings/from-quote/route.ts', 'app/api/itineraries/[id]/route.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).not.toContain("rpc('generate_booking_code')")
      expect(src, f).not.toContain('Date.now().toString().slice(-4)')
      expect(src, f).toContain('insertBookingWithCode')
    }
  })
})

describe('the bookings list', () => {
  it('pages of at most 200, newest first', () => {
    expect(bookingsPageSize(null)).toBe(20)
    expect(bookingsPageSize('5000')).toBe(200)
    expect(bookingsPageSize('0')).toBe(1)
    const src = readFileSync(join(process.cwd(), 'app/api/bookings/route.ts'), 'utf8')
    expect(src).toContain(".order('created_at', { ascending: false })")
    const page = readFileSync(join(process.cwd(), 'app/bookings/page.tsx'), 'utf8')
    expect(page).toContain("params.append('search', search)")
    expect(page).not.toMatch(/booking\.trip_name\.toLowerCase/)
  })
})
