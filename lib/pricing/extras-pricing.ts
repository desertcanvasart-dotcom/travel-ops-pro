// ============================================================================
// Catalogue extras at QUOTE time — priced through the engine, like options.
// ============================================================================
// Ported from autoura-saas (lib/pricing/extras-pricing.ts) so both apps price
// a catalogue extra the same way. Until now this app sold extras only AFTER
// the sale (booking_extras); a customer who says yes to airport fast-track
// while the quote is being built had nowhere to put it.
//
// Same rule as options (lib/b2b/optional-pricing) and as the booking-time
// picker (lib/extras-catalog): cost is the truth, the quote's margin is the
// house rule, selling_price is an explicit pin.
//
//   cost only        cost joins total_cost and takes the quote's margin.
//   cost + price     cost joins total_cost, the price joins selling_price,
//                    margin = price − cost. The quote margin is NEVER
//                    stacked on top of a pinned price.
//   nothing          a HOLE. The engine never guesses.
//   price, no cost   priced (the operator chose it) but ALSO a hole: with
//                    the cost unknown the margin can't be stated.
//
// ONE DIFFERENCE from the autoura-saas copy, deliberately: rates here go
// through usableRate(), so a ZERO cost or price is "no answer", not a free
// line — this app's locked rule ("no guide works for free").
//
// Per-person extras scale with pax; per-booking extras are charged once.
// Pure, so it is golden-tested; the route only fetches rows and folds.

import { usableRate } from '@/lib/pricing/usable-rate'

export interface CatalogueExtra {
  id: string
  name: string
  supplier_cost: number | null
  selling_price: number | null
  unit: 'per_person' | 'per_booking'
}

export interface ExtraSelection {
  id: string
}

/** Structurally matches the route's CalculatedService, so a line can be
 *  pushed straight into result.services (and so into services_snapshot). */
export interface ExtraServiceLine {
  service_id: string
  service_name: string
  service_category: string
  rate_type: string | null
  rate_source: 'extras_catalogue'
  quantity_mode: 'per_pax' | 'fixed'
  quantity: number
  /** 0 when the cost is unknown — the engine's convention for "no rate". */
  unit_cost: number
  line_total: number
  is_optional: boolean
  day_number: number | null
  pricing_note: string
  extra: {
    unit: 'per_person' | 'per_booking'
    pinned: boolean
    sell_total: number | null
    margin_total: number
    cost_known: boolean
  }
}

export interface ExtrasPricing {
  lines: ExtraServiceLine[]
  /** Σ known cost — joins total_cost. */
  cost_total: number
  /** Σ cost of cost-only lines — the part the quote's margin applies to. */
  margined_cost: number
  /** Σ (price − cost) of pinned lines — added to margin as-is. */
  pinned_margin: number
  /** Σ pinned prices — what those lines contribute to selling_price. */
  pinned_sell: number
  holes: { kind: string; message: string }[]
}

export interface MoneyBlock {
  totalCost: number
  marginAmount: number
  sellingPrice: number
  pricePerPerson: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Price the selected extras for a group of numPax. Unknown ids are holes,
 *  not silently dropped — a quote must not quietly lose something the
 *  operator chose. */
export function priceExtras(
  catalogue: CatalogueExtra[],
  selections: ExtraSelection[],
  numPax: number
): ExtrasPricing {
  const byId = new Map(catalogue.map((x) => [x.id, x]))
  const pax = Math.max(1, Math.floor(numPax))
  const out: ExtrasPricing = { lines: [], cost_total: 0, margined_cost: 0, pinned_margin: 0, pinned_sell: 0, holes: [] }

  for (const sel of selections) {
    const x = byId.get(sel.id)
    if (!x) {
      out.holes.push({ kind: 'extra', message: `Extra ${sel.id} was not found.` })
      continue
    }

    const quantity = x.unit === 'per_person' ? pax : 1
    const unitCost = usableRate(x.supplier_cost)
    const unitSell = usableRate(x.selling_price)
    const costKnown = unitCost !== null
    const costTotal = costKnown ? r2(unitCost * quantity) : 0
    const pinned = unitSell !== null
    const sellTotal = pinned ? r2(unitSell * quantity) : null
    const per = x.unit === 'per_person' ? '/person' : '/booking'

    let note: string
    if (pinned) {
      out.pinned_sell += sellTotal!
      out.pinned_margin += sellTotal! - costTotal
      note = costKnown
        ? `Set price ${unitSell}${per} × ${quantity} = ${sellTotal} (cost ${unitCost}${per}; no margin added)`
        : `Set price ${unitSell}${per} × ${quantity} = ${sellTotal} — cost unknown, margin cannot be stated`
      if (!costKnown) {
        out.holes.push({ kind: 'extra', message: `"${x.name}" has a set price but no supplier cost — enter the cost so the margin is known.` })
      }
    } else if (costKnown) {
      out.margined_cost += costTotal
      note = `Cost ${unitCost}${per} × ${quantity} = ${costTotal}; quote margin applies`
    } else {
      note = 'No cost and no price — unpriced'
      out.holes.push({ kind: 'extra', message: `"${x.name}" has no supplier cost and no set price — it cannot be priced.` })
    }
    out.cost_total += costTotal

    out.lines.push({
      service_id: x.id,
      service_name: x.name,
      service_category: 'extra',
      rate_type: 'extra',
      rate_source: 'extras_catalogue',
      quantity_mode: x.unit === 'per_person' ? 'per_pax' : 'fixed',
      quantity,
      unit_cost: costKnown ? unitCost : 0,
      line_total: costTotal,
      is_optional: false,
      day_number: null,
      pricing_note: note,
      extra: { unit: x.unit, pinned, sell_total: sellTotal, margin_total: r2(pinned ? sellTotal! - costTotal : 0), cost_known: costKnown },
    })
  }

  out.cost_total = r2(out.cost_total)
  out.margined_cost = r2(out.margined_cost)
  out.pinned_margin = r2(out.pinned_margin)
  out.pinned_sell = r2(out.pinned_sell)
  return out
}

/** Fold priced extras into a money block. Cost-only extras take
 *  marginPercent; pinned extras bring their own (price − cost) margin. */
export function addExtrasToMoney(block: MoneyBlock, p: ExtrasPricing, numPax: number, marginPercent: number): MoneyBlock {
  const totalCost = block.totalCost + p.cost_total
  const marginAmount = block.marginAmount + p.margined_cost * (marginPercent / 100) + p.pinned_margin
  const sellingPrice = totalCost + marginAmount
  return {
    totalCost: r2(totalCost),
    marginAmount: r2(marginAmount),
    sellingPrice: r2(sellingPrice),
    pricePerPerson: r2(sellingPrice / Math.max(1, numPax)),
  }
}
