// ============================================
// THE TRAVELLER'S OWN PAGE
// ============================================
// A.T.S post a document pack to every traveller and read the answers back off a
// fax. This is the page that replaces the round trip: the trip they booked,
// what is owed and by when, the documents, and the 海外旅行参加申込書 as a form.
//
// Three invariants, two of them borrowed from lib/itinerary-share.ts because
// they were right there:
//
// 1. TOKENS ARE UNGUESSABLE. 192 bits of crypto randomness, base64url. The page
//    resolves them through the service role, so the token list is never
//    browser-queryable and revocation cannot be bypassed.
//
// 2. THE VIEW IS AN ALLOWLIST. toPortalBooking() copies named fields only — it
//    never spreads. Whatever the queries happen to return (supplier_cost,
//    profit, margin_percent, partner_commission_amount, internal notes), the
//    page receives none of it. A blocklist would leak every column added later;
//    an allowlist fails closed.
//
// 3. THIS LINK ACCEPTS INPUT, WHICH THE ITINERARY SHARE DOES NOT. That is the
//    whole reason it is a separate token and a separate table. A link that
//    collects passport details carries more risk than one that displays a
//    holiday, so it also expires, and it can be locked once the manifest has
//    gone to the ground operator.

import type { ClientItinerary } from './itinerary-share'

/** 24 crypto-random bytes as base64url — 192 bits, URL-safe, no padding. */
export function generatePortalToken(): string {
  const bytes = new Uint8Array(24)
  globalThis.crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Invoice statuses a traveller is allowed to see. The full vocabulary is
 *  draft | sent | paid | partial | overdue | cancelled (lib/validation.ts);
 *  the two left out are the two that were never handed over. An ALLOW-list
 *  rather than a deny-list: a status nobody has thought about yet must not
 *  reach the traveller by default.
 *
 *  Lives here because the portal PAGE (which lists documents) and the document
 *  ROUTE (which serves them) must not be able to disagree about it. */
const CUSTOMER_FACING_INVOICE_STATUSES = new Set(['sent', 'paid', 'partial', 'overdue'])

export function isCustomerFacingInvoice(status: unknown): boolean {
  return CUSTOMER_FACING_INVOICE_STATUSES.has(String(status ?? ''))
}

/** Tokens we mint are 32 chars of base64url; reject anything else up front. */
export function isValidPortalToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32}$/.test(token)
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const bool = (v: unknown): boolean => v === true

// ---------------------------------------------------------------------------

export interface PortalPayment {
  currency: string
  /** The whole agreed price. */
  total: number | null
  /** Paid so far, derived from the booking's own ledger. */
  paid: number
  /** Still owed. */
  outstanding: number
  depositAmount: number | null
  depositDueDate: string | null
  depositPaid: boolean
  /** Zero when the whole amount is due at once. */
  balanceAmount: number | null
  balanceDueDate: string | null
  /** True when departure was too close to split — the whole amount is due once. */
  singlePayment: boolean
  /** A link the office generated elsewhere. There is no gateway; this is a URL. */
  paymentUrl: string | null
}

/**
 * One traveller's answers, echoed back so the form can be re-opened and edited.
 *
 * Everything here is something the TRAVELLER supplied. Nothing operational
 * (room allocation, supplier assignments, internal notes) crosses over — the
 * form is theirs, the arrangements are not.
 */
export interface PortalTraveller {
  id: string
  isLead: boolean
  passengerType: string | null
  submittedAt: string | null

  firstName: string | null
  lastName: string | null
  familyNameKanji: string | null
  givenNameKanji: string | null
  familyNameKana: string | null
  givenNameKana: string | null

  dateOfBirth: string | null
  gender: string | null
  nationality: string | null

  passportNumber: string | null
  passportIssuedDate: string | null
  passportExpiry: string | null
  passportStatus: string | null
  passportExpectedDate: string | null

  postalCode: string | null
  address: string | null
  addressKana: string | null
  documentsPostalCode: string | null
  documentsAddress: string | null
  documentsAddressKana: string | null

  email: string | null
  phone: string | null
  homePhone: string | null
  fax: string | null
  employerName: string | null
  employerPhone: string | null

  emergencyContactName: string | null
  emergencyContactKana: string | null
  emergencyContactPhone: string | null
  emergencyContactRelationship: string | null

  insuranceRequested: boolean | null
  insurancePlanCode: string | null
  specialRequests: string | null
}

export interface PortalDocument {
  /** Stable key the route resolves to a file. */
  key: string
  title: string
  /** Why the traveller would open it. */
  note: string | null
}

export interface PortalBooking {
  bookingCode: string
  tripName: string
  tourCode: string | null
  startDate: string | null
  endDate: string | null
  numAdults: number
  numChildren: number
  payment: PortalPayment
  travellers: PortalTraveller[]
  documents: PortalDocument[]
  /** The trip itself, through the itinerary-share allowlist. */
  itinerary: ClientItinerary | null
  /** Once locked the form is read-only: the manifest has gone to Cairo. */
  detailsLocked: boolean
  /** How many travellers still have not answered. */
  outstandingDetails: number
}

/**
 * The traveller-facing projection. Named copies only — see the header.
 *
 * Deliberately absent from every level: supplier_cost, profit, margin_percent,
 * partner_id and partner_name, assigned_guide_id / assigned_vehicle_id,
 * internal notes, org_id, and the booking's own status vocabulary (a client
 * reading "pending" learns nothing true).
 */
export function toPortalBooking(input: {
  booking: Record<string, unknown>
  passengers: Array<Record<string, unknown>>
  link: Record<string, unknown>
  itinerary?: ClientItinerary | null
  documents?: PortalDocument[]
  paymentUrl?: string | null
}): PortalBooking {
  const { booking, passengers, link } = input

  const total = num(booking.total_cost)
  const outstanding = num(booking.balance_due) ?? 0
  // The booking's own ledger: record_booking_payment keeps balance_due as
  // total - paid, so paid is the difference rather than a second sum that
  // could disagree with it.
  const paid = total != null ? Math.max(0, total - outstanding) : 0

  const balanceAmount =
    total != null && num(booking.deposit_amount) != null
      ? Math.max(0, total - (num(booking.deposit_amount) as number))
      : null

  const travellers = (passengers ?? []).map(toPortalTraveller)

  return {
    bookingCode: str(booking.booking_code) ?? '',
    tripName: str(booking.trip_name) ?? 'ご旅行',
    tourCode: str(booking.tour_code),
    startDate: str(booking.start_date),
    endDate: str(booking.end_date),
    numAdults: num(booking.num_adults) ?? 0,
    numChildren: num(booking.num_children) ?? 0,

    payment: {
      currency: str(booking.currency) ?? 'JPY',
      total,
      paid,
      outstanding,
      depositAmount: num(booking.deposit_amount),
      depositDueDate: str(booking.payment_deadline),
      depositPaid: bool(booking.deposit_paid),
      // Null balance_due_date with a deposit equal to the total is the
      // late-booking case: one payment, no second instalment to show.
      balanceAmount: str(booking.balance_due_date) ? balanceAmount : null,
      balanceDueDate: str(booking.balance_due_date),
      singlePayment: !str(booking.balance_due_date),
      paymentUrl: input.paymentUrl ?? null,
    },

    travellers,
    documents: input.documents ?? [],
    itinerary: input.itinerary ?? null,
    detailsLocked: Boolean(str(link.details_locked_at)),
    outstandingDetails: travellers.filter(t => !t.submittedAt).length,
  }
}

function toPortalTraveller(p: Record<string, unknown>): PortalTraveller {
  return {
    id: String(p.id ?? ''),
    isLead: bool(p.is_lead_passenger),
    passengerType: str(p.passenger_type),
    submittedAt: str(p.details_submitted_at),

    firstName: str(p.first_name),
    lastName: str(p.last_name),
    familyNameKanji: str(p.family_name_kanji),
    givenNameKanji: str(p.given_name_kanji),
    familyNameKana: str(p.family_name_kana),
    givenNameKana: str(p.given_name_kana),

    dateOfBirth: str(p.date_of_birth),
    gender: str(p.gender),
    nationality: str(p.nationality),

    passportNumber: str(p.passport_number),
    passportIssuedDate: str(p.passport_issued_date),
    passportExpiry: str(p.passport_expiry),
    passportStatus: str(p.passport_status),
    passportExpectedDate: str(p.passport_expected_date),

    postalCode: str(p.postal_code),
    address: str(p.address),
    addressKana: str(p.address_kana),
    documentsPostalCode: str(p.documents_postal_code),
    documentsAddress: str(p.documents_address),
    documentsAddressKana: str(p.documents_address_kana),

    email: str(p.email),
    phone: str(p.phone),
    homePhone: str(p.home_phone),
    fax: str(p.fax),
    employerName: str(p.employer_name),
    employerPhone: str(p.employer_phone),

    emergencyContactName: str(p.emergency_contact_name),
    emergencyContactKana: str(p.emergency_contact_kana),
    emergencyContactPhone: str(p.emergency_contact_phone),
    emergencyContactRelationship: str(p.emergency_contact_relationship),

    insuranceRequested: typeof p.insurance_requested === 'boolean' ? p.insurance_requested : null,
    insurancePlanCode: str(p.insurance_plan_code),
    specialRequests: str(p.special_requests),
  }
}

/** The fields a traveller may write. Anything else in a request body is ignored. */
export const TRAVELLER_WRITABLE_FIELDS = [
  'first_name',
  'last_name',
  'family_name_kanji',
  'given_name_kanji',
  'family_name_kana',
  'given_name_kana',
  'date_of_birth',
  'gender',
  'nationality',
  'passport_number',
  'passport_issued_date',
  'passport_expiry',
  'passport_status',
  'passport_expected_date',
  'postal_code',
  'address',
  'address_kana',
  'documents_postal_code',
  'documents_address',
  'documents_address_kana',
  'email',
  'phone',
  'home_phone',
  'fax',
  'employer_name',
  'employer_phone',
  'emergency_contact_name',
  'emergency_contact_kana',
  'emergency_contact_phone',
  'emergency_contact_relationship',
  'insurance_requested',
  'insurance_plan_code',
  'special_requests',
] as const

/**
 * Keep only the fields a traveller is allowed to set.
 *
 * An allowlist, not a blocklist, and for the usual reason: this body arrives
 * from an unauthenticated visitor. Spreading it would let anyone who has the
 * link set org_id, booking_id, is_lead_passenger, details_source — or any
 * column added later that nobody thought to exclude.
 */
export function pickWritableFields(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {}
  const source = body as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const field of TRAVELLER_WRITABLE_FIELDS) {
    if (!(field in source)) continue
    const value = source[field]
    // An empty box means "not answered", which is NULL. Sending "" is not
    // merely untidy: Postgres rejects it outright for a DATE column, so a form
    // where the traveller left one date blank failed to save at all — with a
    // 500 rather than anything a traveller could act on.
    if (typeof value === 'string') {
      const trimmed = value.trim()
      out[field] = trimmed === '' ? null : trimmed
    } else {
      out[field] = value
    }
  }
  return out
}

/** Is this link still usable, and if not, why? */
export function portalLinkState(
  link: Record<string, unknown> | null,
  now: Date = new Date()
): { usable: boolean; reason: string | null } {
  if (!link) return { usable: false, reason: 'not_found' }
  if (str(link.revoked_at)) return { usable: false, reason: 'revoked' }
  const expires = str(link.expires_at)
  if (expires && Date.parse(expires) <= now.getTime()) {
    return { usable: false, reason: 'expired' }
  }
  return { usable: true, reason: null }
}

// ---------------------------------------------------------------------------
// CONFIRMATION GATE
// ---------------------------------------------------------------------------
// The link is the credential; this is the second, human factor against a
// FORWARDED link: before the page shows anything, the visitor states one fact
// the traveller knows — the booking number, or the lead traveller's family
// name (any script). Passing sets a cookie that cannot be derived from the
// token alone (HMAC with a server-side secret), so possessing the URL is not
// possession of the cookie.

import { createHmac, createHash } from 'crypto'

function portalVerifySecret(): string {
  // A dedicated secret when configured; the service key otherwise — it is
  // server-only and long, which is all HMAC needs. Never sent anywhere.
  return process.env.PORTAL_VERIFY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

/** Cookie name is derived from the token so one browser can hold verified
 *  state for several links without collisions. */
export function portalVerifyCookieName(token: string): string {
  return 'pv_' + createHash('sha256').update(token).digest('hex').slice(0, 16)
}

export function portalVerifyCookieValue(token: string): string {
  return createHmac('sha256', portalVerifySecret()).update(`portal-verify:${token}`).digest('hex')
}

export function isPortalVerified(token: string, cookieValue: string | undefined | null): boolean {
  return !!cookieValue && cookieValue === portalVerifyCookieValue(token)
}

/** NFKC (full/half width), lowercase, all whitespace stripped — the visitor
 *  should not fail the check over a full-width space or letter case. */
export function normalizeVerifyAnswer(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
}

/** Does the visitor's answer match a fact of this booking? Candidates are the
 *  booking number, the client name (full and family-name token), and the lead
 *  traveller's family name in all three scripts. */
export function verifyAnswerMatches(
  answer: unknown,
  facts: {
    booking_code?: string | null
    client_name?: string | null
    lead_names?: Array<string | null | undefined>
  }
): boolean {
  const given = normalizeVerifyAnswer(answer)
  if (given.length < 2) return false

  const candidates = new Set<string>()
  const add = (v: string | null | undefined) => {
    const n = normalizeVerifyAnswer(v)
    if (n.length >= 2) candidates.add(n)
  }
  add(facts.booking_code)
  add(facts.client_name)
  // The family name is the FIRST token of a Japanese full name and usually the
  // LAST of a romanised one — offer both rather than guessing the convention.
  const parts = String(facts.client_name ?? '')
    .normalize('NFKC')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length > 1) {
    add(parts[0])
    add(parts[parts.length - 1])
  }
  for (const name of facts.lead_names ?? []) add(name)

  return candidates.has(given)
}
