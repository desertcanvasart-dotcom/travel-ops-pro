// ============================================
// Changing a voucher's currency converts its amounts
// ============================================
// The voucher editor's currency select only changed the label: a voucher of
// €1,200 in lines set to JPY asked the supplier to confirm ¥1,200. A currency
// change now converts every amount the voucher states — each line's unit rate
// and total, every picker list (routes, meals, guides, entrance fees) and the
// voucher total — at the trip's frozen exchange rate, else today's (the same
// rate a picked rate is converted at: lib/documents/voucher-pick-price).
//
// The server does the converting (PUT /api/supplier-documents/[id]). A request
// says which currency its amounts are in (`amounts_currency`; absent = the
// stored currency, which is what a caller that knows nothing of this means).
// When that differs from the currency being saved and there is anything to
// convert, the amounts are converted; with no known rate the save is refused.
// A request can therefore never relabel amounts without converting them.

import { roundToCurrency } from '@/lib/currency-totals'

/** The money fields of each list a voucher keeps. Everything else on a line
 *  (names, quantities, the supplier's own-currency cost and its rate) is
 *  left as it is. */
export const VOUCHER_MONEY_LISTS: Record<string, readonly string[]> = {
  services: ['unit_rate', 'total_cost'],
  selected_routes: ['unit_rate', 'total_cost'],
  selected_meals: ['unit_rate', 'total_cost'],
  selected_guides: ['unit_rate', 'total_cost'],
  selected_attractions: ['eur_rate', 'non_eur_rate'],
}

type Doc = Record<string, unknown>

/** The stored currency, as the column's default reads it. */
export function voucherCurrencyOf(doc: { currency?: unknown } | null | undefined): string {
  const c = typeof doc?.currency === 'string' ? doc.currency.trim().toUpperCase() : ''
  return c || 'EUR'
}

const amount = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

/** Does the voucher state any amount? A voucher with no lines and no total has
 *  nothing to convert, and its currency may simply be set. */
export function voucherHasMoney(doc: Doc): boolean {
  if (amount(doc.total_cost) !== 0) return true
  for (const [list, fields] of Object.entries(VOUCHER_MONEY_LISTS)) {
    const lines = doc[list]
    if (!Array.isArray(lines)) continue
    for (const line of lines) {
      if (line && typeof line === 'object' && fields.some(f => amount((line as Doc)[f]) !== 0)) return true
    }
  }
  return false
}

/** The money fields of `doc`, converted at `fx` (1 unit of the old currency
 *  in the new one) and rounded to the new currency's unit. Only the fields
 *  `doc` has are returned. */
export function convertVoucherMoney(doc: Doc, fx: number, toCurrency: string): Doc {
  const conv = (v: unknown) => (v == null || v === '' ? v : roundToCurrency(amount(v) * fx, toCurrency))
  const out: Doc = {}
  if ('total_cost' in doc) out.total_cost = conv(doc.total_cost)
  for (const [list, fields] of Object.entries(VOUCHER_MONEY_LISTS)) {
    if (!(list in doc)) continue
    const lines = doc[list]
    out[list] = Array.isArray(lines)
      ? lines.map(line => {
          if (!line || typeof line !== 'object') return line
          const next: Doc = { ...(line as Doc) }
          for (const f of fields) if (f in next) next[f] = conv(next[f])
          return next
        })
      : lines
  }
  return out
}

export type CurrencyChange =
  | { kind: 'none' }
  | { kind: 'convert'; from: string; to: string }
  | { kind: 'refuse'; status: number; error: string }

/**
 * What a save does to the voucher's amounts. `stored` is the row as it is;
 * `update` the fields being written; `amountsCurrency` the currency the
 * request says its amounts are in (absent: the stored one).
 */
export function planCurrencyChange(stored: Doc, update: Doc, amountsCurrency?: unknown): CurrencyChange {
  const storedCurrency = voucherCurrencyOf(stored)
  const to = 'currency' in update ? voucherCurrencyOf(update) : storedCurrency
  const from = typeof amountsCurrency === 'string' && amountsCurrency.trim()
    ? amountsCurrency.trim().toUpperCase()
    : storedCurrency
  if (from === to) return { kind: 'none' }

  // The amounts the voucher will state: the request's, else the stored ones.
  const merged: Doc = { ...stored, ...update }
  if (!voucherHasMoney(merged)) return { kind: 'none' }

  // Amounts the request leaves out are the stored ones, in the stored
  // currency: they can only be converted from that currency.
  if (from !== storedCurrency) {
    const leftOut = ['total_cost', ...Object.keys(VOUCHER_MONEY_LISTS)].filter(k => !(k in update) && voucherHasMoney({ [k]: stored[k] }))
    if (leftOut.length > 0) {
      return {
        kind: 'refuse',
        status: 409,
        error: `The amounts sent are in ${from}, but the voucher's ${leftOut.join(', ')} are stored in ${storedCurrency}. Send every line to change the currency.`,
      }
    }
  }
  return { kind: 'convert', from, to }
}
