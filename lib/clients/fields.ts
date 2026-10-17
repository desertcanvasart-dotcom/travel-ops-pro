// Which clients columns a caller may write, and how each is cleaned.
//
// PUT and PATCH /api/clients/[id] passed the whole body to .update(): a caller
// could overwrite client_code (install-wide unique), the revenue and booking
// counters the invoice and trip triggers own, created_by, and any key that is
// not a column made the request a 500. And the new-client form wrote '' (not
// NULL) for every blank text box. This is the one list both routes use — the
// columns the New client and Edit client forms write, and nothing else.
import { isClientStatus, CLIENT_STATUSES } from './status'

/** Text columns: surrounding space is dropped and a blank becomes NULL. */
const TEXT_FIELDS = [
  'email', 'phone', 'alternative_phone', 'nationality', 'passport_type',
  'preferred_language', 'country', 'city', 'address_line1', 'address_line2',
  'postal_code', 'preferred_contact_method', 'best_time_to_contact', 'timezone',
  'preferred_accommodation_level', 'company_name', 'job_title', 'client_type',
  'client_source', 'lead_source', 'currency_preference', 'internal_notes',
  'referred_by_client_id',
] as const

const BOOLEAN_FIELDS = [
  'vip_status', 'marketing_consent', 'newsletter_subscribed', 'sms_consent', 'is_travel_agent',
] as const

const ARRAY_FIELDS = ['dietary_restrictions', 'accessibility_needs', 'special_interests', 'tags'] as const

/** Every key a caller may send. Anything else is ignored, never written. */
export const EDITABLE_CLIENT_FIELDS: readonly string[] = [
  'first_name', 'last_name', 'status', 'date_of_birth', 'agent_commission_rate', 'rating',
  ...TEXT_FIELDS, ...BOOLEAN_FIELDS, ...ARRAY_FIELDS,
]

export type ClientFieldsResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string }

const blankToNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/**
 * The columns to write from a request body.
 *
 * 'create' requires a first name; 'update' touches only the keys that were
 * sent (a PATCH of {status} changes the status and nothing else). A status
 * must be one of the four the database allows. Names are NOT NULL columns, so
 * they may be trimmed but not blanked (a missing last name on create is '',
 * not a copy of the first name).
 */
export function pickClientFields(body: unknown, mode: 'create' | 'update'): ClientFieldsResult {
  const src = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>
  const data: Record<string, unknown> = {}

  if ('first_name' in src || mode === 'create') {
    const first = typeof src.first_name === 'string' ? src.first_name.trim() : ''
    if (!first) return { ok: false, error: 'First name is required' }
    data.first_name = first
  }
  if ('last_name' in src) {
    data.last_name = typeof src.last_name === 'string' ? src.last_name.trim() : ''
  } else if (mode === 'create') {
    data.last_name = ''
  }

  if ('status' in src && src.status !== undefined && src.status !== null && src.status !== '') {
    if (!isClientStatus(src.status)) {
      return { ok: false, error: `Status must be one of: ${CLIENT_STATUSES.join(', ')}` }
    }
    data.status = src.status
  }

  for (const key of TEXT_FIELDS) {
    if (key in src) data[key] = blankToNull(src[key])
  }
  if ('date_of_birth' in src) data.date_of_birth = blankToNull(src.date_of_birth)

  for (const key of BOOLEAN_FIELDS) {
    if (key in src) data[key] = src[key] === true
  }

  for (const key of ARRAY_FIELDS) {
    if (!(key in src)) continue
    const v = src[key]
    data[key] = Array.isArray(v)
      ? v.map(x => String(x).trim()).filter(Boolean)
      : []
  }

  if ('agent_commission_rate' in src) {
    const n = src.agent_commission_rate === null || src.agent_commission_rate === '' ? null : Number(src.agent_commission_rate)
    data.agent_commission_rate = n !== null && Number.isFinite(n) ? n : null
  }
  if ('rating' in src) {
    const n = src.rating === null || src.rating === '' ? null : Number(src.rating)
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 5)) {
      return { ok: false, error: 'Rating must be a whole number from 1 to 5' }
    }
    data.rating = n
  }

  return { ok: true, data }
}
