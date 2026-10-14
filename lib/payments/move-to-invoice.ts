// ============================================
// Moving a legacy trip payment onto the trip's invoice
// ============================================
// A trip payment recorded before the trip had an invoice is skipped in the
// totals once the invoice exists (lib/payments/ledger) and stays on the list as
// an orphan. "Move to invoice" re-records the same money on the invoice and
// removes the trip row. This decides, without a database, whether that is
// allowed and what the invoice payment holds.

import { isReceivedTripPayment } from './stats'
import { paymentCurrencyFor } from '@/lib/payment-currency'

export interface MovableTripPayment {
  id: string
  itinerary_id?: string | null
  amount?: number | string | null
  currency?: string | null
  payment_method?: string | null
  payment_date?: string | null
  transaction_reference?: string | null
  notes?: string | null
  payment_type?: string | null
  payment_status?: string | null
}

export interface TargetInvoice {
  id: string
  invoice_number?: string | null
  status?: string | null
  currency?: string | null
  balance_due?: number | string | null
}

export type MovePlan =
  | { ok: true; invoice: TargetInvoice; invoicePayment: Record<string, unknown> }
  | { ok: false; status: 400 | 404 | 409; error: string }

/**
 * `invoices` are the trip's non-cancelled invoices. The payment goes onto the
 * single live invoice; none, or several, is refused with the reason. The
 * invoice payment copies the amount, currency, date, method, reference and
 * notes, and is refused when it would exceed the balance.
 */
export function planMoveToInvoice(payment: MovableTripPayment, invoices: TargetInvoice[]): MovePlan {
  if (!payment.itinerary_id) {
    return { ok: false, status: 409, error: 'This payment is not recorded on a trip, so there is no invoice to move it to.' }
  }
  if (!isReceivedTripPayment(payment)) {
    return { ok: false, status: 409, error: 'Only a completed payment received from the client can be moved to an invoice (not a refund, a pending or a failed payment).' }
  }
  if (invoices.length === 0) {
    return { ok: false, status: 409, error: 'This trip has no live invoice to move the payment to.' }
  }
  if (invoices.length > 1) {
    const numbers = invoices.map(i => i.invoice_number || 'invoice').join(', ')
    return { ok: false, status: 409, error: `This trip has more than one live invoice (${numbers}), so it is not clear which should take the payment. Record it on the right invoice by hand and delete this one.` }
  }
  const invoice = invoices[0]
  const label = invoice.invoice_number || 'the invoice'
  if (invoice.status === 'draft') {
    return { ok: false, status: 409, error: `${label} has not been sent yet; mark it as sent before moving a payment onto it.` }
  }
  const amount = Number(payment.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400, error: 'The payment has no valid amount to move.' }
  }
  const paid = paymentCurrencyFor(payment.currency, invoice.currency)
  if (!paid.ok) return { ok: false, status: 400, error: paid.error }
  const balance = Number(invoice.balance_due)
  if (amount > (Number.isFinite(balance) ? balance : 0) + 0.01) {
    return { ok: false, status: 400, error: `Payment amount exceeds the balance due on ${label} (${invoice.balance_due}), so it was not moved.` }
  }
  return {
    ok: true,
    invoice,
    invoicePayment: {
      invoice_id: invoice.id,
      amount,
      currency: paid.currency,
      payment_method: payment.payment_method || 'bank_transfer',
      payment_date: payment.payment_date || new Date().toISOString().split('T')[0],
      transaction_reference: payment.transaction_reference || null,
      notes: payment.notes || null,
      created_at: new Date().toISOString(),
    },
  }
}
