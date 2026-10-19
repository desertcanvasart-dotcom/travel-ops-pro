// What an extra may be saved with — one check for create (POST) and change
// (PUT). PUT checked nothing: a bad unit or currency reached the database's
// CHECK and came back as a bare "Failed to save the extra", and a negative or
// non-numeric cost or price was saved (a typed "abc" as no price at all).

import { normaliseRateCurrency } from '@/lib/org-rate-currency'
import { OFFERED_WITH } from '@/lib/extras/offered'

export const EXTRA_UNITS = ['per_person', 'per_booking'] as const

/** The first thing wrong with these fields, or null. Only fields present are
 *  checked, so a PUT that changes one field is judged on that field. */
export function extraInputError(body: Record<string, unknown>): string | null {
  if ('unit' in body && !EXTRA_UNITS.includes(String(body.unit) as typeof EXTRA_UNITS[number])) {
    return 'Unit must be per_person or per_booking'
  }
  for (const [key, label] of [['supplier_cost', 'Supplier cost'], ['selling_price', 'Selling price']] as const) {
    if (!(key in body)) continue
    const v = body[key]
    // Blank is "not priced" (the unpriced-rates rule), never an error.
    if (v === '' || v === null || v === undefined) continue
    const n = Number(v)
    if (!Number.isFinite(n)) return `${label} must be a number`
    if (n < 0) return `${label} cannot be negative`
  }
  if ('rate_currency' in body && body.rate_currency && !normaliseRateCurrency(body.rate_currency)) {
    return 'Currency must be one of USD, EUR, GBP, EGP, JPY'
  }
  if ('offered_with' in body && !OFFERED_WITH.includes(String(body.offered_with) as typeof OFFERED_WITH[number])) {
    return 'Offered with must be all or programmes'
  }
  if ('activity_rate_id' in body && body.activity_rate_id !== null && body.activity_rate_id !== '' && typeof body.activity_rate_id !== 'string') {
    return 'activity_rate_id must be an id'
  }
  return null
}
