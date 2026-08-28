// ============================================
// Putting the extras back onto the booking
// ============================================
// Every route that changes whether an extra is CONFIRMED ends here. Nothing
// else in the codebase is allowed to write extras_total or base_total_cost —
// one writer means the invariant
//   total_cost = base_total_cost + extras_total
// has exactly one place it can be broken.
//
// It is a full recompute from the extras rows, not an increment. Confirm,
// withdraw, re-price and delete all funnel through the same arithmetic, so the
// booking cannot drift out of step with its own extras however it got there.

import {
  extrasTotal,
  applyExtras,
  paymentStandingFor,
  totalPaidFrom,
  type BookingExtraLine,
} from '@/lib/booking-extras'

type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export type RecomputeResult =
  | {
      ok: true
      total_cost: number
      base_total_cost: number
      extras_total: number
      deposit_amount: number
      balance_due: number
      payment_status: string
      /** Confirmed extras in another currency: deliberately NOT in the total,
       *  and the caller should say so rather than let them look free. */
      excluded: Array<{ id: string; title: string; currency: string; amount: number }>
    }
  | { ok: false; error: string; status: number }

export async function recomputeBookingExtras(
  admin: DbClient,
  bookingId: string,
  orgId: string
): Promise<RecomputeResult> {
  // `*`: base_total_cost and extras_total must not be named in a select, so
  // that a deployment running ahead of the migration fails HERE, loudly and
  // without touching money, instead of 400ing on every read.
  const { data: booking } = await admin
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!booking) return { ok: false, error: 'Booking not found', status: 404 }

  if (!('base_total_cost' in booking) || !('extras_total' in booking)) {
    // Fail closed. Writing total_cost without somewhere to keep the base would
    // destroy the agreed trip price with no way back.
    return {
      ok: false,
      status: 503,
      error:
        'Extras need migration 20260828_booking_extras, which has not been applied to this database yet.',
    }
  }

  const currency = typeof booking.currency === 'string' ? booking.currency : 'EUR'

  const { data: extras } = await admin
    .from('booking_extras')
    .select('id, title, quantity, unit_price, currency, status')
    .eq('booking_id', bookingId)
    .eq('org_id', orgId)

  const totals = extrasTotal((extras ?? []) as BookingExtraLine[], currency)
  if (!totals.ok) {
    return {
      ok: false,
      status: 409,
      error: `Confirmed but unpriced: ${totals.unpriced.join(', ')}. Price it or withdraw it.`,
    }
  }

  const { data: payments } = await admin
    .from('booking_payments')
    .select('amount, payment_type, currency')
    .eq('booking_id', bookingId)

  const totalPaid = totalPaidFrom(payments ?? [], currency)

  const applied = applyExtras({
    baseTotalCost: booking.base_total_cost,
    totalCost: booking.total_cost,
    extrasTotal: totals.total,
    depositPercent: booking.deposit_percent,
    totalPaid,
    currency,
  })

  const standing = paymentStandingFor({
    totalPaid,
    totalCost: applied.total_cost,
    depositAmount: applied.deposit_amount,
  })

  const { error } = await admin
    .from('bookings')
    .update({
      ...applied,
      payment_status: standing.payment_status,
      // Only ever promoted here. A booking whose deposit was paid does not stop
      // having had its deposit paid because the trip got more expensive.
      deposit_paid: booking.deposit_paid || standing.deposit_paid,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('org_id', orgId)

  if (error) {
    return { ok: false, status: 500, error: 'Could not update the booking total' }
  }

  return { ok: true, ...applied, payment_status: standing.payment_status, excluded: totals.excluded }
}
