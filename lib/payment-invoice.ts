// ============================================
// The invoice for one payment (/documents/invoice/[id])
// ============================================
// The page hard-coded deposit_percent: 30 for every deposit, whatever was
// recorded (payments/new offers 10–50% and stores them all as 'deposit'), so
// the PDF badged a 10% deposit as "30% Booking Deposit" and worked the trip
// total back from it: amount ÷ 0.3. The trip's real total is on the payment
// (GET /api/payments/[id] returns the itinerary's total_cost).

export type PaymentInvoiceType = 'standard' | 'deposit' | 'final'

export interface PaymentInvoiceShape {
  invoiceType: PaymentInvoiceType
  /** The share of the trip this deposit is, or the deposit already paid
   *  before this final payment; undefined for a standard invoice. */
  depositPercent?: number
  tripTotal?: number
}

/** How a payment's invoice is drawn, from what the payment and its trip hold. */
export function paymentInvoiceShape(
  paymentType: string | null | undefined,
  amount: number | string,
  tripTotal: number | string | null | undefined
): PaymentInvoiceShape {
  const type: PaymentInvoiceType =
    paymentType === 'deposit' || paymentType?.startsWith('deposit_') ? 'deposit'
      : paymentType === 'final' || paymentType === 'balance' ? 'final'
      : 'standard'
  // numeric columns can arrive as strings; anything unreadable is "no total".
  const parsed = tripTotal === null || tripTotal === undefined ? NaN : Number(tripTotal)
  const total = Number.isFinite(parsed) ? parsed : null
  const amt = Number(amount)
  // No trip total, or an amount that is not a part of it: no breakdown —
  // never one made up.
  if (type === 'standard' || total === null || total <= 0 || !(amt > 0) || amt >= total) {
    return { invoiceType: 'standard' }
  }
  const depositShare = type === 'deposit' ? amt / total : (total - amt) / total
  const depositPercent = Math.round(depositShare * 1000) / 10
  if (!(depositPercent > 0 && depositPercent < 100)) return { invoiceType: 'standard' }
  return { invoiceType: type, depositPercent, tripTotal: total }
}
