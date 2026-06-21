// Output sanity gate for the pricing harness (Layer 2).
//
// The single place that decides whether a price may reach a customer
// (PDF / email / WhatsApp / invoice / converted itinerary). It refuses
// zero/negative/NaN prices, broken per-person arithmetic, out-of-range margins,
// missing currency, fabricated line items, and (when provided) any
// incomplete/holed engine result.
//
// `check*` functions are pure and return violations so callers control the
// HTTP response; `assertDeliverablePrice` throws for imperative call sites.
// Ported from the sibling app (autoura-saas). See PRICING-HARNESS-PLAN.md.

import type { PricingHole } from './pricing-types'

export interface DeliverablePriceInput {
  /** From the engine result — when present, must be true. */
  complete?: boolean
  holes?: PricingHole[]
  totalCost?: number | null
  sellingPrice?: number | null
  pricePerPerson?: number | null
  numPax?: number | null
  marginPercent?: number | null
  currency?: string | null
  /** Engine line items — none may be backed by a non-'db'/'fixed' source. */
  services?: Array<{ rateSource?: string }>
}

export interface DeliverableCheck {
  ok: boolean
  violations: string[]
  holes: PricingHole[]
}

export const MARGIN_MIN = 0
export const MARGIN_MAX = 200

// rateSources that represent a real, definite cost basis.
// 'fixed' is the bottled-water business constant (not a DB-sourced rate, but a
// deliberate fixed price), so it is allowed alongside exact DB matches.
const DELIVERABLE_SOURCES = new Set(['db', 'fixed', 'accommodation_rates', 'guide_rates',
  'transportation_rates', 'meal_rates', 'entrance_fees', 'nile_cruises', 'tipping_rates',
  'airport_staff_rates', 'hotel_staff_rates', 'b2b_pricing_rules'])

export function checkDeliverablePrice(input: DeliverablePriceInput): DeliverableCheck {
  const violations: string[] = []
  const holes = input.holes ?? []

  if (input.complete === false) {
    violations.push('Pricing is incomplete — unresolved rate holes.')
  }
  if (holes.length > 0) {
    violations.push(`${holes.length} unresolved rate hole(s).`)
  }

  const checkPositive = (value: number | null | undefined, label: string) => {
    if (value === undefined) return
    if (value === null || !Number.isFinite(value)) {
      violations.push(`${label} is missing or not a finite number.`)
    } else if (value < 0) {
      violations.push(`${label} is negative (${value}).`)
    } else if (value === 0) {
      violations.push(`${label} is zero.`)
    }
  }

  checkPositive(input.sellingPrice, 'Selling price')
  checkPositive(input.totalCost, 'Total cost')
  checkPositive(input.pricePerPerson, 'Price per person')

  // Per-person × pax must reconcile with the selling price. Conservative
  // tolerance so legitimately-rounded stored quotes are not falsely blocked.
  if (
    input.pricePerPerson != null && Number.isFinite(input.pricePerPerson) &&
    input.sellingPrice != null && Number.isFinite(input.sellingPrice) &&
    input.numPax != null && input.numPax > 0
  ) {
    const expected = input.pricePerPerson * input.numPax
    const tolerance = Math.max(input.numPax, input.sellingPrice * 0.02)
    if (Math.abs(expected - input.sellingPrice) > tolerance) {
      violations.push(
        `Price-per-person × pax (${expected.toFixed(2)}) does not reconcile with the selling price (${input.sellingPrice}).`
      )
    }
  }

  if (input.marginPercent != null) {
    if (
      !Number.isFinite(input.marginPercent) ||
      input.marginPercent < MARGIN_MIN ||
      input.marginPercent > MARGIN_MAX
    ) {
      violations.push(
        `Margin ${input.marginPercent}% is outside the allowed range [${MARGIN_MIN}, ${MARGIN_MAX}].`
      )
    }
  }

  if (input.currency !== undefined && !input.currency) {
    violations.push('Currency is missing.')
  }

  if (input.services) {
    const fabricated = input.services.filter(
      (s) => s.rateSource && !DELIVERABLE_SOURCES.has(s.rateSource)
    )
    if (fabricated.length > 0) {
      violations.push(`${fabricated.length} line item(s) not backed by a real rate.`)
    }
  }

  return { ok: violations.length === 0, violations, holes }
}

/**
 * Structural gate for a PERSISTED row at send/export time. The stored row carries
 * no completeness metadata, so this enforces structural sanity only: the headline
 * money figure must be a positive finite number, and (when present) the currency
 * must be set. Use `amountField` to name the relevant column for the message.
 */
export function checkAmountDeliverable(
  amount: number | null | undefined,
  opts: { label?: string; currency?: string | null; pricePerPerson?: number | null; numPax?: number | null } = {}
): DeliverableCheck {
  return checkDeliverablePrice({
    sellingPrice: amount,
    pricePerPerson: opts.pricePerPerson,
    numPax: opts.numPax,
    currency: opts.currency,
  })
}

export class PriceNotDeliverableError extends Error {
  readonly violations: string[]
  readonly holes: PricingHole[]
  constructor(check: DeliverableCheck) {
    super(`Price is not deliverable: ${check.violations.join(' ')}`)
    this.name = 'PriceNotDeliverableError'
    this.violations = check.violations
    this.holes = check.holes
  }
}

export function assertDeliverablePrice(input: DeliverablePriceInput): void {
  const check = checkDeliverablePrice(input)
  if (!check.ok) throw new PriceNotDeliverableError(check)
}
