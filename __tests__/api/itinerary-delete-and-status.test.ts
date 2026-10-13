// PUT / DELETE /api/itineraries/[id] (the in-memory Supabase mock).
//
//   - Deleting a trip refused only invoices; everything else cascaded with
//     it — a confirmed, booked and paid trip's booking and money went with one
//     double-click on the list's bin. Now a trip with a booking, payments,
//     invoices or sent supplier documents is refused with the reason, and a
//     deletable trip goes as ONE delete of the parent, its stored PDFs first.
//   - Setting a ¥0 draft to Confirmed from the list made a ¥0 booking with a
//     ¥0 deposit: confirming now runs the booking's price gate (422).
//   - Any string was stored as a status; any vehicle id as the vehicle.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

const storage = vi.hoisted(() => ({
  objects: [] as string[],
  removed: [] as string[],
}))

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return {
    createClient: () => ({
      ...mock.createMockClient(),
      storage: {
        from: () => ({
          list: async (folder: string, opts: { search?: string }) => ({
            data: storage.objects
              .filter(o => o.startsWith(`${folder}/`) && o.slice(folder.length + 1).includes(opts.search ?? ''))
              .map(o => ({ name: o.slice(folder.length + 1) })),
            error: null,
          }),
          remove: async (paths: string[]) => {
            storage.removed.push(...paths)
            storage.objects = storage.objects.filter(o => !paths.includes(o))
            return { error: null }
          },
        }),
      },
    }),
  }
})
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: vi.fn(async () => 'org-1'),
  getCurrentUserId: vi.fn(async () => 'user-1'),
  noOrgResponse: () => new Response(JSON.stringify({ success: false }), { status: 403 }),
}))

import { DELETE, PUT, bookingPriceRefusal } from '@/app/api/itineraries/[id]/route'

const TRIP = { id: 'itin-1', org_id: 'org-1', itinerary_code: 'ITN-2026-1111', trip_name: 'Cairo', status: 'sent', total_cost: 500000, currency: 'JPY',
  client_name: 'A', start_date: '2026-12-01', end_date: '2026-12-05', num_adults: 2, num_children: 0 }

function tables(extra: Record<string, unknown[]> = {}) {
  setMockTables({
    itineraries: [structuredClone(TRIP)],
    itinerary_days: [{ id: 'd1', itinerary_id: 'itin-1' }],
    itinerary_services: [{ id: 's1', itinerary_day_id: 'd1' }],
    bookings: [], booking_payments: [], payments: [], invoices: [], supplier_documents: [], vehicles: [],
    organizations: [{ id: 'org-1' }], booking_supplier_status: [],
    ...extra,
  } as never)
}
const rows = async (t: string) => ((await (createMockClient().from(t) as any).select('*')).data as any[])
const del = async () => {
  const res = await DELETE({} as any, { params: Promise.resolve({ id: 'itin-1' }) })
  return { status: res.status, json: await res.json() }
}
const put = async (body: Record<string, unknown>) => {
  const res = await PUT({ json: async () => body } as any, { params: Promise.resolve({ id: 'itin-1' }) })
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  storage.objects = []
  storage.removed = []
  tables()
})

describe('DELETE refuses a trip that has been sold or paid', () => {
  it('a trip with a booking and a recorded payment → 409 with the reasons; nothing is deleted', async () => {
    tables({
      bookings: [{ id: 'b1', itinerary_id: 'itin-1', org_id: 'org-1', booking_code: 'BKG-2026-0007' }],
      booking_payments: [{ id: 'p1', booking_id: 'b1', amount: 100000 }],
    })
    const { status, json } = await del()
    expect(status).toBe(409)
    expect(json.error).toContain('BKG-2026-0007')
    expect(json.error).toMatch(/payment/)
    expect(json.error).toMatch(/Cancel the trip instead/)
    expect(await rows('itineraries')).toHaveLength(1)
    expect(await rows('bookings')).toHaveLength(1)
    expect(await rows('booking_payments')).toHaveLength(1)
  })

  it.each([
    ['a customer payment on the trip', { payments: [{ id: 'pay', itinerary_id: 'itin-1', org_id: 'org-1' }] }],
    ['an invoice', { invoices: [{ id: 'inv', itinerary_id: 'itin-1', org_id: 'org-1' }] }],
    ['a sent supplier voucher', { supplier_documents: [{ id: 'sd', itinerary_id: 'itin-1', org_id: 'org-1', status: 'sent', document_number: 'V-1' }] }],
  ])('%s → 409', async (_label, extra) => {
    tables(extra)
    expect((await del()).status).toBe(409)
    expect(await rows('itineraries')).toHaveLength(1)
  })

  it('a confirmed trip → 409 (cancel it instead)', async () => {
    tables({ itineraries: [{ ...TRIP, status: 'confirmed' }] })
    expect((await del()).status).toBe(409)
  })
})

describe('DELETE of a trip nobody has acted on', () => {
  it('deletes the parent only (children go by cascade) and removes its stored PDFs first', async () => {
    tables({ supplier_documents: [{ id: 'sd', itinerary_id: 'itin-1', org_id: 'org-1', status: 'draft', document_number: 'V-9' }] })
    storage.objects = ['contracts/contract-itin-1-1700.pdf', 'contracts/contract-itin-2-1700.pdf', 'supplier-documents/V-9-1700.pdf']
    const { status } = await del()
    expect(status).toBe(200)
    expect(await rows('itineraries')).toHaveLength(0)
    expect(storage.removed.sort()).toEqual(['contracts/contract-itin-1-1700.pdf', 'supplier-documents/V-9-1700.pdf'])
    // The route no longer deletes days and services one table at a time.
    expect(await rows('itinerary_days')).toHaveLength(1)
  })
})

describe('PUT status', () => {
  it('an unknown status is refused', async () => {
    const { status } = await put({ status: 'shipped' })
    expect(status).toBe(400)
    expect((await rows('itineraries'))[0].status).toBe('sent')
  })

  it('confirming an unpriced trip → 422, still not confirmed, no booking', async () => {
    tables({ itineraries: [{ ...TRIP, status: 'draft', total_cost: 0 }] })
    const { status, json } = await put({ status: 'confirmed' })
    expect(status).toBe(422)
    expect(json.code).toBe('unpriced')
    expect((await rows('itineraries'))[0].status).toBe('draft')
    expect(await rows('bookings')).toHaveLength(0)
  })

  it('confirming a priced trip still books it', async () => {
    const { status, json } = await put({ status: 'confirmed' })
    expect(status).toBe(200)
    expect(json.booking_error).toBeUndefined()
    expect(await rows('bookings')).toHaveLength(1)
  })

  it('the price gate', () => {
    expect(bookingPriceRefusal({ total_cost: 0, currency: 'JPY' })).not.toBeNull()
    expect(bookingPriceRefusal({ total_cost: null, currency: 'JPY' })).not.toBeNull()
    expect(bookingPriceRefusal({ total_cost: 1000, currency: null })).not.toBeNull()
    expect(bookingPriceRefusal({ total_cost: 1000, currency: 'JPY' })).toBeNull()
  })
})

describe('PUT vehicle', () => {
  it("another company's vehicle → 404; the company's own is stored", async () => {
    tables({ vehicles: [{ id: 'v-own', org_id: 'org-1' }, { id: 'v-other', org_id: 'org-2' }] })
    expect((await put({ assigned_vehicle_id: 'v-other' })).status).toBe(404)
    expect((await put({ assigned_vehicle_id: 'v-own' })).status).toBe(200)
    expect((await rows('itineraries'))[0].assigned_vehicle_id).toBe('v-own')
  })
})
