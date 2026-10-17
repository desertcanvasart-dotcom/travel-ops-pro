// ============================================
// Keeping a trip's pending commissions in step with its service prices
// ============================================
// The database side of lib/commission-price-changes.ts, shared by "Generate
// commissions" on the trip and "Recalculate from price" on the Commissions page.

import { planPriceChanges, type ExistingLinkedCommission, type PriceChangePlan } from './commission-price-changes'
import type { CommissionContext, CommissionSourceService } from './commission-generation'

/** Minimal client shape: the service-role client the routes already hold. */
type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export interface TripForCommissions {
  id: string
  itinerary_code: string
  status?: string | null
  start_date?: string | null
  currency?: string | null
  client?: { id?: string | null } | null
}

export type LoadedTrip =
  | { ok: true; trip: TripForCommissions; services: CommissionSourceService[]; ctx: CommissionContext }
  | { ok: false; status: 404 | 500; error: string }

/**
 * The trip and its priced services, in the shape buildCommissions reads.
 *
 * A supplier that is not this company's is treated as absent: a commission must
 * never carry another company's supplier, name or rate.
 */
export async function loadTripServices(supabase: DbClient, orgId: string, itineraryId: string): Promise<LoadedTrip> {
  const { data: trip, error: tripError } = await supabase
    .from('itineraries')
    .select('*, client:clients(id, first_name, last_name, email)')
    .eq('id', itineraryId)
    .eq('org_id', orgId)
    .single()
  if (tripError || !trip) return { ok: false, status: 404, error: 'Itinerary not found' }

  const { data: days, error: daysError } = await supabase
    .from('itinerary_days')
    .select('id')
    .eq('itinerary_id', itineraryId)
  if (daysError || !days) return { ok: false, status: 500, error: 'Failed to fetch itinerary days' }

  const { data: rows, error: servicesError } = await supabase
    .from('itinerary_services')
    // Two FKs point at suppliers (provider + seller) since
    // 20260822_service_sold_by.sql, so each embed names its column — an
    // unhinted `suppliers(...)` is PGRST201 (ambiguous) from then on.
    .select('id, service_type, service_name, client_price, total_cost, supplier_id, commission_rate, commission_status, sold_by_supplier_id, supplier:suppliers!supplier_id(id, name, org_id, commission_type, default_commission_rate), seller:suppliers!sold_by_supplier_id(id, name, org_id, commission_type, default_commission_rate)')
    .in('itinerary_day_id', days.map((d: { id: string }) => d.id))
  if (servicesError) {
    console.error('Error fetching services for commissions:', servicesError)
    return { ok: false, status: 500, error: 'Failed to fetch services' }
  }

  const own = <T extends { org_id?: string | null }>(row: T | null | undefined) => (row && row.org_id === orgId ? row : null)
  const services = ((rows ?? []) as Array<Record<string, unknown>>).map(s => {
    // PostgREST types an embedded row as an array; take the single row.
    const supplier = Array.isArray(s.supplier) ? s.supplier[0] : s.supplier
    const seller = Array.isArray(s.seller) ? s.seller[0] : s.seller
    return { ...s, supplier: own(supplier as { org_id?: string | null } | null), seller: own(seller as { org_id?: string | null } | null) }
  }) as unknown as CommissionSourceService[]

  return {
    ok: true,
    trip: trip as TripForCommissions,
    services,
    ctx: {
      orgId,
      itineraryId,
      itineraryCode: trip.itinerary_code,
      clientId: trip.client?.id || null,
      startDate: trip.start_date,
      currency: trip.currency,
    },
  }
}

export interface PriceSyncResult extends PriceChangePlan {
  /** A recalculation that could not be written (e.g. the commission was paid in the meantime). */
  failed: string[]
}

/**
 * Recalculate this trip's pending commissions whose service price changed, and
 * flag the settled ones. Writes are conditional on the commission still being
 * pending, so one paid between the read and the write is left as it is.
 */
export async function syncCommissionPrices(
  supabase: DbClient,
  orgId: string,
  loaded: { services: CommissionSourceService[]; ctx: CommissionContext }
): Promise<PriceSyncResult> {
  const failed: string[] = []
  const { data: existing, error } = await supabase
    .from('commissions')
    .select('id, service_id, supplier_id, commission_type, description, status, base_amount, cost_amount, commission_rate, commission_amount')
    .eq('org_id', orgId)
    .eq('itinerary_id', loaded.ctx.itineraryId)
    .not('service_id', 'is', null)
  if (error) {
    console.error('Error reading commissions for the price check:', error)
    return { recalculated: [], flagged: [], failed: ['read'] }
  }

  const plan = planPriceChanges(loaded.services, existing ?? [], loaded.ctx)

  const done = []
  for (const r of plan.recalculated) {
    const { data, error: updateError } = await supabase
      .from('commissions')
      .update({ ...r.update, updated_at: new Date().toISOString() })
      .eq('id', r.commission_id)
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .select('id')
    if (updateError) {
      console.error('Error recalculating commission:', updateError)
      failed.push(r.commission_id)
    } else if (!data || data.length === 0) {
      failed.push(r.commission_id)
    } else {
      done.push(r)
    }
  }
  return { recalculated: done, flagged: plan.flagged, failed }
}

/** Statuses whose figure is never recalculated, so a changed price is only flagged. */
const FLAGGED_STATUSES = new Set(['paid', 'received', 'invoiced', 'disputed'])

/**
 * Commission id -> status for every settled/invoiced/disputed commission in
 * `rows` whose linked service now prices differently. Computed on every list
 * load, so the "price changed since paid" label does not depend on pressing
 * Recalculate. Nothing is stored. A trip that cannot be read is skipped.
 */
export async function priceChangeFlags(
  supabase: DbClient,
  orgId: string,
  rows: Array<ExistingLinkedCommission & { itinerary_id?: string | null }>,
  maxTrips = 200
): Promise<Record<string, string>> {
  const byTrip = new Map<string, ExistingLinkedCommission[]>()
  for (const r of rows) {
    if (!r.itinerary_id || !r.service_id || !r.status || !FLAGGED_STATUSES.has(r.status)) continue
    byTrip.set(r.itinerary_id, [...(byTrip.get(r.itinerary_id) ?? []), r])
  }
  const flags: Record<string, string> = {}
  for (const [tripId, commissions] of Array.from(byTrip).slice(0, maxTrips)) {
    const loaded = await loadTripServices(supabase, orgId, tripId)
    if (!loaded.ok) continue
    for (const f of planPriceChanges(loaded.services, commissions, loaded.ctx).flagged) flags[f.commission_id] = f.status
  }
  return flags
}
