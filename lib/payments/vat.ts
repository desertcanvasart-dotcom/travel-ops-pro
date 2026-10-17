// ============================================
// The VAT a trip payment's receipt states
// ============================================
// Owner's rule: VAT is recorded per document. A trip payment's receipt took
// its VAT from the trip every time it was opened, so a trip whose VAT was
// switched later reprinted an old receipt with different VAT than the copy
// already sent by WhatsApp. The VAT inside the amount is now written on the
// payment when it is recorded (payments.vat_applied / vat_rate / vat_amount /
// vat_base, migration 20261225); a payment from before that has NULL there
// and still reads the trip, as it always did.
import { readVat, vatInsideGross, type TripVat, type VatRecord } from '@/lib/vat'

/** The columns to store on a trip payment of `amount` towards a trip with `trip`'s VAT facts. */
export function tripPaymentVatColumns(
  amount: unknown,
  trip: TripVat | null | undefined,
  currency: string | null | undefined
): { vat_applied: boolean; vat_rate: number | null; vat_amount: number; vat_base: number | null } {
  const vat = vatInsideGross(amount, trip, currency)
  return { vat_applied: vat.vat_applied, vat_rate: vat.vat_rate, vat_amount: vat.vat_amount, vat_base: vat.vat_base ?? null }
}

interface PaymentVatSource {
  amount?: unknown
  vat_applied?: unknown
  vat_rate?: unknown
  vat_amount?: unknown
  vat_base?: unknown
  /** Set by GET /api/payments/[id]: whether the vat_* fields are the payment's own record. */
  vat_recorded?: boolean
}

/**
 * The VAT a receipt for this payment states: what was recorded on it, else
 * (a payment from before it was recorded) worked out from the trip's facts.
 * `payment` is the payment row, or GET /api/payments/[id]'s answer (which
 * carries the trip's facts in the same fields when nothing was recorded, so
 * `trip` defaults to it).
 */
export function receiptVat(
  payment: PaymentVatSource | null | undefined,
  currency: string | null | undefined,
  trip: TripVat | null | undefined = payment as TripVat | null | undefined
): VatRecord {
  if (!payment) return { vat_applied: false, vat_rate: null, vat_amount: 0 }
  const recorded = 'vat_recorded' in payment ? payment.vat_recorded === true : typeof payment.vat_applied === 'boolean'
  return recorded ? readVat(payment) : vatInsideGross(payment.amount, trip, currency)
}
