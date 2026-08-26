// ============================================
// The guard sequence behind every portal write
// ============================================
// The portal is the only surface in this app that takes input from someone with
// no session. The rules that make that safe were written once, inline, in
// PATCH /api/portal/[token]/travellers/[id]. Document upload needs exactly the
// same rules, and a security gate that exists twice is a security gate that
// drifts — so it lives here, in one testable function.
//
// The order matters and is not arbitrary:
//   1. Token shape, before any query runs. An unparseable token never reaches
//      the database.
//   2. The confirmation cookie. Possessing a forwarded URL is not possession of
//      the cookie, which is HMAC'd with a server-side secret.
//   3. Link state — revoked or expired links are dead.
//   4. Passenger scoping. A private per-traveller link may act only on its own
//      passenger; this is what stops one friend reaching another's passport.
//   5. The lock. Once the manifest has gone to Cairo, later changes would
//      diverge from what was sent.
//
// Every failure that could reveal whether a token exists returns the SAME
// 404 body, so the URL space stays unprobeable. The lock is the one exception:
// it is a state the legitimate traveller needs explained.
//
// NOTE: PATCH travellers/[id] still carries its own copy of this sequence. It
// is prod-verified and was left alone deliberately rather than refactored
// inside the upload change; moving it onto this helper is a follow-up.

import {
  isValidPortalToken,
  isPortalVerified,
  portalLinkState,
} from '@/lib/booking-portal'

export type PortalGateFailure = {
  ok: false
  status: number
  body: Record<string, unknown>
}

export type PortalGateSuccess = {
  ok: true
  link: Record<string, any>       // eslint-disable-line @typescript-eslint/no-explicit-any
  passenger: Record<string, any>  // eslint-disable-line @typescript-eslint/no-explicit-any
  booking: Record<string, any>    // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const PORTAL_NOT_FOUND: PortalGateFailure = {
  ok: false,
  status: 404,
  body: { error: 'Not found' },
}

export const PORTAL_UNVERIFIED: PortalGateFailure = {
  ok: false,
  status: 403,
  body: { success: false, error: '本人確認が必要です。ページを再読み込みしてください。' },
}

export const PORTAL_LOCKED: PortalGateFailure = {
  ok: false,
  status: 409,
  body: {
    error: 'locked',
    message: 'ご入力内容は確定済みです。変更が必要な場合は担当者までご連絡ください。',
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

/**
 * Resolve a portal token + passenger id to the row a write may touch.
 *
 * `requireUnlocked` is on by default: reads (listing what has been uploaded)
 * stay available after the manifest is locked, writes do not.
 */
export async function travellerWriteContext(
  db: Db,
  opts: {
    token: string
    passengerId: string
    cookieValue: string | undefined | null
    requireUnlocked?: boolean
  }
): Promise<PortalGateSuccess | PortalGateFailure> {
  const { token, passengerId, cookieValue, requireUnlocked = true } = opts

  if (!isValidPortalToken(token)) return PORTAL_NOT_FOUND
  if (!isPortalVerified(token, cookieValue)) return PORTAL_UNVERIFIED

  const { data: link } = await db
    .from('booking_portal_links')
    .select('id, booking_id, org_id, passenger_id, revoked_at, expires_at, details_locked_at')
    .eq('token', token)
    .maybeSingle()

  const state = portalLinkState(link)
  if (!state.usable) return PORTAL_NOT_FOUND

  // A private per-traveller link acts only on its own passenger. Answering 404
  // rather than 403 keeps a valid token from confirming that another traveller
  // exists.
  if (link.passenger_id && passengerId !== link.passenger_id) return PORTAL_NOT_FOUND

  if (requireUnlocked && link.details_locked_at) return PORTAL_LOCKED

  // The traveller must be on THIS booking. Scoping by booking_id as well as id
  // is what stops a valid token reaching another party's manifest.
  const { data: passenger } = await db
    .from('booking_passengers')
    .select('id, first_name, last_name, is_lead_passenger')
    .eq('id', passengerId)
    .eq('booking_id', link.booking_id)
    .maybeSingle()

  if (!passenger) return PORTAL_NOT_FOUND

  const { data: booking } = await db
    .from('bookings')
    .select('id, org_id, end_date')
    .eq('id', link.booking_id)
    .maybeSingle()

  if (!booking) return PORTAL_NOT_FOUND

  return { ok: true, link, passenger, booking }
}
