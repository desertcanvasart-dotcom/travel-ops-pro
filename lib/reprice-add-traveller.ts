// ============================================
// Re-price a booking when travellers are added
// ============================================
// The booking's total is the price the customer AGREED (a negotiated quote
// selling_price), not an engine output — and passport type (which the engine
// needs) is not stored on the booking. So re-running the pricing engine would
// both guess and discard the negotiation. Instead we extend the exact
// per-person rate the customer already accepted: newTotal = oldTotal / oldPax
// × newPax. It is transparent ("the same per-person rate as your booking"),
// never touches the negotiated base, and the operator approves it.
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
      newDepositAmount: number
      newBalanceDue: number
    }

export function computeAddTravellerReprice(input: {
  oldTotal: number | null | undefined
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

  const perPerson = oldTotal / oldPax
  const newPax = oldPax + addedPax
  const newTotal = roundMoney(perPerson * newPax)
  const delta = roundMoney(newTotal - oldTotal)
  const depositPercent = Number(input.depositPercent) || 0
  const newDepositAmount = computeDeposit(newTotal, depositPercent).depositAmount
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
    newDepositAmount,
    newBalanceDue,
  }
}
