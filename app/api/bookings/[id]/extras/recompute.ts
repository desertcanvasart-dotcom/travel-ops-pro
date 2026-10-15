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
  isSinglePayment,
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

// AUDIT M20: a payment recorded while this runs. record_booking_payment
// locks the booking, inserts the payment and writes payment_status /
// balance_due; this read the booking and its payments without a lock and then
// wrote its own payment_status from what it had read — so a payment landing
// in between was overwritten with the standing from before it. The write is
// now conditional on the booking's updated_at being what was read (the RPC
// always sets it); if it moved, the whole recompute runs again on fresh rows.
const MAX_ATTEMPTS = 3

export async function recomputeBookingExtras(
  admin: DbClient,
  bookingId: string,
  orgId: string
): Promise<RecomputeResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await recomputeOnce(admin, bookingId, orgId)
    if (result !== 'moved') return result
  }
  return {
    ok: false,
    status: 409,
    error: 'The booking kept changing while its total was being updated. Reload and try again.',
  }
}

async function recomputeOnce(
  admin: DbClient,
  bookingId: string,
  orgId: string
): Promise<RecomputeResult | 'moved'> {
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
    singlePayment: isSinglePayment(booking),
  })

  const standing = paymentStandingFor({
    totalPaid,
    totalCost: applied.total_cost,
    depositAmount: applied.deposit_amount,
  })

  let write = admin
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
  // Only if nothing wrote the booking since it was read (M20).
  write = booking.updated_at == null ? write.is('updated_at', null) : write.eq('updated_at', booking.updated_at)
  const { data: written, error } = await write.select('id')

  if (error) {
    return { ok: false, status: 500, error: 'Could not update the booking total' }
  }
  if (!Array.isArray(written) || written.length === 0) return 'moved'

  return { ok: true, ...applied, payment_status: standing.payment_status, excluded: totals.excluded }
}
