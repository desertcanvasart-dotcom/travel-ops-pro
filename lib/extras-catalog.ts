// ============================================
// The option catalogue — what can be added to a trip
// ============================================
// An extra typed by hand works, but it drifts: two agents name the same tour
// differently, the price is whatever was remembered, no supplier cost comes
// with it (so the P&L reads the whole thing as margin), and nobody can ever
// ask "how much did the balloon ride earn us this year".
//
// So extras are PICKED from a list, and the list is one the operator already
// maintains:
//
//   PACKAGE OPTIONS   tour_variation_services where is_optional — the options
//                     belonging to a specific programme, each with its own
//                     cost_per_unit and an optional_price_override that is the
//                     selling price the operator already decided on.
//   ATTRACTION EXTRAS entrance_fees where is_sellable_extra — a site the
//                     customer can pay to add (the pyramid interior). NOT
//                     is_addon: that flag means "leave out of the automatic
//                     price", which is a different decision and does not imply
//                     this one (operator, 1 Sep).
//   CATALOGUE EXTRAS  extras_catalogue — the things that are not attractions
//                     at all: airport fast-track, extra luggage, late
//                     check-out. Org-scoped and priced the same way.
//
// THE PICKER PRE-FILLS, IT DOES NOT COMMIT. Every price here is a suggestion
// the office can change before the extra is offered, which is why an honest
// null is better than a plausible number: what cannot be priced comes back
// unpriced and says why.

import { usableRate } from '@/lib/pricing/usable-rate'
import { roundToCurrency } from '@/lib/currency-totals'
import { resolveSupplementsForDate, supplementsForRow } from '@/lib/rates/supplements'
import type { RateSeasonEntity } from '@/lib/rates/rate-seasons'

//   ACCOMMODATION     the supplements the trip's OWN hotels and ship carry
//   SUPPLEMENTS       (Settings → Vocabulary; priced on the rate row per
//                     person per night): a Nile view, an upper deck — offered
//                     after the sale as an UPGRADE, priced for the stay's
//                     nights at each night's own period. Operator decision
//                     2026-09-13: included in the price by default when the
//                     programme asks for one; here is where the customer who
//                     comes back and asks for the view is served.

export type CatalogSourceKind = 'package_option' | 'entrance_fee' | 'catalogue_extra' | 'accommodation_supplement'

export interface CatalogItem {
  source_kind: CatalogSourceKind
  source_id: string
  /** Unique within the catalogue. Several supplements share one rate row
   *  (their source_id, a uuid the extras table can store), so the picker
   *  keys on this, never on source_id. Equal to source_id elsewhere. */
  item_id?: string
  /** What the picker offers it as. A supplement is an upgrade by nature. */
  kind?: 'addon' | 'upgrade'
  title: string
  /** Where it comes from and how it was priced, in the office's words. */
  subtitle: string | null
  supplier_id: string | null
  /** What we pay. Null is a hole in the rate table, never zero. */
  supplier_cost: number | null
  supplier_currency: string | null
  /** What to charge, in the BOOKING's currency. Null = the office prices it. */
  unit_price: number | null
  currency: string
  price_note: string
}

/** Convert between currencies, or null when there is no rate to do it with. */
export type Converter = (amount: number, from: string, to: string) => number | null

export interface PriceCatalogItemInput {
  /** cost_per_unit / eur_rate / non_eur_rate — whatever the rate table holds. */
  cost: unknown
  /** A selling price the operator already set (optional_price_override). */
  sellingOverride?: unknown
  marginPercent: number
  /** The currency the RATE is in — the org's rate currency. */
  rateCurrency: string
  /** The currency the customer is billed in. */
  bookingCurrency: string
  convert: Converter
}

export interface PricedCatalogItem {
  supplier_cost: number | null
  supplier_currency: string | null
  unit_price: number | null
  price_note: string
}

/**
 * What to charge for one catalogue row, and what it costs us.
 *
 * Three ways it can land, and the note says which:
 *   override  the operator already decided this option's selling price
 *   margin    cost plus the org's margin
 *   unpriced  no usable rate, or no way to convert it — the office types it
 *
 * A blank or zero rate is a HOLE, not a free service: usableRate() rejects it,
 * and the item comes back unpriced rather than offering something for nothing.
 */
export function priceCatalogItem(input: PriceCatalogItemInput): PricedCatalogItem {
  const { rateCurrency, bookingCurrency, marginPercent } = input
  const cost = usableRate(input.cost)
  const override = usableRate(input.sellingOverride)

  const toBooking = (amount: number): number | null => {
    if (normalise(rateCurrency) === normalise(bookingCurrency)) return amount
    const converted = input.convert(amount, rateCurrency, bookingCurrency)
    return converted == null ? null : converted
  }

  const supplier_cost = cost
  const supplier_currency = cost == null ? null : rateCurrency

  if (override != null) {
    const price = toBooking(override)
    return price == null
      ? {
          supplier_cost,
          supplier_currency,
          unit_price: null,
          price_note: noRateNote(rateCurrency, bookingCurrency),
        }
      : {
          supplier_cost,
          supplier_currency,
          unit_price: roundToCurrency(price, bookingCurrency),
          price_note: `the price set on this option${conversionSuffix(rateCurrency, bookingCurrency)}`,
        }
  }

  if (cost == null) {
    return {
      supplier_cost: null,
      supplier_currency: null,
      unit_price: null,
      price_note: 'no rate on file — set the price before offering it',
    }
  }

  const withMargin = cost * (1 + marginPercent / 100)
  const price = toBooking(withMargin)
  if (price == null) {
    return {
      supplier_cost,
      supplier_currency,
      unit_price: null,
      price_note: noRateNote(rateCurrency, bookingCurrency),
    }
  }

  return {
    supplier_cost,
    supplier_currency,
    unit_price: roundToCurrency(price, bookingCurrency),
    price_note: `cost + ${marginPercent}% margin${conversionSuffix(rateCurrency, bookingCurrency)}`,
  }
}

/**
 * Which of an entrance fee's two rates to pre-fill with.
 *
 * The rate tables price by passport, and a booking does not record passport
 * type — so this picks the non-EUR rate, which is the one most of this
 * operator's travellers pay, and SAYS SO. The office sees the basis and can
 * change the number before the option is offered; what it must never do is
 * present one passport's price as though it were the only one.
 */
export function entranceFeeBasis(row: { non_eur_rate?: unknown; eur_rate?: unknown }): {
  cost: number | null
  basis: string | null
} {
  const nonEur = usableRate(row.non_eur_rate)
  if (nonEur != null) return { cost: nonEur, basis: 'non-EUR passport rate' }
  const eur = usableRate(row.eur_rate)
  if (eur != null) return { cost: eur, basis: 'EUR passport rate' }
  return { cost: null, basis: null }
}

function noRateNote(from: string, to: string): string {
  return `no exchange rate for ${normalise(from)} → ${normalise(to)} — set the price yourself`
}

function conversionSuffix(from: string, to: string): string {
  return normalise(from) === normalise(to) ? '' : `, converted from ${normalise(from)}`
}

function normalise(currency: unknown): string {
  const s = typeof currency === 'string' ? currency.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(s) ? s : 'EUR'
}

// ── Accommodation supplements as upgrades ──────────────────────────────────

export interface PropertyStay {
  entity: RateSeasonEntity
  /** The accommodation_rates / nile_cruises row the trip priced against. */
  row: Record<string, unknown>
  name: string
  /** The nights of the stay, 'YYYY-MM-DD' each, for per-night period pricing. */
  dates: string[]
}

export interface SupplementUpgrade {
  entity: RateSeasonEntity
  rowId: string
  key: string
  name: string
  propertyName: string
  supplierId: string | null
  rateCurrency: string | null
  nights: number
  /** Per person for the whole stay, in the rate's currency. Null = a night
   *  the property has no price for — a hole, never a free night. */
  costPerPerson: number | null
  /** Which passport rate the cost came from, or why it could not be priced. */
  basis: string
}

/**
 * Every supplement the trip's properties carry, priced per person for the
 * stay: each night at its own period, non-EUR passport rate first (the one
 * most of this operator's travellers pay — the same choice entranceFeeBasis
 * makes, and said out loud), EUR when that is the only one entered. A night
 * with no price under either leaves the item unpriced with the reason.
 */
export function supplementUpgrades(stays: readonly PropertyStay[]): SupplementUpgrade[] {
  const out: SupplementUpgrade[] = []
  for (const stay of stays) {
    if (stay.dates.length === 0) continue
    const rowId = String(stay.row.id ?? '')
    for (const supp of supplementsForRow(stay.row)) {
      const perNight = (isEur: boolean) =>
        stay.dates.map(d => resolveSupplementsForDate(stay.row, stay.entity, isEur, d, [supp.key])[0].night)
      let nights = perNight(false)
      let basis = 'non-EUR passport rate'
      if (nights.some(n => n <= 0)) {
        const eur = perNight(true)
        if (eur.every(n => n > 0)) { nights = eur; basis = 'EUR passport rate' }
      }
      const unpriced = nights.filter(n => n <= 0).length
      out.push({
        entity: stay.entity,
        rowId,
        key: supp.key,
        name: supp.name,
        propertyName: stay.name,
        supplierId: typeof stay.row.supplier_id === 'string' ? stay.row.supplier_id : null,
        rateCurrency: typeof stay.row.rate_currency === 'string' && stay.row.rate_currency ? stay.row.rate_currency : null,
        nights: stay.dates.length,
        costPerPerson: unpriced === 0 ? Math.round(nights.reduce((a, b) => a + b, 0) * 100) / 100 : null,
        basis: unpriced === 0
          ? `${basis}, ${stay.dates.length} night${stay.dates.length === 1 ? '' : 's'} at each night's period`
          : `no price for ${unpriced} of ${stay.dates.length} nights — fill it on the property's rate periods`,
      })
    }
  }
  return out
}
