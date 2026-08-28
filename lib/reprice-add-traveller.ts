// ============================================
// Re-price a booking when travellers are added
// ============================================
// The booking's total is the price the customer AGREED (a negotiated quote
// selling_price), not an engine output — and passport type (which the engine
// needs) is not stored on the booking. So re-running the pricing engine would
// both guess and discard the negotiation. Instead we extend the exact
// per-person rate the customer already accepted: each added traveller pays
// base / oldPax. It is transparent ("the same per-person rate as your
// booking"), never touches the negotiated base, and the operator approves it.
//
// EXTRAS ARE NOT PART OF THE PER-PERSON RATE. Since extras and upgrades
// landed (docs/plans/extras-and-upgrades.md), a booking's total_cost can carry
// one traveller's business-class upgrade. Dividing THAT by the party size would
// charge a share of it to everyone added afterwards, forever. So the rate is
// extended from base_total_cost — the agreed trip price without extras — and
// the extras ride along in the total untouched. On a booking that has never had
// an extra, base is absent and this is byte-identical to the old arithmetic.
//
// It is linear, so it does not discount the fixed costs a larger group shares
// (guide, vehicle) — it errs toward charging slightly more, in the operator's
// favour, and the operator can still adjust in the pricing screen afterwards.
//
// Balance preserves whatever has been paid: new_balance = old_balance + delta.

import { roundMoney } from '@/lib/fx-conversion'
import { computeDeposit } from '@/lib/booking-creation'

export type AddTravellerReprice =
  | { method: 'manual'; reason: string }
  | {
      method: 'per_person'
      perPerson: number
      oldTotal: number
      newTotal: number
      delta: number
      /** The agreed trip price without extras, after the addition. Persist it
       *  so the NEXT addition still divides a base free of extras. */
      newBaseTotalCost: number
      newDepositAmount: number
      newBalanceDue: number
    }

export function computeAddTravellerReprice(input: {
  oldTotal: number | null | undefined
  /** bookings.base_total_cost. Absent (the usual case) means the booking has
   *  no extras and its total IS the base. */
  oldBaseTotal?: number | null | undefined
  oldPax: number
  addedPax: number
  depositPercent: number | null | undefined
  oldBalanceDue: number | null | undefined
}): AddTravellerReprice {
  const oldTotal = Number(input.oldTotal)
  const oldPax = Math.floor(input.oldPax)
  const addedPax = Math.floor(input.addedPax)

  if (!Number.isFinite(oldTotal) || oldTotal <= 0 || oldPax <= 0) {
    // No priced base to extend — leave the money alone and flag for the operator.
    return { method: 'manual', reason: 'no per-person price to extend from' }
  }
  if (addedPax <= 0) return { method: 'manual', reason: 'no travellers added' }

  // The extras-free price is what gets divided. Falling back to the total is
  // not a guess: base_total_cost is NULL precisely when there are no extras.
  const rawBase = Number(input.oldBaseTotal)
  const oldBase = Number.isFinite(rawBase) && rawBase > 0 ? rawBase : oldTotal

  const perPerson = oldBase / oldPax
  const delta = roundMoney(perPerson * addedPax)
  // The extras stay in the total exactly as they were — added, never scaled.
  const newTotal = roundMoney(oldTotal + delta)
  const newBaseTotalCost = roundMoney(oldBase + delta)
  const depositPercent = Number(input.depositPercent) || 0
  // On the base, like every other deposit since extras landed.
  const newDepositAmount = computeDeposit(newBaseTotalCost, depositPercent).depositAmount
  const oldBalance = Number(input.oldBalanceDue)
  // Preserve payments: the outstanding balance rises by exactly the delta.
  const newBalanceDue = roundMoney(
    (Number.isFinite(oldBalance) ? oldBalance : oldTotal) + delta
  )

  return {
    method: 'per_person',
    perPerson: roundMoney(perPerson),
    oldTotal: roundMoney(oldTotal),
    newTotal,
    delta,
    newBaseTotalCost,
    newDepositAmount,
    newBalanceDue,
  }
}
