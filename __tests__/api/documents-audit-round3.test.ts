// Audit of 2026-10-09, round 3:
//   - the guide's WhatsApp read any org's trip, gave the whole trip's dates
//     in M/D/YYYY and the install's name;
//   - the booking confirmation gave the deposit deadline as the balance's;
//   - the lead could rewrite a friend's passport name after the lock.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  rows: {} as Record<string, Row | null>,
  filters: [] as Array<{ table: string; col: string; val: unknown }>,
  updates: [] as Array<{ table: string; values: Row }>,
}))
function fakeClient() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'neq', 'order', 'limit', 'in']) chain[m] = () => chain
      chain.eq = (col: string, val: unknown) => { db.filters.push({ table, col, val }); return chain }
      chain.update = (values: Row) => { db.updates.push({ table, values }); return chain }
      chain.maybeSingle = async () => ({ data: db.rows[table] ?? null, error: null })
      chain.single = async () => ({ data: db.rows[table] ?? null, error: db.rows[table] ? null : { message: 'none' } })
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })
      return chain
    },
  }
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient() }))
vi.mock('@/lib/supabase/service-client', () => ({ createServiceClient: () => fakeClient() }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1', getCurrentUserId: async () => 'u1',
  noOrgResponse: () => new Response(null, { status: 403 }), requireRole: async () => null,
}))
vi.mock('@/lib/org-identity', () => ({ orgIdentity: async () => ({ name: 'Nile Office' }) }))
const sent = vi.hoisted(() => [] as Array<{ to: string; body: string }>)
vi.mock('@/lib/twilio-whatsapp', () => ({ sendWhatsAppMessage: async (m: { to: string; body: string }) => { sent.push(m); return { success: true, messageId: 'm1' } } }))
vi.mock('@/lib/email-send', () => ({ sendEmailInternal: async () => ({ success: true }) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ success: true }), getClientIdentifier: () => 'x', rateLimitResponse: () => new Response(null, { status: 429 }) }))
vi.mock('@/lib/lead-coordinator', () => ({ leadCoordinatorContext: async () => ({ bookingId: 'b1', orgId: 'org-1', startDate: '2026-11-01' }) }))
vi.mock('@/lib/portal-links', () => ({ mintOrReusePassengerLink: async () => ({ token: 't' }), markSentAndDeliver: async () => ({ sent: false }) }))

beforeEach(() => { db.rows = {}; db.filters.length = 0; db.updates.length = 0; sent.length = 0 })
const post = (body: unknown) => ({ json: async () => body, cookies: { get: () => undefined } }) as never

describe('the guide’s WhatsApp assignment', () => {
  it('reads the trip within the caller’s org, gives the guide’s own day, and signs as the org', async () => {
    db.rows.itineraries = { id: 'it1', trip_name: null, start_date: '2026-10-09', end_date: '2026-10-15', num_adults: 2 }
    db.rows.suppliers = { id: 'g1', name: 'Mona', contact_phone: '+20100' }
    db.rows.itinerary_resources = { itinerary_day_id: null, start_date: '2026-10-12', end_date: '2026-10-12' }
    const { POST } = await import('@/app/api/whatsapp/notify-guide/route')
    const res = await POST(post({ itineraryId: 'it1', guideId: 'g1' }))
    expect(res.status).toBe(200)
    expect(db.filters).toContainEqual({ table: 'itineraries', col: 'org_id', val: 'org-1' })
    const body = sent[0].body
    expect(body).toContain('Mon, 12 October 2026')
    expect(body).not.toContain('2026-10-09')
    expect(body).not.toMatch(/10\/(9|12)\/2026/)
    expect(body).toContain('Nile Office')
    expect(body).not.toContain('Egypt Tour')
  })
})

describe('the booking confirmation', () => {
  const booking = {
    id: 'b1', booking_code: 'BK-1', client_name: 'Ada', client_phone: '+81', trip_name: 'Nile', start_date: '2026-11-01', end_date: '2026-11-08',
    num_adults: 2, currency: 'JPY', total_cost: 500000, balance_due: 500000, deposit_amount: 100000,
    payment_deadline: '2026-10-15', balance_due_date: '2026-10-25',
  }
  const send = async (b: Row) => {
    db.rows.bookings = b
    const { POST } = await import('@/app/api/bookings/[id]/send-confirmation/route')
    await POST(post({ send_via: 'whatsapp' }) as never, { params: Promise.resolve({ id: 'b1' }) } as never)
    return sent[0].body
  }
  it('while the deposit is unpaid: the deposit by its date, then the balance by its own', async () => {
    const body = await send({ ...booking, deposit_paid: false })
    expect(body).toMatch(/Deposit Due: .*100,000 by /)
    expect(body).toMatch(/Balance Due By: .*25/)
    expect(body).not.toContain('Payment Due:')
  })
  it('once the deposit is paid: the balance by balance_due_date, never the deposit’s date', async () => {
    const body = await send({ ...booking, deposit_paid: true, balance_due: 400000 })
    expect(body).toMatch(/Balance Due By: .*25/)
    expect(body).not.toMatch(/15 Oct|Oct 15|15\/10/)
  })
})

describe('the lead pre-filling a friend’s details', () => {
  const seed = async () => {
    const { POST } = await import('@/app/api/portal/[token]/coordinator/route')
    return POST(post({ action: 'seed', passenger_id: 'p2', fields: { last_name: 'Changed' } }) as never, { params: Promise.resolve({ token: 't'.repeat(32) }) } as never)
  }
  it('is refused once the details are locked', async () => {
    db.rows.booking_passengers = { id: 'p2', details_submitted_at: null }
    db.rows.booking_portal_links = { details_locked_at: '2026-10-01T00:00:00Z' }
    expect((await seed()).status).toBe(409)
    expect(db.updates).toEqual([])
  })
  it('is refused over what the traveller sent themselves', async () => {
    db.rows.booking_passengers = { id: 'p2', details_submitted_at: '2026-09-30T00:00:00Z' }
    expect((await seed()).status).toBe(409)
    expect(db.updates).toEqual([])
  })
  it('still works before the lock, for a traveller who has not answered', async () => {
    db.rows.booking_passengers = { id: 'p2', details_submitted_at: null }
    expect((await seed()).status).toBe(200)
    expect(db.updates[0].values).toMatchObject({ last_name: 'Changed' })
  })
})
