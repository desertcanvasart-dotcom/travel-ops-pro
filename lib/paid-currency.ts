// ============================================
// What a service line's supplier is PAID in
// ============================================
// A rate can be entered in its own currency — an EGP guide, a JPY flight
// (rate_currency, 20260827). Pricing converts it to the company's rate
// currency as it is read (lib/rates/rate-currency.ts), and the line's
// supplier_currency / supplier_cost_original / exchange_rate_used then
// describe that RATE currency: the pricing grid and the itinerary editor read
// the line's unit prices in it, so they cannot be relabelled "EGP".
//
// itinerary_services.paid_currency / paid_amount / paid_rate (20270109) say
// what the supplier is actually paid, for payables only — booking supplier
// rows, vouchers and the expense made on confirmation
// (lib/supplier-own-currency). Prices, totals and margins never read them.
//
//   paid_amount  the cost converted BACK from the rate currency at the very
//                factor pricing used, so it can differ from the rate as typed
//                by a fraction: EGP and JPY are rounded to whole units, the
//                rest to cents. The confirmed cost the operator types on the
//                booking row is what the expense records.
//   paid_rate    1 unit of paid_currency in the trip's currency when written.
//                An edit changes total_cost only, so total_cost ÷ paid_rate
//                is the paid amount after it — the stored amount is never
//                stated once it no longer matches the line.

import { normaliseRateCurrency } from '@/lib/org-rate-currency'

export interface PaidFields {
  paid_currency: string | null
  paid_amount: number | null
  paid_rate: number | null
}

export const NO_PAID: PaidFields = { paid_currency: null, paid_amount: null, paid_rate: null }

export interface PaidLine {
  total_cost?: number | string | null
  paid_currency?: string | null
  paid_amount?: number | string | null
  paid_rate?: number | string | null
}

const WHOLE_UNITS = new Set(['EGP', 'JPY'])

const num = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

/** An amount in `currency` as it is paid: EGP and JPY in whole units, the rest in cents. */
export function roundPaid(amount: number, currency: string): number {
  return WHOLE_UNITS.has(currency) ? Math.round(amount) : Math.round(amount * 100) / 100
}

/**
 * The paid fields for a line priced from `sources` (the converted rate rows,
 * which keep their rate_currency). Stamped only when every source was entered
 * in ONE currency that is neither the rate currency nor the trip's, the line
 * has a cost, and both factors are known; otherwise NO_PAID — the line is
 * paid in the rate or trip currency, which the existing columns already say.
 */
export async function paidFieldsFor(
  sources: Array<{ rate_currency?: unknown } | null | undefined>,
  line: { runTotal: number; runCurrency: string; tripCurrency: string; runToTrip: number },
  fxFor: (currency: string) => Promise<number | null>,
): Promise<PaidFields> {
  const run = normaliseRateCurrency(line.runCurrency)
  const trip = String(line.tripCurrency || '').trim().toUpperCase()
  if (!run || sources.length === 0) return NO_PAID
  const currencies = new Set(sources.map(s => normaliseRateCurrency(s?.rate_currency) ?? run))
  if (currencies.size !== 1) return NO_PAID
  const [cur] = [...currencies]
  if (cur === run || cur === trip) return NO_PAID
  if (!Number.isFinite(line.runTotal) || line.runTotal <= 0) return NO_PAID
  if (!Number.isFinite(line.runToTrip) || line.runToTrip <= 0) return NO_PAID
  const factor = await fxFor(cur)
  if (!factor || !Number.isFinite(factor) || factor <= 0) return NO_PAID
  return {
    paid_currency: cur,
    paid_amount: roundPaid(line.runTotal / factor, cur),
    paid_rate: factor * line.runToTrip,
  }
}

/**
 * What the supplier is paid for this line, or null when it carries no paid
 * currency: the stored amount while it still matches total_cost at paid_rate
 * (within the whole-unit rounding), else total_cost ÷ paid_rate.
 */
export function paidMoney(line: PaidLine): { currency: string; amount: number } | null {
  const cur = normaliseRateCurrency(line.paid_currency)
  const rate = num(line.paid_rate)
  const total = num(line.total_cost)
  if (!cur || rate === null || rate <= 0 || total === null) return null
  const stored = num(line.paid_amount)
  const slack = Math.max(0.5 * rate + 0.01, Math.abs(total) * 0.005)
  if (stored !== null && Math.abs(stored * rate - total) <= slack) return { currency: cur, amount: stored }
  return { currency: cur, amount: roundPaid(total / rate, cur) }
}

/**
 * The paid fields after a re-price moved total_cost from `oldTotal` to
 * `newTotal` (an exchange-rate change, not an edit): the paid amount stays
 * what the supplier charges and paid_rate follows the trip currency.
 */
export function paidRateAfterReprice(line: PaidLine, oldTotal: number, newTotal: number): number | null {
  const rate = num(line.paid_rate)
  if (!normaliseRateCurrency(line.paid_currency) || rate === null || rate <= 0) return null
  if (!Number.isFinite(oldTotal) || oldTotal <= 0 || !Number.isFinite(newTotal) || newTotal <= 0) return null
  return rate * (newTotal / oldTotal)
}
