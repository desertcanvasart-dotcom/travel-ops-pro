// The Clients page's money cards, summed per currency.
//
// A client billed in yen and one billed in euro have not produced one number,
// so each currency keeps its own total (lib/currency-totals). The figures come
// from clients.revenue_by_currency (invoiced: the totals of the company's
// invoices that are not draft or cancelled) and collected_by_currency (what
// has been paid against them) — both kept up to date by recompute_client_revenue.
import { addToTotals, formatTotals, type CurrencyTotals } from '@/lib/currency-totals'

export type MoneyByCurrency = Record<string, unknown> | null | undefined

/** Sum a list of per-currency maps into one per-currency total. */
export function sumCurrencyMaps(maps: Array<MoneyByCurrency>): CurrencyTotals {
  const totals: CurrencyTotals = {}
  for (const map of maps) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue
    for (const [code, amount] of Object.entries(map)) addToTotals(totals, amount, code)
  }
  return totals
}

/** A per-currency map as stored, or {} when it is missing or malformed. */
export function currencyMapOf(value: unknown): CurrencyTotals {
  return sumCurrencyMaps([value as MoneyByCurrency])
}

export interface ClientMoneyRow {
  revenue_by_currency?: unknown
  collected_by_currency?: unknown
  total_revenue_generated?: number | string | null
  revenue_currency?: string | null
}

/**
 * What a client has been invoiced, per currency (invoices not draft or
 * cancelled). A row whose per-currency map is still empty but which carries
 * the older single figure shows that figure in ITS currency — never a guessed
 * one: the list used to print every client's figure in euro, whatever it was.
 */
export function invoicedTotals(row: ClientMoneyRow): CurrencyTotals {
  const byCurrency = currencyMapOf(row.revenue_by_currency)
  if (Object.values(byCurrency).some(v => v !== 0)) return byCurrency
  const scalar = Number(row.total_revenue_generated) || 0
  return scalar > 0 && row.revenue_currency ? currencyMapOf({ [row.revenue_currency]: scalar }) : {}
}

/** What has been paid against those invoices, per currency. */
export function collectedTotals(row: ClientMoneyRow): CurrencyTotals {
  return currencyMapOf(row.collected_by_currency)
}

/** "€1,200.00 + ¥50,000", or an em dash when there is nothing (not "€0.00"). */
export function formatMoneyTotals(totals: CurrencyTotals): string {
  return Object.values(totals).some(v => v !== 0) ? formatTotals(totals) : '—'
}
