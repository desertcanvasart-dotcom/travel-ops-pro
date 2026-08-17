import { describe, it, expect } from 'vitest'
import {
  computeDeposit,
  validateDepositPercent,
  buildBookingRow,
  depositDeadline,
  DEFAULT_DEPOSIT_PERCENT,
} from '@/lib/booking-creation'

// ============================================
// Two invariants carry this file:
//
// 1. balance_due === total_cost at creation. record_booking_payment() recomputes
//    it as greatest(0, total_cost - total_paid), so any other value is one the
//    next payment will contradict. The old code wrote total - deposit.
//
// 2. deposit_percent is validated before it reaches arithmetic. It arrives from a
//    request body, and -50 or 500 both produce a deposit that would be shown to
//    a client.
// ============================================

describe('computeDeposit', () => {
  it('leaves the full total owed — nothing has been paid yet', () => {
    const { depositAmount, balanceDue } = computeDeposit(1000, 30)
    expect(depositAmount).toBe(300)
    // NOT 700. The deposit is a schedule, not a payment.
    expect(balanceDue).toBe(1000)
  })

  it('rounds money to cents', () => {
    // 5822.05 is a real quote total from this database.
    expect(computeDeposit(5822.05, 30).depositAmount).toBe(1746.62)
    expect(computeDeposit(1368.4, 30).depositAmount).toBe(410.52)
    // 333.33 × 33.33% = 111.0989… → 111.10
    expect(computeDeposit(333.33, 33.33).depositAmount).toBe(111.1)
  })

  it('handles the boundary percentages', () => {
    expect(computeDeposit(1000, 0)).toEqual({ depositAmount: 0, balanceDue: 1000 })
    // 100% deposit means the whole trip is due up front — still all outstanding.
    expect(computeDeposit(1000, 100)).toEqual({ depositAmount: 1000, balanceDue: 1000 })
  })

  it('treats a missing or nonsensical total as zero rather than NaN', () => {
    for (const bad of [0, -100, NaN, Infinity]) {
      const result = computeDeposit(bad, 30)
      expect(result.depositAmount).toBe(0)
      expect(result.balanceDue).toBe(0)
      expect(Number.isFinite(result.depositAmount)).toBe(true)
    }
  })

  it('never returns negative zero, which renders as "-0.00"', () => {
    expect(Object.is(computeDeposit(0, 30).depositAmount, -0)).toBe(false)
  })
})

describe('validateDepositPercent', () => {
  it('defaults to 30% when unspecified', () => {
    for (const absent of [undefined, null]) {
      const result = validateDepositPercent(absent)
      expect(result.ok).toBe(true)
      expect(result.value).toBe(DEFAULT_DEPOSIT_PERCENT)
      expect(result.value).toBe(30)
    }
  })

  it('rejects the values that would produce a wrong deposit', () => {
    // -50 → a negative deposit; 500 → five times the trip.
    for (const bad of [-1, -50, 101, 500, NaN, Infinity, -Infinity]) {
      const result = validateDepositPercent(bad)
      expect(result.ok, `${bad} must be rejected`).toBe(false)
      expect(result.error).toBeTruthy()
    }
  })

  it('rejects non-numeric junk', () => {
    for (const bad of ['abc', '', {}, [], true, false]) {
      expect(validateDepositPercent(bad).ok, `${JSON.stringify(bad)} must be rejected`).toBe(false)
    }
  })

  it('accepts a numeric string, since JSON clients send "30"', () => {
    expect(validateDepositPercent('30')).toEqual({ ok: true, value: 30 })
    expect(validateDepositPercent('12.5')).toEqual({ ok: true, value: 12.5 })
  })

  it('accepts the full legal range including both ends', () => {
    for (const good of [0, 0.5, 30, 99.99, 100]) {
      expect(validateDepositPercent(good)).toEqual({ ok: true, value: good })
    }
  })
})

describe('buildBookingRow', () => {
  const itinerary = {
    id: 'itin-1',
    client_name: 'Yuki Tanaka',
    client_email: 'yuki@example.com',
    client_phone: '+819012345678',
    trip_name: 'Nile Discovery',
    start_date: '2026-09-01',
    end_date: '2026-09-08',
    num_adults: 3,
    num_children: 0,
    total_cost: 5000,
    currency: 'EUR',
    tier: 'standard',
    assigned_guide_id: 'guide-1',
    assigned_vehicle_id: 'vehicle-1',
    partner_id: 'partner-1',
  }

  const base = { orgId: 'org-1', bookingCode: 'BKG-2026-0001', itinerary, depositPercent: 30 }

  it('copies trip and client details from the itinerary', () => {
    const row = buildBookingRow(base)
    expect(row).toMatchObject({
      org_id: 'org-1',
      booking_code: 'BKG-2026-0001',
      itinerary_id: 'itin-1',
      client_name: 'Yuki Tanaka',
      trip_name: 'Nile Discovery',
      start_date: '2026-09-01',
      end_date: '2026-09-08',
      num_adults: 3,
      num_children: 0,
      currency: 'EUR',
      tier: 'standard',
      status: 'pending',
      payment_status: 'pending',
      deposit_paid: false,
    })
  })

  it('prefers the QUOTE total over the itinerary total', () => {
    // The itinerary can drift after a quote is agreed; the client accepted the
    // quote's number, so that is what gets booked.
    const row = buildBookingRow({ ...base, total: 5822.05 })
    expect(row.total_cost).toBe(5822.05)
    expect(row.deposit_amount).toBe(1746.62)
    expect(row.balance_due).toBe(5822.05)
  })

  it('falls back to the itinerary total when no quote total is given', () => {
    const row = buildBookingRow(base)
    expect(row.total_cost).toBe(5000)
    expect(row.deposit_amount).toBe(1500)
    expect(row.balance_due).toBe(5000)
  })

  it('records the percentage used, so the figure stays explainable', () => {
    expect(buildBookingRow({ ...base, depositPercent: 15 }).deposit_percent).toBe(15)
  })

  it('stamps the quote link only when converting', () => {
    const plain = buildBookingRow(base)
    expect(plain.quote_id).toBeUndefined()
    expect(plain.quote_type).toBeUndefined()

    const converted = buildBookingRow({ ...base, quote: { id: 'q-1', type: 'b2b' } })
    expect(converted.quote_id).toBe('q-1')
    expect(converted.quote_type).toBe('b2b')
  })

  it('sets a deposit deadline only when asked', () => {
    expect(buildBookingRow(base).payment_deadline).toBeUndefined()
    const withDeadline = buildBookingRow({ ...base, withDeadline: true })
    expect(withDeadline.payment_deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('defaults a missing traveller count to one adult, not zero', () => {
    const row = buildBookingRow({
      ...base,
      itinerary: { ...itinerary, num_adults: null, num_children: null },
    })
    expect(row.num_adults).toBe(1)
    expect(row.num_children).toBe(0)
  })

  it('defaults a missing currency to EUR', () => {
    const row = buildBookingRow({ ...base, itinerary: { ...itinerary, currency: null } })
    expect(row.currency).toBe('EUR')
  })

  // Regression: the total came from the quote while the currency came from the
  // itinerary, so a yen quote booked against a euro itinerary produced
  // €1,854,367 instead of ¥1,854,367 — the right number wearing the wrong
  // currency, which no total-based check can catch.
  it('takes the currency from the same source as the total', () => {
    const row = buildBookingRow({
      ...base,
      total: 1854367,
      currency: 'JPY',
      itinerary: { ...itinerary, currency: 'EUR', total_cost: 4200 },
    })
    expect(row.total_cost).toBe(1854367)
    expect(row.currency).toBe('JPY')
  })

  it('falls back to the itinerary currency when the total is the itinerary total', () => {
    const row = buildBookingRow({ ...base, itinerary: { ...itinerary, currency: 'USD' } })
    expect(row.currency).toBe('USD')
  })

  it('carries the partner through for a B2B booking', () => {
    const row = buildBookingRow({ ...base, partnerName: 'Desert Canvas Travel' })
    expect(row.partner_id).toBe('partner-1')
    expect(row.partner_name).toBe('Desert Canvas Travel')
  })

  it('leaves partner fields null for a direct client booking', () => {
    const row = buildBookingRow({ ...base, itinerary: { ...itinerary, partner_id: null } })
    expect(row.partner_id).toBeNull()
    expect(row.partner_name).toBeNull()
  })
})

describe('depositDeadline', () => {
  it('returns a DATE-shaped string in the future', () => {
    const deadline = depositDeadline(7)
    expect(deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(deadline).getTime()).toBeGreaterThan(Date.now())
  })
})
