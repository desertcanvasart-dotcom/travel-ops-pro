import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PAYMENT_RULE,
  addDays,
  computePaymentSchedule,
  paymentRuleFrom,
} from '@/lib/payment-schedule'

// The operator's standing terms: 20% within three days of booking, the balance
// sixty days before departure. Exceptions are agreed with the customer, so
// every part of that is overridable.

const base = {
  total: 1854367,
  currency: 'JPY',
  booked_on: '2026-08-16',
  departure_date: '2026-12-04',
}

describe('addDays', () => {
  it('adds and subtracts in UTC', () => {
    expect(addDays('2026-08-16', 3)).toBe('2026-08-19')
    expect(addDays('2026-12-04', -60)).toBe('2026-10-05')
  })

  it('crosses a month and a year boundary', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('does not shift across a DST boundary', () => {
    // Local-time arithmetic here moves the deadline by a day in most of Europe.
    expect(addDays('2026-10-24', 3)).toBe('2026-10-27')
    expect(addDays('2026-03-28', 3)).toBe('2026-03-31')
  })
})

describe('the standing rule', () => {
  const schedule = computePaymentSchedule(base)

  it('takes 20% within three days of booking', () => {
    // ¥1,854,367 × 20% = ¥370,873.4 → whole yen.
    expect(schedule.deposit_amount).toBe(370873)
    expect(schedule.deposit_due_date).toBe('2026-08-19')
  })

  it('takes the balance sixty days before departure', () => {
    expect(schedule.balance_due_date).toBe('2026-10-05')
  })

  it('makes the two parts add up to exactly the agreed price', () => {
    // The balance is the REMAINDER, never a second percentage — recomputing it
    // as 80% would lose the rounding delta and misbill by the difference.
    expect(schedule.deposit_amount + schedule.balance_amount).toBe(base.total)
    expect(schedule.balance_amount).toBe(1483494)
  })

  it('splits the payment and reports nothing unusual', () => {
    expect(schedule.single_payment).toBe(false)
    expect(schedule.overridden).toEqual([])
  })
})

describe('late bookings', () => {
  it('collapses to one payment when departure is inside the balance window', () => {
    // Booked 40 days out: the balance would be due before the deposit.
    const schedule = computePaymentSchedule({ ...base, departure_date: '2026-09-25' })
    expect(schedule.single_payment).toBe(true)
    expect(schedule.deposit_amount).toBe(base.total)
    expect(schedule.balance_amount).toBe(0)
    expect(schedule.balance_due_date).toBeNull()
    expect(schedule.single_payment_reason).toMatch(/inside 60 days/)
  })

  it('collapses when the balance would land exactly on the deposit date', () => {
    // deposit due 2026-08-19, so departure 60 days later is the boundary.
    const schedule = computePaymentSchedule({ ...base, departure_date: '2026-10-18' })
    expect(schedule.single_payment).toBe(true)
  })

  it('still splits one day the other side of the boundary', () => {
    const schedule = computePaymentSchedule({ ...base, departure_date: '2026-10-19' })
    expect(schedule.single_payment).toBe(false)
    expect(schedule.balance_due_date).toBe('2026-08-20')
  })

  it('asks for the whole amount when departure is unknown', () => {
    const schedule = computePaymentSchedule({ ...base, departure_date: null })
    expect(schedule.single_payment).toBe(true)
    expect(schedule.single_payment_reason).toMatch(/No departure date/)
  })
})

describe('exceptions agreed with the customer', () => {
  it('honours an agreed deposit amount', () => {
    const schedule = computePaymentSchedule({
      ...base,
      overrides: { deposit_amount: 500000 },
    })
    expect(schedule.deposit_amount).toBe(500000)
    expect(schedule.balance_amount).toBe(1354367)
    expect(schedule.overridden).toContain('deposit_amount')
  })

  it('honours agreed dates', () => {
    const schedule = computePaymentSchedule({
      ...base,
      overrides: { deposit_due_date: '2026-08-31', balance_due_date: '2026-11-01' },
    })
    expect(schedule.deposit_due_date).toBe('2026-08-31')
    expect(schedule.balance_due_date).toBe('2026-11-01')
    expect(schedule.overridden).toEqual(
      expect.arrayContaining(['deposit_due_date', 'balance_due_date'])
    )
  })

  it('does NOT collapse an overridden balance date, however odd it looks', () => {
    // An override is a decision somebody made with the customer. Quietly
    // rewriting it would overrule them.
    const schedule = computePaymentSchedule({
      ...base,
      departure_date: '2026-09-25',
      overrides: { balance_due_date: '2026-09-20' },
    })
    expect(schedule.single_payment).toBe(false)
    expect(schedule.balance_due_date).toBe('2026-09-20')
  })

  it('refuses a deposit larger than the trip', () => {
    const schedule = computePaymentSchedule({
      ...base,
      overrides: { deposit_amount: 9_999_999 },
    })
    expect(schedule.deposit_amount).toBe(base.total)
    expect(schedule.balance_amount).toBe(0)
  })

  it('rounds an agreed deposit to the currency too', () => {
    const schedule = computePaymentSchedule({
      ...base,
      overrides: { deposit_amount: 370873.4 },
    })
    expect(schedule.deposit_amount).toBe(370873)
  })
})

describe('currencies that have cents', () => {
  it('splits a euro trip to the cent', () => {
    const schedule = computePaymentSchedule({
      total: 5822.07,
      currency: 'EUR',
      booked_on: '2026-08-16',
      departure_date: '2026-12-04',
    })
    expect(schedule.deposit_amount).toBe(1164.41)
    expect(schedule.balance_amount).toBe(4657.66)
    expect(schedule.deposit_amount + schedule.balance_amount).toBeCloseTo(5822.07, 2)
  })
})

describe('paymentRuleFrom', () => {
  it('falls back to the standing terms', () => {
    expect(paymentRuleFrom(null)).toEqual(DEFAULT_PAYMENT_RULE)
    expect(paymentRuleFrom({})).toEqual(DEFAULT_PAYMENT_RULE)
  })

  it('takes an organisation that trades on different terms', () => {
    expect(
      paymentRuleFrom({ deposit_percent: 30, deposit_due_days: 7, balance_due_days_before_departure: 45 })
    ).toEqual({ deposit_percent: 30, deposit_due_days: 7, balance_due_days_before_departure: 45 })
  })

  it('ignores nonsense rather than trading on it', () => {
    expect(paymentRuleFrom({ deposit_percent: -5 }).deposit_percent).toBe(20)
    expect(paymentRuleFrom({ deposit_due_days: 'soon' }).deposit_due_days).toBe(3)
  })

  it('allows a zero-day rule, which is not nonsense', () => {
    expect(paymentRuleFrom({ deposit_due_days: 0 }).deposit_due_days).toBe(0)
  })
})
