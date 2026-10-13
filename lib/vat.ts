// ============================================
// VAT on a client document
// ============================================
// Owner's decision (2026-10-13): VAT is a recorded amount, 14% unless the
// company sets another rate, and every document that shows a client price
// says plainly whether it carries VAT — "VAT 14% included: €1,400.00" or
// "VAT not applied". Never silent.
//
// The rule, everywhere:
//   - organizations.vat_rate is the company's rate (Settings › Company
//     Profile, admin only). It is read when a document is PRICED or ISSUED
//     and copied onto it; a later change to the setting never re-prices a
//     document already made.
//   - VAT goes on TOP of the net price: total incl. VAT = net + vat_amount.
//     The existing price columns (selling_price, total_cost, …) keep meaning
//     the net, so nothing that reads them changes.
//   - vat_amount = net × rate / 100, rounded to the currency's own unit
//     (whole yen for JPY). The server computes it; an amount sent by a
//     browser is never stored.
//
// Japanese wording follows the documents' own style: 「VAT（14%）適用：…」 /
// 「VAT 不適用」.

import { formatMoney, roundToCurrency } from '@/lib/currency-totals'

/** The rate a company has until it sets its own (Egypt's standard VAT). */
export const DEFAULT_VAT_RATE = 14

/** Coerce to a rate in [0, 100], else null. */
export function normaliseVatRate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 100) / 100
}

/** VAT on a net amount, in the currency's own minor unit. */
export function vatFor(net: unknown, rate: unknown, currency: string | null | undefined): number {
  const r = normaliseVatRate(rate) ?? 0
  const n = Number(net)
  if (!Number.isFinite(n) || n <= 0 || r <= 0) return 0
  return roundToCurrency((n * r) / 100, currency || 'EUR')
}

/** What a document records about VAT. */
export interface VatRecord {
  vat_applied: boolean
  vat_rate: number | null
  vat_amount: number
}

/**
 * The columns to store on a document priced at `net`. Off: rate null and
 * amount 0 — the document says "VAT not applied", whatever the setting is.
 */
export function vatColumns(input: {
  applied: boolean
  net: unknown
  rate: unknown
  currency: string | null | undefined
}): VatRecord {
  if (!input.applied) return { vat_applied: false, vat_rate: null, vat_amount: 0 }
  const rate = normaliseVatRate(input.rate) ?? DEFAULT_VAT_RATE
  return { vat_applied: true, vat_rate: rate, vat_amount: vatFor(input.net, rate, input.currency) }
}

/**
 * The VAT columns for an INSERT: written only when VAT is applied. Off is the
 * columns' default (false / NULL / 0), so a document without VAT still saves
 * on a database that has not run migration 20261214 yet.
 */
export function vatInsertColumns(vat: VatRecord): Partial<VatRecord> {
  return vat.vat_applied ? vat : {}
}

/**
 * What a trip takes from the quote it is converted or booked from: the flag
 * and the recorded rate. Nothing when the quote row has no VAT columns (a
 * database before migration 20261214), so the write still goes through.
 */
export function tripVatFromQuote(quote: { vat_applied?: unknown; vat_rate?: unknown } | null | undefined): { vat_applied?: boolean; vat_rate?: number | null } {
  if (!quote || !('vat_applied' in quote)) return {}
  const applied = quote.vat_applied === true
  return { vat_applied: applied, vat_rate: applied ? normaliseVatRate(quote.vat_rate) ?? DEFAULT_VAT_RATE : null }
}

/**
 * Read a request's "apply VAT" flag. Only a real boolean (or the strings a
 * form posts) counts; anything else is "not said" (undefined), so the caller
 * can fall back to the source document's choice.
 */
export function parseVatApplied(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === 1 || value === '1' || value === 'on') return true
  if (value === false || value === 'false' || value === 0 || value === '0' || value === 'off') return false
  return undefined
}

/** What a stored row says, tolerant of rows from before the migration. */
export function readVat(row: {
  vat_applied?: unknown
  vat_rate?: unknown
  vat_amount?: unknown
} | null | undefined): VatRecord {
  const applied = row?.vat_applied === true
  return {
    vat_applied: applied,
    vat_rate: applied ? normaliseVatRate(row?.vat_rate) : null,
    vat_amount: applied ? Number(row?.vat_amount) || 0 : 0,
  }
}

/**
 * An invoice records its VAT in its long-standing tax columns: tax_rate and
 * tax_amount, with vat_applied saying whether there is any.
 */
export function readInvoiceVat(inv: {
  vat_applied?: unknown
  tax_rate?: unknown
  tax_amount?: unknown
} | null | undefined): VatRecord {
  const amount = Number(inv?.tax_amount) || 0
  // A row from before the migration with tax on it was issued with tax.
  const applied = inv?.vat_applied === true || (inv?.vat_applied === undefined && amount > 0)
  return {
    vat_applied: applied,
    vat_rate: applied ? normaliseVatRate(inv?.tax_rate) : null,
    vat_amount: applied ? amount : 0,
  }
}

/**
 * VAT on a document whose net still moves (an itinerary's client total is
 * re-added from its lines): the RATE is the one recorded when the flag was
 * set, the amount follows the net it is shown beside.
 */
export function vatOnLiveNet(
  row: { vat_applied?: unknown; vat_rate?: unknown } | null | undefined,
  net: unknown,
  currency: string | null | undefined
): VatRecord {
  if (row?.vat_applied !== true) return { vat_applied: false, vat_rate: null, vat_amount: 0 }
  const rate = normaliseVatRate(row?.vat_rate) ?? DEFAULT_VAT_RATE
  return { vat_applied: true, vat_rate: rate, vat_amount: vatFor(net, rate, currency) }
}

/**
 * The VAT inside a payment towards an invoice: the invoice's recorded VAT in
 * proportion to the share of the invoice this payment is. A receipt for half
 * an invoice carrying ¥14,000 VAT says ¥7,000 of it is VAT.
 */
export function vatInPayment(
  amount: unknown,
  invoice: { vat_applied?: unknown; tax_rate?: unknown; tax_amount?: unknown; total_amount?: unknown } | null | undefined,
  currency: string | null | undefined
): VatRecord {
  const vat = readInvoiceVat(invoice)
  const total = Number(invoice?.total_amount) || 0
  if (!vat.vat_applied || total <= 0) return vat.vat_applied ? { ...vat, vat_amount: 0 } : vat
  const a = Number(amount) || 0
  return { ...vat, vat_amount: roundToCurrency((a * vat.vat_amount) / total, currency || 'EUR') }
}

/**
 * The VAT inside a gross amount paid towards a trip that carries VAT at its
 * recorded rate (an itinerary payment has no invoice to take a share of):
 * gross × rate / (100 + rate).
 */
export function vatInsideGross(
  gross: unknown,
  trip: { vat_applied?: unknown; vat_rate?: unknown } | null | undefined,
  currency: string | null | undefined
): VatRecord {
  if (trip?.vat_applied !== true) return { vat_applied: false, vat_rate: null, vat_amount: 0 }
  const rate = normaliseVatRate(trip.vat_rate) ?? DEFAULT_VAT_RATE
  const g = Number(gross) || 0
  return { vat_applied: true, vat_rate: rate, vat_amount: g > 0 ? roundToCurrency((g * rate) / (100 + rate), currency || 'EUR') : 0 }
}

/** Net + VAT, in the currency's unit. */
export function totalWithVat(net: unknown, vat: Pick<VatRecord, 'vat_applied' | 'vat_amount'>, currency: string | null | undefined): number {
  const n = Number(net) || 0
  return roundToCurrency(vat.vat_applied ? n + (Number(vat.vat_amount) || 0) : n, currency || 'EUR')
}

/** "14" for 14, "7.5" for 7.5 — never "14.00". */
export function formatVatRate(rate: number | null | undefined): string {
  const r = Number(rate) || 0
  return Number.isInteger(r) ? String(r) : String(Math.round(r * 100) / 100)
}

export type VatLang = 'en' | 'ja'

/**
 * The marker every client document carries: "VAT 14% included: ¥14,000" or
 * "VAT not applied" (Japanese: 「VAT（14%）適用：¥14,000」/「VAT 不適用」).
 */
export function vatMarker(vat: VatRecord, currency: string | null | undefined, lang: VatLang = 'en'): string {
  if (!vat.vat_applied) return lang === 'ja' ? 'VAT 不適用' : 'VAT not applied'
  const rate = formatVatRate(vat.vat_rate ?? DEFAULT_VAT_RATE)
  const amount = formatMoney(Number(vat.vat_amount) || 0, currency || 'EUR')
  return lang === 'ja' ? `VAT（${rate}%）適用：${amount}` : `VAT ${rate}% included: ${amount}`
}

/** "Net price" / 「税抜価格」: the price before VAT, when VAT is applied. */
export function netPriceLabel(lang: VatLang = 'en'): string {
  return lang === 'ja' ? '税抜価格' : 'Net price'
}

/** "Total incl. VAT" / 「VAT込み合計」. */
export function totalInclVatLabel(lang: VatLang = 'en'): string {
  return lang === 'ja' ? 'VAT込み合計' : 'Total incl. VAT'
}

/**
 * The lines a text message or email adds under a net total: the marker, and
 * when VAT is on, the total including it.
 */
export function vatTextLines(vat: VatRecord, net: unknown, currency: string | null | undefined, lang: VatLang = 'en'): string[] {
  const lines = [vatMarker(vat, currency, lang)]
  if (vat.vat_applied) {
    lines.push(`${totalInclVatLabel(lang)}${lang === 'ja' ? '：' : ': '}${formatMoney(totalWithVat(net, vat, currency), currency || 'EUR')}`)
  }
  return lines
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrgReader = { from(table: string): any }

/**
 * The company's VAT rate. Like lib/org-default-margin.ts it never throws: a
 * settings lookup must not stop a document being priced, so an unreadable
 * row (or a database without migration 20261214) gives the default 14.
 */
export async function getOrgVatRate(db: OrgReader, orgId: string | null | undefined): Promise<number> {
  if (!orgId) return DEFAULT_VAT_RATE
  try {
    const { data, error } = await db.from('organizations').select('vat_rate').eq('id', orgId).maybeSingle()
    if (error) {
      console.warn(`[vat] could not read organizations.vat_rate for ${orgId}: ${error.message}`)
      return DEFAULT_VAT_RATE
    }
    return normaliseVatRate(data?.vat_rate) ?? DEFAULT_VAT_RATE
  } catch (e) {
    console.warn(`[vat] lookup threw for ${orgId}: ${e instanceof Error ? e.message : String(e)}`)
    return DEFAULT_VAT_RATE
  }
}
