// ============================================
// What a trip payment request may set
// ============================================
// POST /api/payments spread the whole body into the insert and PUT passed it
// to update(): a caller could set any column (id, created_at, receipt_number,
// the recorded VAT), and PUT never checked the amount that POST checks. The
// columns a caller may write are listed here; org_id comes from the session,
// the receipt number and the VAT from the server.
export const PAYMENT_FIELDS = [
  'itinerary_id',
  'payment_type',
  'amount',
  'currency',
  'payment_method',
  'payment_status',
  'transaction_reference',
  'payment_date',
  'due_date',
  'notes',
] as const

/** Only the columns a caller may write. */
export function pickPaymentFields(body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!body || typeof body !== 'object') return out
  const source = body as Record<string, unknown>
  for (const field of PAYMENT_FIELDS) {
    if (source[field] !== undefined) out[field] = source[field]
  }
  return out
}

/** A payment amount is a positive, finite number (a string amount is read as a number, "abc" is refused). */
export function checkPaymentAmount(raw: unknown): { ok: true; amount: number } | { ok: false; error: string } {
  const amount = typeof raw === 'number' ? raw
    : typeof raw === 'string' && raw.trim() !== '' ? Number(raw)
    : NaN
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'amount must be a positive number' }
  return { ok: true, amount }
}
