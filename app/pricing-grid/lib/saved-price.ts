// ============================================
// A line with no current rate keeps the price it was saved with
// ============================================
// Every pick is priced from the rate it names (hydrate-items.ts). A loaded
// itinerary's line that names no rate — saved before rate ids were stored,
// or typed in — or whose rate was since deleted or switched off, then had no
// price at all, and the next save wrote it at 0: the trip's real price was
// lost on a re-save.
//
// Such a line now keeps the unit price stored on its itinerary_services row,
// marked on screen as a saved price not linked to a current rate. The grid
// carries the row's id (SelectedItem.serviceId); the save never takes the
// browser's word for the price — it reads the row again, of THAT itinerary
// (applyStoredPrices). A line whose rate is current is still priced from it.
//
// Pure: the page, the save route and the tests share it.

import { getExchangeRate, type ExchangeRates } from '@/lib/currency-service'
import type { GridDay, SelectedItem } from '../types'

/** The columns of an itinerary_services row this reads. */
export interface StoredServiceRow {
  id: string
  rate_eur: number | string | null
  rate_non_eur: number | string | null
  supplier_currency?: string | null
  exchange_rate_used?: number | string | null
}

export interface StoredPrice {
  rateEur: number
  rateNonEur: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * The row's unit prices in the grid's RATE currency, or null when they cannot
 * be put in it. A row's unit prices are in its supplier_currency (the AI
 * writer and the editor store the rate there and convert only total_cost);
 * a row with none was entered in the itinerary's currency (lib/itinerary-fx).
 * Converted by the line's own exchange_rate_used when that is what turned its
 * supplier currency into the rate currency, else at today's rates; with no
 * rate at all, null — never a number in the wrong currency.
 */
export function storedUnitPrice(
  row: StoredServiceRow,
  ctx: { itineraryCurrency?: string | null; rateCurrency?: string | null; fxRates?: ExchangeRates | null },
): StoredPrice | null {
  const eur = Number(row.rate_eur) || 0
  const nonEur = Number(row.rate_non_eur) || 0
  const rateCurrency = (ctx.rateCurrency || '').toUpperCase()
  const supplierCurrency = (row.supplier_currency || '').trim().toUpperCase()
  const unitCurrency = supplierCurrency || (ctx.itineraryCurrency || '').toUpperCase() || rateCurrency
  if (!rateCurrency || unitCurrency === rateCurrency) return { rateEur: eur, rateNonEur: nonEur }

  const own = Number(row.exchange_rate_used)
  const ownApplies = !!supplierCurrency && (ctx.itineraryCurrency || '').toUpperCase() === rateCurrency && Number.isFinite(own) && own > 0
  const factor = ownApplies ? own : ctx.fxRates ? getExchangeRate(unitCurrency, rateCurrency, ctx.fxRates) : null
  if (!factor || !Number.isFinite(factor) || factor <= 0) return null
  return { rateEur: round2(eur * factor), rateNonEur: round2(nonEur * factor) }
}

/**
 * The save's own copy of the saved prices: every `savedPrice` the request
 * carried is dropped, and a pick whose serviceId is in `stored` (rows read
 * from the itinerary being re-saved) gets that row's price back, marked. A
 * pick naming any other row — another trip's, another company's, a made-up
 * id — keeps no price unless its rate is current.
 */
export function applyStoredPrices<D extends Pick<GridDay, 'slots'>>(days: D[], stored: Map<string, StoredPrice>): D[] {
  return days.map(day => ({
    ...day,
    slots: (day.slots || []).map(slot => ({
      ...slot,
      selectedItems: (slot.selectedItems || []).map(item => {
        const rest: SelectedItem = { ...item }
        delete rest.savedPrice
        const price = item.serviceId ? stored.get(String(item.serviceId)) : undefined
        return price ? { ...rest, rateEur: price.rateEur, rateNonEur: price.rateNonEur, savedPrice: true } : rest
      }),
    })),
  }))
}
