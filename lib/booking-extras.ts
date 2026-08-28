// ============================================
// Extras and upgrades — the money, as pure functions
// ============================================
// An extra is one priced line agreed AFTER the trip was priced: a second tour,
// a business-class upgrade, an extra night. See
// docs/plans/extras-and-upgrades.md and migration 20260828_booking_extras.sql.
//
// EVERYTHING HERE IS PURE. The arithmetic that decides what a customer owes is
// worth testing without a database, and the state machine is worth testing at
// all — it is the only thing standing between "the customer asked about
// business class" and "the customer has been charged for business class".
//
// THE ONE INVARIANT
//   total_cost = base_total_cost + extras_total
// and nothing else changes meaning. total_cost stays "what this customer owes
// for this trip", so record_booking_payment(), the invoices, the payment
// schedule and every dashboard keep working untouched.
//
// WHY BASE IS STORED SEPARATELY, beyond bookkeeping: computeAddTravellerReprice
// extends the agreed price as oldTotal / oldPax x newPax. Taken from
// total_cost, one traveller's upgrade would be divided across the party and
// charged again to everyone added later. It divides base_total_cost.

import { roundToCurrency } from '@/lib/currency-totals'

export type ExtraStatus =
  | 'requested'  // customer asked; no price yet
  | 'offered'    // office has priced it; waiting on the customer
  | 'accepted'   // customer said yes; not yet secured with the supplier
  | 'confirmed'  // MONEY MOVES HERE, and only here
  | 'declined'   // customer said no        (terminal)
  | 'withdrawn'  // office cancelled it     (terminal)

export type ExtraAction = 'price' | 'accept' | 'decline' | 'confirm' | 'withdraw'

/** The fields the money and the state machine actually read. */
export interface BookingExtraLine {
  id: string
  title: string
  quantity: number
  /** Selling price per unit. NULL until the office prices it. */
  unit_price: number | null
  currency: string | null
  status: ExtraStatus
}

// ============================================
// Totalling
// ============================================

export interface ExcludedExtra {
  id: string
  title: string
  currency: string
  amount: number
}

export type ExtrasTotalResult =
  | {
      ok: true
      /** Σ confirmed extras IN THE BOOKING'S CURRENCY. */
      total: number
      /** How many confirmed extras that total covers. */
      counted: number
      /**
       * Confirmed extras in some OTHER currency. They are deliberately not in
       * `total` and not converted — a rate applied to somebody else's tariff
       * invents a precision they never quoted. They are billed on their own
       * invoice, in their own currency, exactly as a JPY insurance premium is.
       */
      excluded: ExcludedExtra[]
    }
  | {
      ok: false
      reason: 'unpriced'
      /** Titles of confirmed extras with no price — a data defect, since the
       *  API refuses to confirm one. Reported rather than silently read as 0. */
      unpriced: string[]
    }

/**
 * What the confirmed extras on a booking add up to.
 *
 * Only `confirmed` counts. Everything before it — a customer's question, an
 * office quote, an acceptance not yet secured with the supplier — is
 * conversation, and conversation does not move money.
 */
export function extrasTotal(
  extras: BookingExtraLine[],
  bookingCurrency: string
): ExtrasTotalResult {
  const confirmed = extras.filter(e => e.status === 'confirmed')

  const unpriced = confirmed.filter(e => e.unit_price == null || !Number.isFinite(Number(e.unit_price)))
  if (unpriced.length > 0) {
    return { ok: false, reason: 'unpriced', unpriced: unpriced.map(e => e.title) }
  }

  const want = normalise(bookingCurrency)
  const excluded: ExcludedExtra[] = []
  let total = 0
  let counted = 0

  for (const e of confirmed) {
    const amount = roundToCurrency(Number(e.unit_price) * quantityOf(e), e.currency ?? want)
    if (normalise(e.currency) !== want) {
      excluded.push({ id: e.id, title: e.title, currency: normalise(e.currency), amount })
      continue
    }
    total += amount
    counted++
  }

  return { ok: true, total: roundToCurrency(total, want), counted, excluded }
}

// ============================================
// Applying it to the booking
// ============================================

export interface ApplyExtrasInput {
  /** The agreed trip price without extras. NULL on a booking that has never
   *  had one — in which case total_cost IS the base. */
  baseTotalCost: number | null | undefined
  /** The booking's current total_cost, used as the base when base is NULL. */
  totalCost: number | null | undefined
  /** From extrasTotal(). */
  extrasTotal: number
  depositPercent: number | null | undefined
  /** Money actually received. Defaults to none. */
  totalPaid?: number | null | undefined
  currency: string
}

export interface ApplyExtrasResult {
  base_total_cost: number
  extras_total: number
  total_cost: number
  deposit_amount: number
  balance_due: number
}

/**
 * The booking columns implied by a set of confirmed extras.
 *
 * TWO RULES ARE LOAD-BEARING.
 *
 * 1. `balance_due` is computed with the SAME formula the database uses —
 *    greatest(0, total_cost - total_paid) in record_booking_payment(). Any
 *    other value here is a number the customer's next payment would contradict,
 *    which is exactly how the old "just edit balance_due" workaround failed.
 *
 * 2. `deposit_amount` is a percentage of the BASE, never of the base plus
 *    extras. Extras settle with the balance. This follows what travel insurance
 *    already does (a premium is added to the trip total but never to the
 *    deposit base), and it means confirming an extra can never restate a
 *    deposit invoice that has already gone to the customer.
 */
export function applyExtras(input: ApplyExtrasInput): ApplyExtrasResult {
  const currency = input.currency
  const base = roundToCurrency(
    finite(input.baseTotalCost) ?? finite(input.totalCost) ?? 0,
    currency
  )
  const extras = roundToCurrency(finite(input.extrasTotal) ?? 0, currency)
  const total = roundToCurrency(base + extras, currency)

  const percent = finite(input.depositPercent) ?? 0
  const paid = Math.max(0, finite(input.totalPaid) ?? 0)

  return {
    base_total_cost: base,
    extras_total: extras,
    total_cost: total,
    // Percentage of the base — see rule 2.
    deposit_amount: roundToCurrency((base * percent) / 100, currency),
    // The database's own formula — see rule 1.
    balance_due: Math.max(0, roundToCurrency(total - paid, currency)),
  }
}

// ============================================
// The state machine
// ============================================

const TRANSITIONS: Record<ExtraStatus, Partial<Record<ExtraAction, ExtraStatus>>> = {
  // The customer asked for something. The office puts a price on it.
  requested: { price: 'offered', decline: 'declined', withdraw: 'withdrawn' },
  // Priced and with the customer. `price` again is a re-quote, which is why it
  // stays legal here. `confirm` skips the round trip for the common case where
  // the customer agreed on the phone and the office is recording it.
  offered: {
    accept: 'accepted',
    decline: 'declined',
    confirm: 'confirmed',
    price: 'offered',
    withdraw: 'withdrawn',
  },
  // Customer said yes; the office still has to secure it with the supplier.
  accepted: { confirm: 'confirmed', withdraw: 'withdrawn' },
  // Sold. Withdrawing reverses the money.
  confirmed: { withdraw: 'withdrawn' },
  declined: {},
  withdrawn: {},
}

export type TransitionResult =
  | { ok: true; status: ExtraStatus; moneyMoves: boolean }
  | { ok: false; reason: string }

/**
 * Where an action takes an extra, or why it cannot.
 *
 * `moneyMoves` says whether the booking's totals have to be recomputed —
 * true whenever `confirmed` is on either side of the transition.
 */
export function nextStatus(
  current: ExtraStatus,
  action: ExtraAction,
  extra?: Pick<BookingExtraLine, 'unit_price' | 'currency'>
): TransitionResult {
  const target = TRANSITIONS[current]?.[action]
  if (!target) {
    const terminal = current === 'declined' || current === 'withdrawn'
    return {
      ok: false,
      reason: terminal
        ? `This extra was already ${current} and cannot be changed.`
        : `Cannot ${action} an extra that is ${current}.`,
    }
  }

  // Confirming is the moment it becomes money, so it is the moment the price
  // has to exist. Nothing downstream should ever have to read a blank as zero.
  if (target === 'confirmed' && extra && !isPriced(extra)) {
    return { ok: false, reason: 'Price this extra before confirming it.' }
  }
  // The customer cannot accept a price that was never set.
  if (action === 'accept' && extra && !isPriced(extra)) {
    return { ok: false, reason: 'This extra has no price yet.' }
  }

  return {
    ok: true,
    status: target,
    moneyMoves: current === 'confirmed' || target === 'confirmed',
  }
}

/** A price and its currency are one fact; half of it is not a price. */
export function isPriced(extra: Pick<BookingExtraLine, 'unit_price' | 'currency'>): boolean {
  return (
    extra.unit_price != null &&
    Number.isFinite(Number(extra.unit_price)) &&
    Number(extra.unit_price) >= 0 &&
    typeof extra.currency === 'string' &&
    /^[A-Za-z]{3}$/.test(extra.currency.trim())
  )
}

/** What one extra line is worth, for display and for invoice lines. */
export function lineAmount(extra: BookingExtraLine): number | null {
  if (!isPriced(extra)) return null
  return roundToCurrency(Number(extra.unit_price) * quantityOf(extra), extra.currency ?? 'EUR')
}

function quantityOf(extra: Pick<BookingExtraLine, 'quantity'>): number {
  const q = Math.floor(Number(extra.quantity))
  return Number.isFinite(q) && q > 0 ? q : 1
}

function normalise(currency: unknown): string {
  const s = typeof currency === 'string' ? currency.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(s) ? s : 'EUR'
}

function finite(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : null
}
