// ============================================
// Things that reach an invoice from outside its line items
// ============================================
// Two kinds of money are added to a trip's invoice by the server rather than
// by the caller: a traveller's confirmed insurance premium, and the extras and
// upgrades sold after the trip was priced. They arrive from different tables
// and they have different currency policies, but everything they do to the
// document is the same — and it used to be written out once per kind, which is
// how the premium ended up on a document that did not bill it.
//
// So the shared part lives here, as pure functions, and a third kind of
// addition does not add a third copy.

import { roundToCurrency } from '@/lib/currency-totals'

export interface Addition {
  /** booking_extras.id, so it can be stamped as billed. Null for insurance,
   *  which is stamped on the passenger row instead. */
  id: string | null
  source: 'insurance' | 'extra'
  description: string
  quantity: number
  unit_price: number
  /** What this amount is denominated in — NOT necessarily the invoice's. */
  currency: string
}

export interface AdditionLine {
  description: string
  quantity: number
  unit_price: number
  amount: number
}

/**
 * Does this kind of invoice carry the additions?
 *
 * NO ON A DEPOSIT. A deposit is a percentage on account against the tour; an
 * addition is a fixed amount that is either a pass-through (a premium the
 * insurer charges in full) or a late sale (an extra agreed after the deposit
 * was invoiced). Taking 20% of it bills a fifth of something that costs all of
 * it, and listing it on both the deposit and the final says it is owed twice.
 * They settle with the balance, on exactly one document.
 */
export function includeAdditions(invoiceType: string): boolean {
  return invoiceType !== 'deposit'
}

export interface PartitionedAdditions {
  /** In the invoice's own currency, ready to bill. */
  billable: Addition[]
  /** Σ billable, rounded to the invoice currency. */
  total: number
  /**
   * Denominated in something else. Nothing here converts them: a rate applied
   * to somebody else's tariff invents a precision they never quoted. What
   * happens to these is the caller's policy — insurance refuses the invoice
   * outright, an extra is left for an invoice in its own currency.
   */
  otherCurrency: Addition[]
}

export function partitionAdditions(
  additions: Addition[],
  invoiceCurrency: string
): PartitionedAdditions {
  const want = normalise(invoiceCurrency)
  const billable: Addition[] = []
  const otherCurrency: Addition[] = []

  for (const a of additions) {
    if (normalise(a.currency) === want) billable.push(a)
    else otherCurrency.push(a)
  }

  const total = billable.reduce((sum, a) => sum + amountOf(a, want), 0)
  return { billable, total: roundToCurrency(total, want), otherCurrency }
}

export function toLineItems(additions: Addition[], invoiceCurrency: string): AdditionLine[] {
  return additions.map(a => ({
    description: a.description,
    quantity: quantityOf(a),
    unit_price: roundToCurrency(a.unit_price, invoiceCurrency),
    amount: amountOf(a, invoiceCurrency),
  }))
}

function amountOf(a: Addition, currency: string): number {
  return roundToCurrency(Number(a.unit_price) * quantityOf(a), currency)
}

function quantityOf(a: Pick<Addition, 'quantity'>): number {
  const q = Math.floor(Number(a.quantity))
  return Number.isFinite(q) && q > 0 ? q : 1
}

function normalise(currency: unknown): string {
  const s = typeof currency === 'string' ? currency.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(s) ? s : 'EUR'
}
