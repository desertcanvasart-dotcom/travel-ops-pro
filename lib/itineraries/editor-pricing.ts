// ============================================
// The itinerary editor's prices — in the trip's currency, client price kept
// ============================================
// Two things the editor (app/itineraries/[id]/edit) got wrong when a service
// line's quantity or rate changed, or a rate was picked:
//
//   * It wrote quantity × rate straight into total_cost. Rates are in the
//     company's RATE currency (organizations.rate_currency — what the rate
//     picker shows); total_cost is in the TRIP's currency (it is shown and
//     summed as itinerary.currency). On a yen trip priced from euro rates, a
//     line the AI stored as ¥8,000 (€50) became "JPY 100" when its quantity
//     went from 1 to 2. Now the editor converts the way AI generation does
//     (lib/ai/service-creation.ts): supplier_cost_original = quantity × rate
//     in the rate currency, exchange_rate_used = the rate applied,
//     total_cost = the converted amount, supplier_currency = the rate
//     currency. The rate a line already carries is kept (one file, one
//     rate — lib/itinerary-fx.ts); a new line takes the trip's frozen rate
//     when it has one, else today's.
//   * It never touched client_price, so the client's price of a changed
//     line stayed as it was — and the save wrote total_cost = Σ cost ×
//     (1 + margin), dropping the per-line client prices and the season
//     supplement; the database trigger then overwrote that with Σ
//     client_price. A changed line's client price now moves with its cost
//     at the line's own markup (else the trip's margin), and the save stores
//     what the view page and every document say the client pays:
//     tripClientTotal (lib/itinerary-client-price.ts).

import { DEFAULT_CLIENT_MARGIN_PERCENT, tripClientTotal } from '@/lib/itinerary-client-price'
import { getExchangeRate, type ExchangeRates } from '@/lib/currency-service'

const round2 = (n: number) => Math.round(n * 100) / 100

export interface EditorLine {
  quantity: number
  rate_eur: number
  rate_non_eur: number
  total_cost: number
  client_price?: number | null
  supplier_currency?: string | null
  supplier_cost_original?: number | null
  exchange_rate_used?: number | null
  isDeleted?: boolean
}

/** 1 unit of the rate currency in the trip currency: 1 when they are the same,
 *  else from the frozen snapshot, else from today's rates; null when unknown. */
export function editorFxRate(
  rateCurrency: string,
  tripCurrency: string,
  sources: { frozen?: ExchangeRates | null; live?: ExchangeRates | null }
): number | null {
  if (!rateCurrency || !tripCurrency || rateCurrency === tripCurrency) return 1
  for (const rates of [sources.frozen, sources.live]) {
    if (!rates) continue
    const fx = getExchangeRate(rateCurrency, tripCurrency, rates)
    if (fx && Number.isFinite(fx) && fx > 0) return fx
  }
  return null
}

/** What the client pays per unit of cost on this line: its own markup when it
 *  has a client price, else the trip's margin (else the default 25%). */
export function lineMarkup(line: Pick<EditorLine, 'total_cost' | 'client_price'>, marginPercent?: number | null): number {
  const cost = Number(line.total_cost)
  const price = Number(line.client_price)
  if (line.client_price != null && Number.isFinite(price) && price > 0 && Number.isFinite(cost) && cost > 0) return price / cost
  const margin = marginPercent != null && Number.isFinite(Number(marginPercent)) ? Number(marginPercent) : DEFAULT_CLIENT_MARGIN_PERCENT
  return 1 + margin / 100
}

/**
 * The fields to write when a line's quantity or rate (in the rate currency)
 * changes. Null when the currencies differ and no exchange rate is known —
 * the caller must not write a rate-currency number as a trip-currency one.
 */
export function repriceEditorLine(
  line: EditorLine,
  change: { quantity: number; rate_eur: number; rate_non_eur: number },
  ctx: { rateCurrency: string; tripCurrency: string; fx: number | null; marginPercent?: number | null }
): Partial<EditorLine> | null {
  const sameCurrency = !ctx.rateCurrency || !ctx.tripCurrency || ctx.rateCurrency === ctx.tripCurrency
  // The line keeps the rate it was converted at, when it was converted from this rate currency.
  const own = Number(line.exchange_rate_used)
  const fx = sameCurrency
    ? 1
    : line.supplier_currency === ctx.rateCurrency && Number.isFinite(own) && own > 0
      ? own
      : ctx.fx
  if (!fx || !Number.isFinite(fx) || fx <= 0) return null

  const quantity = Math.max(0, Number(change.quantity) || 0)
  const rate = Number(change.rate_non_eur) || Number(change.rate_eur) || 0
  const original = round2(quantity * rate)
  const total = round2(original * fx)
  const markup = lineMarkup(line, ctx.marginPercent)
  return {
    quantity,
    rate_eur: change.rate_eur,
    rate_non_eur: change.rate_non_eur,
    total_cost: total,
    client_price: round2(total * markup),
    supplier_currency: ctx.rateCurrency || line.supplier_currency || null,
    supplier_cost_original: original,
    exchange_rate_used: fx,
  }
}

/** What the save stores on the itinerary row: supplier cost (Σ line cost),
 *  the client total (lines' client prices + season supplement) and profit. */
export function editorSaveTotals(
  itinerary: { total_cost?: unknown; season_uplift_amount?: unknown },
  lines: EditorLine[]
): { supplier_cost: number; total_cost: number; profit: number } {
  const live = lines.filter(l => !l.isDeleted)
  const supplierCost = round2(live.reduce((sum, l) => sum + (Number(l.total_cost) || 0), 0))
  const clientTotal = tripClientTotal(itinerary, [{ services: live }])
  return { supplier_cost: supplierCost, total_cost: clientTotal, profit: round2(clientTotal - supplierCost) }
}
