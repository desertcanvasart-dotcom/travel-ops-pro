// ============================================
// Make a rate-form body safe to hand to .update()
// ============================================
// The rate forms post their whole state. Three PUT routes (hotel-services,
// airport-services, tipping) passed that body straight to Supabase's
// .update(body). The POST routes had learned to sanitise; the PUTs never did.
//
// What broke: a rate with no supplier arrives as `supplier_id: ''`. The column
// is a uuid, Postgres refuses the empty string, and the operator sees
// "Internal server error" on every edit of a supplier-less rate — which, the
// day this was found, was every hotel and airport rate. It surfaced when the
// operator tried to price the porter row (2026-08-21).
//
// Rules, in order:
//   1. Never let the client rewrite identity/audit columns.
//   2. '' on a nullable non-text column means "absent"; send null.
//   3. The same money-value checks the POST routes already run.
// ============================================

import { validateRatePayload, type RateValidationResult } from '@/lib/rate-validation'

/** Columns a client must not set on an existing row. */
const PROTECTED = ['id', 'created_at', 'updated_at', 'org_id', 'organization_id'] as const

/** Nullable columns the forms send as '' when unset. uuid/date — not text. */
const EMPTY_MEANS_NULL = [
  'supplier_id',
  'destination',
  'rate_valid_from',
  'rate_valid_to',
  // '' would violate the rate_currency CHECK; blank means "org default" = NULL
  'rate_currency',
  'valid_from',
  'valid_to',
] as const

export type SanitisedUpdate =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; status: 400; error: string; violations?: string[] }

export function sanitizeRateUpdate(body: unknown): SanitisedUpdate {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'Request body must be an object.' }
  }

  const payload: Record<string, unknown> = { ...(body as Record<string, unknown>) }

  for (const key of PROTECTED) delete payload[key]

  for (const key of EMPTY_MEANS_NULL) {
    if (key in payload && (payload[key] === '' || payload[key] === undefined)) payload[key] = null
  }

  const check: RateValidationResult = validateRatePayload(payload)
  if (!check.ok) {
    return { ok: false, status: 400, error: 'Invalid rate values', violations: check.errors }
  }

  if (Object.keys(payload).length === 0) {
    return { ok: false, status: 400, error: 'Nothing to update.' }
  }

  return { ok: true, payload }
}
