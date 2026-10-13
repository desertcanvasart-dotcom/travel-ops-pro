// ============================================
// The row POST /api/itineraries may write
// ============================================
// The route inserted the request body as it came, forcing only org_id: id,
// total_paid, payment_status, fx_frozen, status, the guide and vehicle — any
// column — were taken from the caller. A new trip is a draft built from the
// fields the New Itinerary form (and the other callers) actually send; every
// other column keeps its database default. The foreign ids among these are
// checked against the company by the route (lib/itineraries/trip-refs).

import { normaliseRateCurrency } from '@/lib/org-rate-currency'

export const NEW_TRIP_FIELDS = [
  'client_name', 'client_email', 'client_phone', 'client_id',
  'trip_name', 'start_date', 'end_date', 'total_days',
  'num_adults', 'num_children', 'num_infants',
  'currency', 'notes', 'template_id', 'destination_id',
  'tier', 'package_type', 'pickup_location', 'pickup_time', 'guide_notes', 'vehicle_notes',
] as const

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Days between two ISO dates, both ends included; 1 when either is missing. */
export function totalDaysBetween(startDate: unknown, endDate: unknown): number {
  if (typeof startDate !== 'string' || typeof endDate !== 'string' || !DATE.test(startDate) || !DATE.test(endDate)) return 1
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)
  return Math.abs(Math.round(ms / 86_400_000)) + 1
}

const count = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

export function newTripRow(
  body: Record<string, unknown>,
  ctx: { orgId: string; defaultCurrency: string; now?: string }
): { row: Record<string, unknown> } | { error: string } {
  const row: Record<string, unknown> = {}
  for (const field of NEW_TRIP_FIELDS) {
    if (body[field] !== undefined) row[field] = body[field] === '' ? null : body[field]
  }

  if (row.currency != null) {
    const currency = normaliseRateCurrency(row.currency)
    if (!currency) return { error: `Unsupported currency: ${String(row.currency)}` }
    row.currency = currency
  } else {
    row.currency = ctx.defaultCurrency
  }

  for (const d of ['start_date', 'end_date'] as const) {
    if (row[d] != null && (typeof row[d] !== 'string' || !DATE.test(row[d] as string))) return { error: `${d} must be a date (YYYY-MM-DD)` }
  }

  if (!row.total_days) row.total_days = totalDaysBetween(row.start_date, row.end_date)
  row.num_adults = count(row.num_adults, 1) || 1
  row.num_children = count(row.num_children, 0)
  if (row.num_infants !== undefined) row.num_infants = count(row.num_infants, 0)

  const now = ctx.now ?? new Date().toISOString()
  return {
    row: {
      ...row,
      org_id: ctx.orgId,
      status: 'draft',
      total_cost: 0,
      created_at: now,
      updated_at: now,
    },
  }
}
