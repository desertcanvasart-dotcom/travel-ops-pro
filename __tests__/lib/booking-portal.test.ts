import { describe, it, expect } from 'vitest'
import {
  generatePortalToken,
  isValidPortalToken,
  pickWritableFields,
  portalLinkState,
  toPortalBooking,
} from '@/lib/booking-portal'

describe('tokens', () => {
  it('mints 32 chars of base64url', () => {
    const t = generatePortalToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(isValidPortalToken(t)).toBe(true)
  })

  it('does not mint the same token twice', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generatePortalToken()))
    expect(seen.size).toBe(200)
  })

  it('rejects anything that is not one of ours', () => {
    for (const bad of ['', 'short', null, undefined, '../../etc/passwd', 'a'.repeat(33)]) {
      expect(isValidPortalToken(bad as string)).toBe(false)
    }
  })
})

describe('pickWritableFields', () => {
  it('keeps only what a traveller may set', () => {
    const out = pickWritableFields({
      first_name: 'SOTOO',
      passport_number: 'TR1',
      // Everything below is somebody trying their luck with a public endpoint.
      org_id: 'other-org',
      booking_id: 'other-booking',
      is_lead_passenger: true,
      details_source: 'staff',
      details_submitted_at: '2020-01-01',
      id: 'someone-else',
    })
    expect(Object.keys(out).sort()).toEqual(['first_name', 'passport_number'])
  })

  it('turns an empty box into NULL, not an empty string', () => {
    // Postgres rejects "" for a DATE column, so a traveller who left one date
    // blank could not save the form at all.
    const out = pickWritableFields({ passport_expiry: '', first_name: '  SOTOO  ' })
    expect(out.passport_expiry).toBeNull()
    expect(out.first_name).toBe('SOTOO')
  })

  it('leaves a boolean alone', () => {
    expect(pickWritableFields({ insurance_requested: false }).insurance_requested).toBe(false)
  })

  it('ignores a body that is not an object', () => {
    expect(pickWritableFields(null)).toEqual({})
    expect(pickWritableFields('nope')).toEqual({})
  })
})

describe('portalLinkState', () => {
  const now = new Date('2026-08-17T00:00:00Z')

  it('accepts a live link', () => {
    expect(portalLinkState({ expires_at: '2026-12-31T00:00:00Z' }, now).usable).toBe(true)
  })

  it('refuses a revoked one', () => {
    expect(portalLinkState({ revoked_at: '2026-08-01T00:00:00Z' }, now).reason).toBe('revoked')
  })

  it('refuses an expired one', () => {
    expect(portalLinkState({ expires_at: '2026-08-16T00:00:00Z' }, now).reason).toBe('expired')
  })

  it('accepts a link with no expiry', () => {
    expect(portalLinkState({}, now).usable).toBe(true)
  })

  it('refuses a token that resolved to nothing', () => {
    expect(portalLinkState(null, now).reason).toBe('not_found')
  })
})

describe('toPortalBooking — the allowlist', () => {
  const booking = {
    booking_code: 'BKG-1',
    trip_name: 'Nile',
    total_cost: 1854367,
    balance_due: 1483494,
    deposit_amount: 370873,
    currency: 'JPY',
    payment_deadline: '2026-08-20',
    balance_due_date: '2026-10-15',
    // Everything below is the operator's business, not the traveller's.
    supplier_cost: 1400000,
    profit: 454367,
    margin_percent: 25,
    partner_name: 'Some Agent',
    assigned_guide_id: 'guide-1',
    org_id: 'org-1',
    status: 'pending',
  }

  it('lets none of the cost base cross', () => {
    const out = toPortalBooking({ booking, passengers: [], link: {} })
    const json = JSON.stringify(out)
    for (const leak of ['1400000', '454367', 'Some Agent', 'guide-1', 'org-1', 'margin']) {
      expect(json, `"${leak}" must not reach the traveller`).not.toContain(leak)
    }
  })

  it('derives what is paid from the booking ledger', () => {
    const out = toPortalBooking({ booking, passengers: [], link: {} })
    expect(out.payment.paid).toBe(370873)
    expect(out.payment.outstanding).toBe(1483494)
    expect(out.payment.balanceAmount).toBe(1483494)
    expect(out.payment.singlePayment).toBe(false)
  })

  it('reports a late booking as a single payment', () => {
    const out = toPortalBooking({
      booking: { ...booking, balance_due_date: null },
      passengers: [],
      link: {},
    })
    expect(out.payment.singlePayment).toBe(true)
    expect(out.payment.balanceAmount).toBeNull()
  })

  it('counts who still has not answered', () => {
    const out = toPortalBooking({
      booking,
      passengers: [
        { id: '1', is_lead_passenger: true, details_submitted_at: '2026-08-16T00:00:00Z' },
        { id: '2', is_lead_passenger: false },
      ],
      link: {},
    })
    expect(out.outstandingDetails).toBe(1)
    expect(out.travellers[0].submittedAt).toBeTruthy()
  })

  it('reports a locked form', () => {
    const out = toPortalBooking({
      booking,
      passengers: [],
      link: { details_locked_at: '2026-08-16T00:00:00Z' },
    })
    expect(out.detailsLocked).toBe(true)
  })
})
