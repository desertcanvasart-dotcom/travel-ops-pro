// ============================================
// VAT REPORT — what the issued invoices recorded
// ============================================
// The Tax tab of Profit & Loss. Pure: invoice rows in, figures out.
//
// This reads what each invoice RECORDED (vat_applied, tax_rate, tax_amount,
// vat_base — see lib/vat.ts). It never works VAT out from the company rate or
// from revenue: the rate is copied onto a document when it is issued, and a
// later change to the setting must not move a figure already filed.
//
// Only issued invoices count: a draft is not issued and a cancelled one bills
// nothing. Currencies stay apart (no FX on a tax line), and so do rates.
// Input VAT (VAT paid on expenses) is not here: no screen or API records it.

import { invoiceNet } from './invoices/totals'
import { roundToCurrency } from './currency-totals'

export interface VatInvoice {
  currency?: string | null
  status?: string | null
  total_amount?: number | string | null
  tax_amount?: number | string | null
  tax_rate?: number | string | null
  vat_applied?: boolean | null
  vat_base?: number | string | null
}

/** One currency, one recorded rate. */
export interface VatRateLine {
  rate: number
  invoices: number
  /** What the invoices bill before VAT. */
  net: number
  /** The VAT they recorded. */
  vat: number
  /** net + vat (what the clients were billed). */
  total: number
  /** Invoices on this line that left extras or insurance out of the VAT. */
  excluded_extras: number
}

export interface VatCurrencySummary {
  currency: string
  invoices: number
  net: number
  vat: number
  total: number
  /** Issued invoices with no VAT recorded ("VAT not applied"). */
  not_applied: number
  /** Net billed on those invoices. */
  not_applied_net: number
  /** Invoices where extras or insurance were left out of the VAT base. */
  excluded_extras: number
  by_rate: VatRateLine[]
}

export interface VatReport {
  currencies: VatCurrencySummary[]
  /** Issued invoices read, all currencies. */
  invoice_count: number
  /** Issued invoices with no VAT recorded, all currencies. */
  not_applied_count: number
}

/** Statuses that are not an issued invoice. */
const NOT_ISSUED = new Set(['draft', 'cancelled'])

/** VAT was recorded on this invoice. Older rows may lack vat_applied but carry an amount. */
function hasVat(inv: VatInvoice): boolean {
  if (inv.vat_applied === true) return true
  return inv.vat_applied == null && (Number(inv.tax_amount) || 0) > 0
}

export function buildVatReport(invoices: VatInvoice[]): VatReport {
  const byCurrency = new Map<string, VatCurrencySummary>()
  let invoiceCount = 0
  let notApplied = 0

  for (const inv of invoices) {
    if (NOT_ISSUED.has(String(inv.status || '').toLowerCase())) continue
    const currency = String(inv.currency || 'EUR').toUpperCase()
    let row = byCurrency.get(currency)
    if (!row) {
      row = { currency, invoices: 0, net: 0, vat: 0, total: 0, not_applied: 0, not_applied_net: 0, excluded_extras: 0, by_rate: [] }
      byCurrency.set(currency, row)
    }
    invoiceCount++
    row.invoices++
    const net = invoiceNet(inv)
    const vat = Number(inv.tax_amount) || 0
    row.net += net
    row.vat += vat
    row.total += Number(inv.total_amount) || 0

    if (!hasVat(inv)) {
      notApplied++
      row.not_applied++
      row.not_applied_net += net
      continue
    }

    // vat_base is recorded only when something was left out of the VAT.
    const excluded = inv.vat_base !== null && inv.vat_base !== undefined && inv.vat_base !== ''
    if (excluded) row.excluded_extras++
    const rate = Number(inv.tax_rate) || 0
    let line = row.by_rate.find(l => l.rate === rate)
    if (!line) {
      line = { rate, invoices: 0, net: 0, vat: 0, total: 0, excluded_extras: 0 }
      row.by_rate.push(line)
    }
    line.invoices++
    line.net += net
    line.vat += vat
    line.total += Number(inv.total_amount) || 0
    if (excluded) line.excluded_extras++
  }

  const currencies = [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency))
  // Summed floats are tidied to the currency's own unit.
  for (const c of currencies) {
    c.net = roundToCurrency(c.net, c.currency)
    c.vat = roundToCurrency(c.vat, c.currency)
    c.total = roundToCurrency(c.total, c.currency)
    c.not_applied_net = roundToCurrency(c.not_applied_net, c.currency)
    c.by_rate.sort((a, b) => b.rate - a.rate)
    for (const l of c.by_rate) {
      l.net = roundToCurrency(l.net, c.currency)
      l.vat = roundToCurrency(l.vat, c.currency)
      l.total = roundToCurrency(l.total, c.currency)
    }
  }
  return { currencies, invoice_count: invoiceCount, not_applied_count: notApplied }
}
