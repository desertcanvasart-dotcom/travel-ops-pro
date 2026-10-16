// ============================================
// What counts as money received, on the Payments and Receipts pages
// ============================================
// A trip payment row can be pending, failed, refunded, or a refund itself
// (payment_type 'refund', with a POSITIVE amount). The Payments page added
// every one of them into "Total received" and "This month" while the Receipts
// page counted only completed payments, so the two disagreed. One rule, here:
// money received is a COMPLETED payment that is not a refund. (A refund is
// not subtracted; it is money handed back, not money received, and it has no
// receipt.) Every payment recorded against an invoice counts: the invoice
// payment routes only accept real payments.
import { addToTotals, emptyTotals, type CurrencyTotals } from '@/lib/currency-totals'
import { isOverdue, pendingInvoice, type InvoiceLike } from '@/lib/invoices/status'
import { countableTripPayments, type TripInvoiceLike } from '@/lib/payments/ledger'

export interface TripPaymentLike {
  itinerary_id?: string | null
  amount?: unknown
  currency?: string | null
  payment_status?: string | null
  payment_type?: string | null
  payment_date?: string | null
}

/** A trip payment that is money received (and gets a receipt). */
export function isReceivedTripPayment(p: TripPaymentLike): boolean {
  return p.payment_status === 'completed' && p.payment_type !== 'refund'
}

/** First day of `today`'s month, YYYY-MM-DD. */
export function monthStartOf(today: string): string {
  return `${today.slice(0, 7)}-01`
}

/** Is this payment date in the month that starts on `monthStart`? Dates are compared as text so a timezone cannot move 1 June into May. */
export function onOrAfterMonthStart(paymentDate: string | null | undefined, monthStart: string): boolean {
  return !!paymentDate && String(paymentDate).slice(0, 10) >= monthStart
}

export interface PaymentStats {
  totalReceived: CurrencyTotals
  pendingPayments: CurrencyTotals
  overduePayments: CurrencyTotals
  thisMonthRevenue: CurrencyTotals
}

interface InvoiceWithPayments extends InvoiceLike, TripInvoiceLike {
  invoice_payments?: Array<{ amount?: unknown; currency?: string | null; payment_date?: string | null }> | null
}

/**
 * The four tiles of the Payments page, per currency. `today` is YYYY-MM-DD.
 *
 * A trip that has a non-cancelled invoice takes its money on the invoice
 * (lib/payments/ledger), so its trip payments are skipped here: a legacy trip
 * with both would otherwise count the same deposit twice.
 */
export function paymentStats(
  tripPayments: TripPaymentLike[],
  invoices: InvoiceWithPayments[],
  today: string
): PaymentStats {
  const monthStart = monthStartOf(today)
  const totalReceived = emptyTotals()
  const pendingPayments = emptyTotals()
  const overduePayments = emptyTotals()
  const thisMonthRevenue = emptyTotals()

  for (const p of countableTripPayments(tripPayments, invoices)) {
    if (!isReceivedTripPayment(p)) continue
    const currency = p.currency || 'EUR'
    addToTotals(totalReceived, p.amount, currency)
    if (onOrAfterMonthStart(p.payment_date, monthStart)) addToTotals(thisMonthRevenue, p.amount, currency)
  }

  for (const inv of invoices) {
    // Owed: sent, part-paid or viewed. A draft was never sent and a cancelled
    // invoice is not owed, so neither is pending or overdue.
    if (pendingInvoice(inv)) addToTotals(pendingPayments, inv.balance_due, inv.currency)
    if (isOverdue(inv, today)) addToTotals(overduePayments, inv.balance_due, inv.currency)
    for (const p of inv.invoice_payments ?? []) {
      const currency = p.currency || inv.currency
      addToTotals(totalReceived, p.amount, currency)
      if (onOrAfterMonthStart(p.payment_date, monthStart)) addToTotals(thisMonthRevenue, p.amount, currency)
    }
  }

  return { totalReceived, pendingPayments, overduePayments, thisMonthRevenue }
}

/**
 * What a trip has been paid so far: its completed payments, less completed
 * refunds. itineraries.total_paid is never written by anything, so the New
 * Payment screen defaulted a final payment to the full trip price even after
 * a deposit; this is what it subtracts instead.
 */
export function tripPaid(payments: TripPaymentLike[]): number {
  let paid = 0
  for (const p of payments) {
    if (p.payment_status !== 'completed') continue
    paid += p.payment_type === 'refund' ? -(Number(p.amount) || 0) : Number(p.amount) || 0
  }
  return paid
}
