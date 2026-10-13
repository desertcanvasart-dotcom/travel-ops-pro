// ============================================
// A B2B quote's price, from the server's own engine
// ============================================
// POST /api/b2b/quotes stored total_cost, selling_price, price_per_person and
// the service lines exactly as the browser sent them. Anyone allowed to save a
// quote could save a 5,000 trip at 1, mark it accepted, convert it and book
// it at 1. And the season premium the calculator priced in was never stored —
// only its name — so the quote's breakdown (cost + margin + tour leader) did
// not add up to its selling price, and revisions carried a premium of 0.
//
// Now the route takes the calculator's INPUTS (variation, party, date,
// passport, margin, tier, guide, tour leader, chosen options and extras), runs
// the same engine the calculator ran (/api/b2b/calculate-price), and stores
// what the engine says. These are the two pure halves of that: what to ask the
// engine, and which quote columns its answer fills.

import { isBookableLine } from '@/lib/pricing/breakdown-order'
import { currencyDecimals } from '@/lib/currency-totals'

/** The pricing inputs a client may send, as the engine reads them. */
export function enginePricingRequest(body: Record<string, unknown>): Record<string, unknown> {
  const adults = Math.max(1, Math.floor(Number(body.num_adults) || 2))
  const children = Math.max(0, Math.floor(Number(body.num_children) || 0))
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [])
  return {
    variation_id: body.variation_id,
    // The calculator prices a party as num_pax; a breakdown only when there
    // are children (their discount is the engine's).
    ...(children > 0 ? { num_adults: adults, num_children: children } : { num_pax: adults }),
    travel_date: typeof body.travel_date === 'string' && body.travel_date ? body.travel_date : undefined,
    is_eur_passport: body.is_eur_passport !== false,
    margin_percent: body.margin_percent ?? null,
    tier: typeof body.tier === 'string' && body.tier ? body.tier : 'standard',
    language: typeof body.language === 'string' && body.language ? body.language : 'English',
    tour_leader_included: body.tour_leader_included === true,
    guide_grade: body.guide_grade === 'senior' ? 'senior' : 'egyptologist',
    guide_mode: body.guide_mode === 'throughout' ? 'throughout' : 'spot',
    selected_optional_ids: ids(body.selected_optional_ids),
    extras: ids(body.extras),
  }
}

type EngineLine = Record<string, unknown> & { unpriced?: boolean; included?: boolean; issue?: string; is_selected?: boolean }
export interface EngineResult {
  services?: EngineLine[]
  optional_services?: EngineLine[]
  total_cost?: number
  margin_percent?: number
  margin_amount?: number
  selling_price?: number
  price_per_person?: number
  tour_leader_cost?: number
  single_supplement?: number
  currency?: string
  season_uplift?: { season_name: string; percent: number; amount: number } | null
}

/** The quote columns the engine's answer fills — every money figure on the quote. */
export function quoteColumnsFromEngine(r: EngineResult) {
  const season = r.season_uplift ?? null
  return {
    // The real services and the options the customer is buying, as the
    // calculator saved them (docs/plans/extras-and-upgrades.md §5a).
    services_snapshot: [
      ...(r.services ?? []).filter(isBookableLine),
      ...(r.optional_services ?? []).filter((s) => s.is_selected),
    ],
    total_cost: Number(r.total_cost) || 0,
    margin_percent: Number(r.margin_percent) || 0,
    margin_amount: Number(r.margin_amount) || 0,
    selling_price: Number(r.selling_price) || 0,
    price_per_person: Number(r.price_per_person) || 0,
    tour_leader_cost: Number(r.tour_leader_cost) || null,
    single_supplement: Number(r.single_supplement) || null,
    currency: r.currency || null,
    // The premium is part of the selling price; stored so the breakdown adds up.
    season: season?.season_name ? season.season_name.slice(0, 20) : null,
    season_name: season?.season_name ?? null,
    season_uplift_percent: Number(season?.percent) || 0,
    season_uplift_amount: Number(season?.amount) || 0,
  }
}

/**
 * Did the price the operator was shown move before the save? (Rates edited,
 * the season calendar changed, or a crafted body.) More than one minor unit
 * apart counts; the save is refused so nobody stores a price they never saw.
 */
export function priceMoved(shown: unknown, server: number, currency: string | null | undefined): boolean {
  if (shown === undefined || shown === null || shown === '') return false
  const n = Number(shown)
  if (!Number.isFinite(n)) return true
  const unit = currencyDecimals(currency || 'EUR') === 0 ? 1 : 0.01
  return Math.abs(n - server) > unit + 1e-9
}
