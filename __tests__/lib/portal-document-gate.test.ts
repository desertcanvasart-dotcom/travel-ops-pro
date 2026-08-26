import { describe, it, expect } from 'vitest'
import {
  travellerWriteContext,
  PORTAL_NOT_FOUND,
  PORTAL_UNVERIFIED,
  PORTAL_LOCKED,
} from '@/lib/portal/traveller-gate'
import { portalVerifyCookieValue } from '@/lib/booking-portal'

// The portal is the only surface here that takes input from someone with no
// session, and document upload lets that someone put a FILE in our bucket.
// This is the sequence that decides whether they may, so it is pinned
// directly rather than only through a route.

const TOKEN = 'a'.repeat(32)   // isValidPortalToken: exactly 32 url-safe chars
const OTHER_TOKEN = 'b'.repeat(32)
const BOOKING = 'booking-1'
const P1 = 'pax-1'
const P2 = 'pax-2'

const goodCookie = () => portalVerifyCookieValue(TOKEN)

/** Minimal stand-in for the query chain the gate uses. */
function db(tables: {
  link?: Record<string, unknown> | null
  passengers?: Array<Record<string, unknown>>
  booking?: Record<string, unknown> | null
}) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      const chain: any = {  // eslint-disable-line @typescript-eslint/no-explicit-any
        select: () => chain,
        eq: (col: string, val: unknown) => { filters[col] = val; return chain },
        maybeSingle: async () => {
          if (table === 'booking_portal_links') return { data: tables.link ?? null }
          if (table === 'booking_passengers') {
            const found = (tables.passengers ?? []).find(
              p => p.id === filters.id && p.booking_id === filters.booking_id
            )
            return { data: found ?? null }
          }
          if (table === 'bookings') return { data: tables.booking ?? null }
          return { data: null }
        },
      }
      return chain
    },
  }
}

const liveLink = (over: Record<string, unknown> = {}) => ({
  id: 'link-1', booking_id: BOOKING, org_id: 'org-1',
  passenger_id: null, revoked_at: null, expires_at: null, details_locked_at: null,
  ...over,
})

const world = (over: Record<string, unknown> = {}) => db({
  link: liveLink(over),
  passengers: [
    { id: P1, booking_id: BOOKING, first_name: 'A', last_name: 'One', is_lead_passenger: true },
    { id: P2, booking_id: BOOKING, first_name: 'B', last_name: 'Two', is_lead_passenger: false },
  ],
  booking: { id: BOOKING, org_id: 'org-1', end_date: '2026-05-20' },
})

const call = (dbi: ReturnType<typeof db>, over: Record<string, unknown> = {}) =>
  travellerWriteContext(dbi, {
    token: TOKEN, passengerId: P1, cookieValue: goodCookie(), ...over,
  })

describe('travellerWriteContext', () => {
  it('admits a verified booking-level link to a traveller on that booking', async () => {
    const out = await call(world())
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.passenger.id).toBe(P1)
      expect(out.booking.end_date).toBe('2026-05-20')
    }
  })

  it('refuses a malformed token before any query runs', async () => {
    // The db here would throw if touched.
    const exploding = { from() { throw new Error('must not query') } }
    expect(await travellerWriteContext(exploding, {
      token: 'short', passengerId: P1, cookieValue: goodCookie(),
    })).toEqual(PORTAL_NOT_FOUND)
  })

  it('refuses without the confirmation cookie — a forwarded URL is not enough', async () => {
    expect(await call(world(), { cookieValue: undefined })).toEqual(PORTAL_UNVERIFIED)
    expect(await call(world(), { cookieValue: 'not-the-hmac' })).toEqual(PORTAL_UNVERIFIED)
  })

  it('refuses a cookie minted for a different link', async () => {
    expect(await call(world(), { cookieValue: portalVerifyCookieValue(OTHER_TOKEN) }))
      .toEqual(PORTAL_UNVERIFIED)
  })

  it('refuses a revoked or expired link', async () => {
    expect(await call(world({ revoked_at: '2026-01-01T00:00:00Z' }))).toEqual(PORTAL_NOT_FOUND)
    expect(await call(world({ expires_at: '2020-01-01T00:00:00Z' }))).toEqual(PORTAL_NOT_FOUND)
  })

  it('refuses a token that resolves to no link', async () => {
    expect(await call(db({ link: null }))).toEqual(PORTAL_NOT_FOUND)
  })

  it('keeps one friend away from another friend\'s documents', async () => {
    // The whole point of per-traveller links: P1's token may not touch P2.
    const p1Link = world({ passenger_id: P1 })
    expect(await call(p1Link, { passengerId: P2 })).toEqual(PORTAL_NOT_FOUND)
    expect((await call(p1Link, { passengerId: P1 })).ok).toBe(true)
  })

  it('answers 404, not 403, for another traveller — the URL space stays unprobeable', async () => {
    const out = await call(world({ passenger_id: P1 }), { passengerId: P2 })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.status).toBe(404)
  })

  it('refuses a traveller who is not on this booking', async () => {
    const foreign = db({
      link: liveLink(),
      passengers: [{ id: P1, booking_id: 'another-booking', is_lead_passenger: true }],
      booking: { id: BOOKING, org_id: 'org-1', end_date: null },
    })
    expect(await call(foreign)).toEqual(PORTAL_NOT_FOUND)
  })

  it('refuses writes once the manifest is locked', async () => {
    expect(await call(world({ details_locked_at: '2026-04-01T00:00:00Z' }))).toEqual(PORTAL_LOCKED)
  })

  it('still allows reads when locked — they can see what they sent', async () => {
    const out = await call(world({ details_locked_at: '2026-04-01T00:00:00Z' }), {
      requireUnlocked: false,
    })
    expect(out.ok).toBe(true)
  })

  it('refuses when the booking row is missing', async () => {
    const noBooking = db({
      link: liveLink(),
      passengers: [{ id: P1, booking_id: BOOKING, is_lead_passenger: true }],
      booking: null,
    })
    expect(await call(noBooking)).toEqual(PORTAL_NOT_FOUND)
  })
})
