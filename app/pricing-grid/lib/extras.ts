// ============================================
// The grid's extras — Sell → Extras offered on this trip, priced
// ============================================
// The grid offered no extras: they reached a quote only through the B2B
// calculator or a booking afterwards. The list is the one every reader uses
// (lib/extras/offered.ts): every-booking extras plus those linked to the
// trip's programme, at the programme's price; an extra linked to an
// Activities rate takes its cost from it for the group. The money rule is
// lib/pricing/extras-pricing.ts: a set selling price IS the price (no margin
// on top), a blank one is cost + the quote's margin, and no cost and no price
// is an unpriced hole — never 0.
//
// Pure, so the page and the save price an extra the same way: the page from
// the rows /api/pricing-grid/extras sent, the save from the rows it reads
// itself (never the request's figures).

import { withActivityCost, type ActivityRateRow, type OfferedExtra } from '@/lib/extras/offered'
import { priceExtras, type CatalogueExtra, type ExtrasPricing } from '@/lib/pricing/extras-pricing'
import { roundToCurrency } from '@/lib/currency-totals'

/** An extra chosen on the grid. The name is kept so an extra no longer
 *  offered on the trip can still be named when it is left out. */
export interface GridExtraPick {
  id: string
  name?: string
}

/** An offered extra as the grid lists it, its cost for this group. */
export type GridExtraOption = OfferedExtra & {
  /** The Activities rate the cost comes from, by name (display only). */
  activity_name?: string | null
}

export interface GridExtrasPricing extends ExtrasPricing {
  /** Σ what the extras sell for before any season premium: cost-only lines
   *  at the quote's margin, set prices as they are. */
  sell_total: number
}

/** The offered extras with each activity-linked one's cost for `pax`. The
 *  rows must already be in the rate currency (the extras route normalises). */
export function gridExtraOptions(
  extras: readonly GridExtraOption[],
  activities: readonly ActivityRateRow[],
  pax: number,
  isEurPassport: boolean
): GridExtraOption[] {
  const byId = new Map(activities.map(a => [a.id, a]))
  return extras.map(x => withActivityCost(x, x.activity_rate_id ? byId.get(x.activity_rate_id) : null, pax, isEurPassport))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The picks a request carries, cleaned: ids only, each once, at most 50. */
export function sanitizeExtraPicks(raw: unknown): GridExtraPick[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: GridExtraPick[] = []
  for (const r of raw) {
    const id = typeof r === 'string' ? r : (r && typeof r === 'object' ? (r as { id?: unknown }).id : null)
    if (typeof id !== 'string' || !UUID.test(id) || seen.has(id)) continue
    seen.add(id)
    const name = r && typeof r === 'object' ? (r as { name?: unknown }).name : undefined
    out.push(typeof name === 'string' && name.trim() ? { id, name: name.trim().slice(0, 200) } : { id })
    if (out.length >= 50) break
  }
  return out
}

/**
 * Price the picked extras for the group. A pick the trip is no longer
 * offered (withdrawn, or another programme's) is a hole that names it — a
 * quote must not quietly lose something the operator chose, nor sell it.
 */
export function priceGridExtras(
  options: readonly GridExtraOption[],
  picks: readonly GridExtraPick[],
  pax: number,
  marginPercent: number
): GridExtrasPricing {
  const offered = new Set(options.map(o => o.id))
  const missing = picks.filter(p => !offered.has(p.id))
  const p = priceExtras(options as unknown as CatalogueExtra[], picks.filter(p => offered.has(p.id)), pax)
  for (const m of missing) {
    p.holes.push({ kind: 'extra', message: `"${m.name || 'An extra'}" is no longer offered on this trip, so it was left out.` })
  }
  const m = Number.isFinite(marginPercent) ? marginPercent : 0
  return { ...p, sell_total: Math.round((p.margined_cost * (1 + m / 100) + p.pinned_sell) * 100) / 100 }
}

/** What one priced line sells for before any premium. */
export function extraLineSell(line: ExtrasPricing['lines'][number], marginPercent: number): number | null {
  if (line.extra.pinned) return line.extra.sell_total
  if (!line.extra.cost_known) return null
  return Math.round(line.line_total * (1 + marginPercent / 100) * 100) / 100
}

/** The tag a saved extra line carries: no grid slot is named "extra", so a
 *  reload leaves it out of the day's picks (slot-mapping) and reads it here. */
export const EXTRA_LINE_TAG = '__grid:slot:extra|extra_id:'

/**
 * The itinerary_services rows of the picked extras — trip-level lines, put
 * on the first day. Cost is the cost; client_price is the set price, or the
 * cost at the quote's margin. An unpriced extra is saved with no price and
 * said so by the save (its holes), like any pick with no rate.
 */
export function extraServiceRows(
  pricing: ExtrasPricing,
  options: readonly Pick<GridExtraOption, 'id' | 'supplier_id'>[],
  marginPercent: number,
  rateCurrency: string
) {
  const supplierOf = new Map(options.map(o => [o.id, o.supplier_id ?? null]))
  return pricing.lines.map(line => {
    const sell = extraLineSell(line, marginPercent)
    return {
      service_type: 'extra',
      service_name: line.service_name,
      quantity: line.quantity,
      rate_eur: line.unit_cost,
      rate_non_eur: line.unit_cost,
      total_cost: roundToCurrency(line.line_total, rateCurrency),
      client_price: roundToCurrency(sell ?? 0, rateCurrency),
      supplier_id: supplierOf.get(line.service_id) ?? null,
      notes: `${EXTRA_LINE_TAG}${line.service_id}`,
    }
  })
}

/** The extras a saved trip carries, read back from its lines (any day). */
export function extraPicksFromServices(services: readonly { notes?: string | null; description?: string | null; service_name?: string | null }[]): GridExtraPick[] {
  // The tag is in notes (the save RPC writes no description); description is
  // read too, as slot-mapping reads it first.
  const out: GridExtraPick[] = []
  const seen = new Set<string>()
  for (const s of services) {
    const meta = `${s.notes ?? ''} ${s.description ?? ''}`
    const at = meta.indexOf(EXTRA_LINE_TAG)
    if (at === -1) continue
    const id = meta.slice(at + EXTRA_LINE_TAG.length).match(/^[0-9a-f-]{36}/i)?.[0]
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(s.service_name ? { id, name: s.service_name } : { id })
  }
  return out
}
