// ============================================
// The amounts a new invoice request may carry
// ============================================
// POST /api/invoices used body.total_amount, full_trip_cost, discount_amount
// and deposit_percent as given: a negative total was stored, a string total
// was concatenated with the insurance and extras the server adds ("1000" +
// 12200 = "100012200"), a deposit of 0% silently became 10% and one of 150%
// billed more than the trip. Checked here, once, before any arithmetic.

export type InvoiceAmounts =
  | { ok: true; totalAmount: number; fullTripCost: number | null; depositPercent: number; discountAmount: number }
  | { ok: false; error: string }

/** A money field: absent is 0 (or null when `optional`), anything else a finite number >= 0. */
function money(raw: unknown, name: string, optional = false): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: optional ? null : 0 }
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: `${name} must be a non-negative number` }
  return { ok: true, value: n }
}

/** Validate and normalise the amounts of a POST /api/invoices body. */
export function checkInvoiceAmounts(body: Record<string, unknown>): InvoiceAmounts {
  const total = money(body.total_amount, 'total_amount')
  if (!total.ok) return total
  const trip = money(body.full_trip_cost, 'full_trip_cost', true)
  if (!trip.ok) return trip
  const discount = money(body.discount_amount, 'discount_amount')
  if (!discount.ok) return discount

  // Absent = the form's default of 10%. 0 is not "absent": a deposit of 0%
  // is a mistake, and 100 is the whole trip.
  let depositPercent = 10
  const rawPercent = body.deposit_percent
  if (rawPercent !== undefined && rawPercent !== null && rawPercent !== '') {
    const n = typeof rawPercent === 'number' ? rawPercent : typeof rawPercent === 'string' ? Number(rawPercent.trim()) : NaN
    if (!Number.isFinite(n) || n <= 0 || n > 100) {
      return { ok: false, error: 'deposit_percent must be more than 0 and at most 100' }
    }
    depositPercent = n
  }

  return {
    ok: true,
    totalAmount: total.value as number,
    fullTripCost: trip.value,
    depositPercent,
    discountAmount: discount.value as number,
  }
}

/** Statuses a caller may set on an invoice by hand (PUT). paid / partial / overdue are derived from payments and dates. */
export const SETTABLE_INVOICE_STATUSES = ['draft', 'sent', 'viewed', 'cancelled'] as const

export function isSettableInvoiceStatus(status: unknown): boolean {
  return typeof status === 'string' && (SETTABLE_INVOICE_STATUSES as readonly string[]).includes(status)
}
