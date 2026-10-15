// ============================================
// The fields a caller may write on a trip payment
// ============================================
// POST /api/payments and PUT /api/payments/[id] spread the request body into
// the row (AUDIT H25/H26): a caller could set id, created_at, updated_at or
// org_id, and a PUT could store a negative or non-numeric amount. Only the
// fields the payment forms send are kept; anything else is dropped.

export const PAYMENT_WRITABLE_FIELDS = [
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

export function pickPaymentFields(body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out
  const src = body as Record<string, unknown>
  for (const key of PAYMENT_WRITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(src, key)) out[key] = src[key]
  }
  return out
}

/** A payment amount: a positive, finite number, or null when it isn't one. */
export function positiveAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}
