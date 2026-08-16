// ============================================
// PAYMENT SCHEDULE — when the money is due
// ============================================
// The operator's rule, in their words: 20% of the total within three days of
// taking the booking, the rest sixty days before departure. Exceptions happen
// and are agreed with the customer, which is why their paperwork carries BOTH
// dates rather than one.
//
// So the rule is computed, never typed — and every part of it can be overridden
// for a booking that was agreed differently. An unusual date then reads as a
// decision somebody made, not as a mistake nobody caught.
//
// Pure: dates and numbers in, schedule out. No database, no clock. The caller
// supplies "today" where it is needed, so a schedule is reproducible in a test
// and cannot drift depending on when it runs.

import { roundToCurrency } from './currency-totals'

export interface PaymentRule {
  /** Share of the total taken as a deposit. */
  deposit_percent: number
  /** Days after the booking is taken that the deposit falls due. */
  deposit_due_days: number
  /** Days before departure that the balance falls due. */
  balance_due_days_before_departure: number
}

/** The operator's standing terms, applied unless a booking says otherwise. */
export const DEFAULT_PAYMENT_RULE: PaymentRule = {
  deposit_percent: 20,
  deposit_due_days: 3,
  balance_due_days_before_departure: 60,
}

export interface ScheduleOverrides {
  /** A deposit agreed with the customer instead of the computed share. */
  deposit_amount?: number | null
  deposit_due_date?: string | null
  balance_due_date?: string | null
}

export interface PaymentScheduleInput {
  /** The full agreed price. */
  total: number
  currency: string
  /** ISO date the booking was taken. */
  booked_on: string
  /** ISO date of departure. Null when unknown — the balance date cannot then
   *  be derived, and saying so is better than inventing one. */
  departure_date?: string | null
  rule?: PaymentRule
  overrides?: ScheduleOverrides
}

export interface PaymentSchedule {
  deposit_amount: number
  deposit_due_date: string
  /** Zero when the whole amount is due at once. */
  balance_amount: number
  /** Null when there is no second payment, or when departure is unknown. */
  balance_due_date: string | null
  /**
   * True when departure is too close to split the payment — the balance would
   * fall due on or before the deposit. Late bookings are common, and issuing a
   * balance invoice dated in the past is worse than asking for the lot up front.
   */
  single_payment: boolean
  /**
   * Anything about this schedule the operator should not have to work out:
   * why it collapsed to one payment, or why the balance has no date yet.
   * Null when the standing rule applied cleanly.
   */
  note: string | null
  /** Which fields the operator set by hand. */
  overridden: Array<keyof ScheduleOverrides>
}

const DAY_MS = 86_400_000

/** Days added in UTC. Local-time arithmetic shifts a date across a DST boundary
 *  and silently moves a payment deadline by a day. */
export function addDays(isoDate: string, days: number): string {
  const time = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(time)) throw new Error(`Not a date: ${isoDate}`)
  return new Date(time + days * DAY_MS).toISOString().slice(0, 10)
}

/** Negative when a is before b. */
function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function computePaymentSchedule(input: PaymentScheduleInput): PaymentSchedule {
  const rule = input.rule ?? DEFAULT_PAYMENT_RULE
  const overrides = input.overrides ?? {}
  const overridden: Array<keyof ScheduleOverrides> = []

  const total = Number(input.total) || 0
  const bookedOn = input.booked_on.slice(0, 10)

  // --- deposit ---
  let depositAmount = roundToCurrency((total * rule.deposit_percent) / 100, input.currency)
  if (overrides.deposit_amount != null) {
    depositAmount = roundToCurrency(overrides.deposit_amount, input.currency)
    overridden.push('deposit_amount')
  }
  // A deposit larger than the trip is not a deposit.
  depositAmount = Math.min(depositAmount, total)

  let depositDue = addDays(bookedOn, rule.deposit_due_days)
  if (overrides.deposit_due_date) {
    depositDue = overrides.deposit_due_date.slice(0, 10)
    overridden.push('deposit_due_date')
  }

  // --- balance ---
  let balanceDue: string | null = null
  if (overrides.balance_due_date) {
    balanceDue = overrides.balance_due_date.slice(0, 10)
    overridden.push('balance_due_date')
  } else if (input.departure_date) {
    balanceDue = addDays(
      input.departure_date.slice(0, 10),
      -rule.balance_due_days_before_departure
    )
  }

  // --- can this be split at all? ---
  // An operator override is a decision and is honoured even if the dates look
  // odd; only a COMPUTED balance date that lands on or before the deposit
  // collapses, which is the late-booking case.
  // ONLY a departure we know about, and know to be close, collapses the
  // payment. An UNKNOWN departure is a different thing entirely: the balance is
  // still owed and still a balance, we simply cannot say when yet. Treating the
  // two alike would demand the whole trip price up front from every booking
  // whose dates were not filled in — turning a missing field into a bill.
  let singlePayment = false
  let reason: string | null = null

  if (
    balanceDue &&
    !overridden.includes('balance_due_date') &&
    compareDates(balanceDue, depositDue) <= 0
  ) {
    singlePayment = true
    reason = `Departure is inside ${rule.balance_due_days_before_departure} days, so the balance would fall due on or before the deposit`
  } else if (!balanceDue) {
    reason = 'No departure date yet, so the balance has no due date'
  }

  if (singlePayment) {
    return {
      deposit_amount: total,
      deposit_due_date: depositDue,
      balance_amount: 0,
      balance_due_date: null,
      single_payment: true,
      note: reason,
      overridden,
    }
  }

  return {
    deposit_amount: depositAmount,
    deposit_due_date: depositDue,
    // Derived by subtraction, never recomputed as a percentage — the two parts
    // must add up to exactly what was agreed.
    balance_amount: roundToCurrency(total - depositAmount, input.currency),
    balance_due_date: balanceDue,
    single_payment: false,
    note: reason,
    overridden,
  }
}

/** The rule an organisation trades on, falling back to the standing terms. */
export function paymentRuleFrom(org: Record<string, any> | null | undefined): PaymentRule {
  return {
    deposit_percent: num(org?.deposit_percent, DEFAULT_PAYMENT_RULE.deposit_percent),
    deposit_due_days: num(org?.deposit_due_days, DEFAULT_PAYMENT_RULE.deposit_due_days),
    balance_due_days_before_departure: num(
      org?.balance_due_days_before_departure,
      DEFAULT_PAYMENT_RULE.balance_due_days_before_departure
    ),
  }
}

function num(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}
