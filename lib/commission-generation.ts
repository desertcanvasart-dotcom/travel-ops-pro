// ============================================
// COMMISSION GENERATION — turning priced services into commission records
// ============================================
// Extracted from app/api/itineraries/[id]/generate-commissions so the mapping
// is testable without a database, and because the route had never actually run:
// it queried `itinerary_services.day_id` (the real column is
// `itinerary_day_id`), so PostgREST answered 42703 and the route returned
// "Failed to fetch services" every single time. It also read `selling_price`,
// `cost` and `description`, none of which exist — the real columns are
// `client_price`, `total_cost` and `service_name` — and mapped service types
// ('hotel', 'transport', 'restaurant') that the app never writes.
//
// That is why the commissions table has zero rows, which now matters beyond
// this route: the P&L subtracts payable commissions from trip margin
// (lib/trip-pnl.ts), so while the generator is broken every trip reports its
// full gross as net.
//
// WHY SKIPS ARE REPORTED
//
// Today NO service in the database carries a commission rate (12 of 89 have a
// supplier at all; 0 have a rate, and every supplier's default_commission_rate
// is 0 or null). So a correct run still produces zero commissions. Returning a
// bare "generated: 0" would be indistinguishable from the broken behaviour it
// replaces, so every skipped service is returned with the reason.

import { SERVICE_TYPE_ROUTING } from './departments'

/**
 * Commission categories the UI can render (app/commissions/page.tsx
 * CATEGORY_CONFIG). Emitting anything outside this set renders as a blank chip,
 * so the mapping below is deliberately closed.
 */
export type CommissionCategory =
  | 'hotel'
  | 'shopping'
  | 'restaurant'
  | 'transport'
  | 'cruise'
  | 'attraction'
  | 'optional_tour'
  | 'activity'
  | 'show'
  | 'spa'
  | 'agent_referral'
  | 'partner'
  | 'other'

/**
 * service_type → commission category.
 *
 * Keyed on the values the app ACTUALLY writes (see lib/departments.ts, which
 * carries the canonical list). Both spellings of the airport/hotel service
 * types are present for the same reason they are there: today's code writes the
 * singular, older rows carry the plural.
 */
export const SERVICE_TYPE_TO_CATEGORY: Readonly<Record<string, CommissionCategory>> = {
  accommodation: 'hotel',
  hotel_service: 'hotel',
  hotel_services: 'hotel',
  meal: 'restaurant',
  transportation: 'transport',
  airport_service: 'transport',
  airport_services: 'transport',
  flight: 'transport',
  cruise: 'cruise',
  entrance: 'attraction',
  activity: 'activity',
  // No 'guide'/'tips'/'supplies' category exists in the UI. 'other' keeps the
  // commission visible rather than inventing a chip that renders blank.
  guide: 'other',
  tips: 'other',
  supplies: 'other',
}

export interface CommissionSupplier {
  id?: string | null
  name?: string | null
  /** 'payable' (we owe them) or 'receivable' (they owe us). */
  commission_type?: string | null
  default_commission_rate?: number | string | null
}

export interface CommissionSourceService {
  id: string
  service_type?: string | null
  service_name?: string | null
  /** What we charge the client. NOT the commission base — see buildCommissions. */
  client_price?: number | string | null
  /** What the supplier charges us. This is the commission base. */
  total_cost?: number | string | null
  supplier_id?: string | null
  commission_rate?: number | string | null
  commission_status?: string | null
  supplier?: CommissionSupplier | null
}

export interface CommissionContext {
  orgId: string
  itineraryId: string
  itineraryCode: string
  clientId?: string | null
  /** The trip's start date — the date the commission is booked against. */
  startDate?: string | null
  /** The trip's currency. base_amount is stored in it, so it must match. */
  currency?: string | null
  /** Injected for testability; defaults to today. */
  today?: string
}

export interface CommissionRow {
  org_id: string
  itinerary_id: string
  supplier_id: string | null
  client_id: string | null
  commission_type: string
  category: CommissionCategory
  source_name: string | null
  description: string
  base_amount: number
  commission_rate: number
  commission_amount: number
  currency: string
  status: string
  transaction_date: string
  notes: string
}

export type SkipReason =
  | 'already_generated'
  | 'no_supplier'
  | 'no_rate'
  | 'no_base_amount'

export interface SkippedService {
  service_id: string
  service_name: string
  reason: SkipReason
  detail: string
}

export interface CommissionPair {
  serviceId: string
  commission: CommissionRow
}

export interface BuildCommissionsResult {
  pairs: CommissionPair[]
  skipped: SkippedService[]
}

const SKIP_DETAIL: Record<SkipReason, string> = {
  already_generated: 'A commission has already been generated for this service.',
  no_supplier: 'No supplier is linked, so there is nobody to owe or be owed.',
  no_rate:
    'Neither the service nor the supplier carries a commission rate. Set the rate on the supplier (default_commission_rate) or on the service.',
  no_base_amount:
    'The service has no supplier cost to calculate a commission from. Commission is a percentage of the SUPPLIER price, so a service priced only to the client is skipped rather than commissioned off our markup.',
}

const toNumber = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Build the commission rows for a trip's services.
 *
 * Returns (serviceId, commission) PAIRS rather than two parallel arrays. That
 * pairing is load-bearing: the route claims and inserts BY ID, and an earlier
 * version built the two arrays from different filter chains and matched them by
 * position — so one skipped service silently attributed every later commission
 * to the wrong row.
 */
export function buildCommissions(
  services: CommissionSourceService[],
  ctx: CommissionContext
): BuildCommissionsResult {
  const pairs: CommissionPair[] = []
  const skipped: SkippedService[] = []

  const currency = (ctx.currency || 'EUR').toUpperCase()
  const transactionDate =
    ctx.startDate || ctx.today || new Date().toISOString().split('T')[0]

  const skip = (s: CommissionSourceService, reason: SkipReason) => {
    skipped.push({
      service_id: s.id,
      service_name: s.service_name || s.service_type || 'service',
      reason,
      detail: SKIP_DETAIL[reason],
    })
  }

  for (const s of services) {
    // Already claimed by a previous run. Regenerating would double-count.
    if (s.commission_status && s.commission_status !== 'pending') {
      skip(s, 'already_generated')
      continue
    }

    if (!s.supplier || !s.supplier_id) {
      skip(s, 'no_supplier')
      continue
    }

    const rate = toNumber(s.commission_rate) || toNumber(s.supplier.default_commission_rate)
    if (rate <= 0) {
      skip(s, 'no_rate')
      continue
    }

    // The SUPPLIER's price, not ours (operator decision, 2026-08-12): a
    // supplier's commission is a percentage of what they charge, so our markup
    // must not be in the base. The pre-existing code used `selling_price ||
    // cost` — the client price first — which would have over-claimed against
    // every supplier by the size of our margin.
    //
    // Deliberately NO fallback to client_price: a service with no supplier cost
    // is skipped, not priced off the marked-up figure. Falling back would
    // reintroduce the exact error this line exists to prevent, on precisely the
    // rows where nobody would notice.
    const baseAmount = toNumber(s.total_cost)
    if (baseAmount <= 0) {
      skip(s, 'no_base_amount')
      continue
    }

    const serviceType = (s.service_type || '').trim().toLowerCase()

    pairs.push({
      serviceId: s.id,
      commission: {
        org_id: ctx.orgId,
        itinerary_id: ctx.itineraryId,
        supplier_id: s.supplier_id,
        client_id: ctx.clientId || null,
        // Falls back to 'receivable': the common case is a supplier owing us.
        commission_type: s.supplier.commission_type || 'receivable',
        category: SERVICE_TYPE_TO_CATEGORY[serviceType] || 'other',
        source_name: s.supplier.name || null,
        description: `${s.service_name || s.service_type || 'Service'} - ${ctx.itineraryCode}`,
        base_amount: baseAmount,
        commission_rate: rate,
        // (base × rate / 100) rounded to cents. That is algebraically
        // Math.round(base × rate) / 100 — the two /100s cancel — which looks
        // like a missing division but is not. Rounding matters because this
        // number reaches the ledger and the P&L, where 12.340000000000002 is
        // noise nobody can reconcile.
        commission_amount: Math.round(baseAmount * rate) / 100,
        // The trip's currency, NOT a hardcoded EUR. The P&L converts a
        // commission at the rate on its own date, so a wrong currency label
        // silently converts a real amount into a wrong one.
        currency,
        status: 'pending',
        transaction_date: transactionDate,
        notes: `Auto-generated from itinerary ${ctx.itineraryCode}`,
      },
    })
  }

  return { pairs, skipped }
}

/** Group skip reasons into a short summary for the API response. */
export function summariseSkips(skipped: SkippedService[]): Record<string, number> {
  const summary: Record<string, number> = {}
  for (const s of skipped) summary[s.reason] = (summary[s.reason] || 0) + 1
  return summary
}

/** Service types the commission mapper knows, for a drift check against routing. */
export function unmappedServiceTypes(): string[] {
  return Object.keys(SERVICE_TYPE_ROUTING).filter(
    t => !(t in SERVICE_TYPE_TO_CATEGORY) && !['invoice', 'payment', 'commission'].includes(t)
  )
}
