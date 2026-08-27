// ============================================
// The exchange rate an itinerary lives on
// ============================================
// While a quotation is being prepared it converts at the CURRENT rate; the
// moment it is confirmed, the rates in force are frozen onto the file
// (itineraries.fx_frozen, migration 20260827_itinerary_fx_freeze.sql).
// Without that, a trip nobody touched would report a different cost and a
// different margin two months later purely because the pound moved. With it,
// a margin only changes when a person deliberately re-prices the file — an
// action that carries their name (source: 'reprice', frozen_by, plus the
// middleware activity log row for the POST itself).
//
// Decided 2026-08-27, plan §7 (docs/plans/per-rate-currency.md):
//   - freeze ONCE, at the first transition to confirmed; un-confirming and
//     re-confirming does not silently re-freeze
//   - services added after approval inherit the FROZEN rate, so one file
//     never carries two rates for the same currency pair
//   - re-pricing recomputes each line from its preserved original
//     (supplier_cost_original × new rate) — the originals are never touched.

import { fetchExchangeRates, getExchangeRate, type ExchangeRates } from '@/lib/currency-service'
import { roundToCurrency } from '@/lib/currency-totals'

export interface FrozenFx {
  /** The org rate currency the rates are quoted against. */
  base: string
  /** 1 base = rates[X] units of X. */
  rates: Record<string, number>
  frozen_at: string
  frozen_by: string | null
  source: 'confirm' | 'reprice'
}

/** Shape-check a value read from itineraries.fx_frozen. */
export function parseFrozenFx(value: unknown): FrozenFx | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (typeof v.base !== 'string' || !v.rates || typeof v.rates !== 'object') return null
  return v as unknown as FrozenFx
}

/** Capture the current live rates as a frozen snapshot. */
export async function buildFrozenFx(
  baseCurrency: string,
  frozenBy: string | null,
  source: FrozenFx['source'],
  deps?: { getRates?: (base: string) => Promise<ExchangeRates> }
): Promise<FrozenFx> {
  const live = await (deps?.getRates ?? fetchExchangeRates)(baseCurrency)
  return {
    base: live.base || baseCurrency,
    rates: { ...live.rates },
    frozen_at: new Date().toISOString(),
    frozen_by: frozenBy,
    source,
  }
}

/** The frozen snapshot in the shape every engine helper already speaks. */
export function frozenToExchangeRates(fx: FrozenFx): ExchangeRates {
  return { base: fx.base, rates: fx.rates } as ExchangeRates
}

// ── Re-pricing ──────────────────────────────────────────────────────────────

export interface RepriceLineInput {
  id: string
  supplier_currency: string | null
  supplier_cost_original: number | string | null
  exchange_rate_used: number | string | null
  total_cost: number | string | null
}

export interface RepriceLineChange {
  id: string
  old_rate: number | null
  new_rate: number
  old_total: number
  new_total: number
}

export interface RepriceResult {
  /** Lines whose converted cost changes under the new rates. */
  changes: RepriceLineChange[]
  /** Lines in a foreign currency the new snapshot cannot convert — left
   *  untouched, because a wrong rate is worse than yesterday's. */
  unconvertible: Array<{ id: string; currency: string }>
  /** Sum of line costs after the re-price, over ALL lines given. */
  newSupplierCost: number
}

/**
 * Recompute converted line costs from their preserved originals under a new
 * rate snapshot. PURE — the caller applies the changes and owns the write.
 *
 * Only lines that were converted in the first place move: a line whose
 * supplier_currency is the itinerary's own currency (or unset — entered by
 * hand in the itinerary currency) has no FX in it and is passed through into
 * the sum unchanged. supplier_cost_original is read, never written.
 */
export function computeFxReprice(
  lines: RepriceLineInput[],
  itineraryCurrency: string,
  fx: FrozenFx
): RepriceResult {
  const rates = frozenToExchangeRates(fx)
  const changes: RepriceLineChange[] = []
  const unconvertible: RepriceResult['unconvertible'] = []
  let newSupplierCost = 0

  for (const line of lines) {
    const oldTotal = Number(line.total_cost) || 0
    const cur = (line.supplier_currency || '').trim().toUpperCase()
    const original = line.supplier_cost_original === null || line.supplier_cost_original === undefined
      ? null
      : Number(line.supplier_cost_original)

    // No foreign currency in this line — nothing to recompute.
    if (!cur || cur === itineraryCurrency.toUpperCase() || original === null || !Number.isFinite(original)) {
      newSupplierCost += oldTotal
      continue
    }

    const rate = getExchangeRate(cur, itineraryCurrency, rates)
    if (!rate || !Number.isFinite(rate) || rate <= 0) {
      unconvertible.push({ id: line.id, currency: cur })
      newSupplierCost += oldTotal
      continue
    }

    const newTotal = roundToCurrency(original * rate, itineraryCurrency)
    newSupplierCost += newTotal
    if (newTotal !== oldTotal || Number(line.exchange_rate_used) !== rate) {
      changes.push({
        id: line.id,
        old_rate: Number(line.exchange_rate_used) || null,
        new_rate: rate,
        old_total: oldTotal,
        new_total: newTotal,
      })
    }
  }

  return { changes, unconvertible, newSupplierCost: roundToCurrency(newSupplierCost, itineraryCurrency) }
}
