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
//   - vat_amount = base × rate / 100, rounded to the currency's own unit
//     (whole yen for JPY). The server computes it; an amount sent by a
//     browser is never stored.
//   - The BASE is the net less extras and insurance (owner, 2026-10-13: "No
//     taxes over extras or insurance"). On a quote that is the catalogue
//     extras' share of the selling price; on an invoice, the insurance
//     premiums and extras the server adds; on a trip, its 'extra' lines.
//     When something was left out the document records the base it taxed
//     (vat_base, migration 20261218) and its marker says so: "VAT 14%
//     included: ¥X (extras and insurance not taxed)". vat_base NULL means the
//     whole net was taxed — as on every document issued before this rule,
//     which keeps the VAT it recorded.
//
// Japanese wording follows the documents' own style: 「VAT（14%）適用：…」 /
// 「VAT 不適用」.

import { formatMoney, roundToCurrency } from '@/lib/currency-totals'
import { seasonSupplementOf, serviceClientPrice } from '@/lib/itinerary-client-price'
import { normalizeServiceType } from '@/lib/service-types'

/** The rate a company has until it sets its own (Egypt's standard VAT). */
export const DEFAULT_VAT_RATE = 14

/** Coerce to a rate in [0, 100], else null. */
export function normaliseVatRate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 100) / 100
}

/** What VAT is charged on: the net less what is not taxed, never below 0. */
export function vatBase(net: unknown, excluded: unknown, currency: string | null | undefined): number {
  const n = Number(net) || 0
  const x = Math.max(0, Number(excluded) || 0)
  return roundToCurrency(Math.max(0, n - x), currency || 'EUR')
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
  /**
   * The amount VAT was charged on, when that is less than the net because
   * extras or insurance were left out. Absent (or null) = the whole net.
   */
  vat_base?: number | null
}

/** Did this document leave extras or insurance out of its VAT? */
export function vatExcludesExtras(vat: Pick<VatRecord, 'vat_applied' | 'vat_base'> | null | undefined): boolean {
  return vat?.vat_applied === true && vat.vat_base !== null && vat.vat_base !== undefined
}

/**
 * The columns to store on a document priced at `net`, of which `excluded`
 * (extras and insurance) is not taxed. Off: rate null and amount 0 — the
 * document says "VAT not applied", whatever the setting is. vat_base is in
 * the record only when something was left out, so a document without extras
 * writes exactly what it did before migration 20261218.
 */
export function vatColumns(input: {
  applied: boolean
  net: unknown
  rate: unknown
  currency: string | null | undefined
  excluded?: unknown
}): VatRecord {
  if (!input.applied) return { vat_applied: false, vat_rate: null, vat_amount: 0 }
  const rate = normaliseVatRate(input.rate) ?? DEFAULT_VAT_RATE
  const excluded = Math.max(0, Number(input.excluded) || 0)
  if (excluded <= 0) return { vat_applied: true, vat_rate: rate, vat_amount: vatFor(input.net, rate, input.currency) }
  const base = vatBase(input.net, excluded, input.currency)
  return { vat_applied: true, vat_rate: rate, vat_amount: vatFor(base, rate, input.currency), vat_base: base }
}

/**
 * The VAT columns for an UPDATE of a row that may already record a base: a
 * re-priced or switched document with nothing left out now clears it (NULL).
 * Touched only when the row has one, so a database without migration
 * 20261218 is never asked for the column.
 */
export function vatUpdateColumns(vat: VatRecord, current: { vat_base?: unknown } | null | undefined): VatRecord {
  if (vat.vat_base !== undefined && vat.vat_base !== null) return vat
  const rest: VatRecord = { vat_applied: vat.vat_applied, vat_rate: vat.vat_rate, vat_amount: vat.vat_amount }
  return current?.vat_base !== null && current?.vat_base !== undefined ? { ...rest, vat_base: null } : rest
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
  vat_base?: unknown
} | null | undefined): VatRecord {
  const applied = row?.vat_applied === true
  return withBase({
    vat_applied: applied,
    vat_rate: applied ? normaliseVatRate(row?.vat_rate) : null,
    vat_amount: applied ? Number(row?.vat_amount) || 0 : 0,
  }, applied ? row?.vat_base : null)
}

/** Carry a recorded base onto a record, only when there is one. */
function withBase(vat: VatRecord, base: unknown): VatRecord {
  if (base === null || base === undefined || base === '') return vat
  const b = Number(base)
  return Number.isFinite(b) ? { ...vat, vat_base: b } : vat
}

/**
 * An invoice records its VAT in its long-standing tax columns: tax_rate and
 * tax_amount, with vat_applied saying whether there is any.
 */
export function readInvoiceVat(inv: {
  vat_applied?: unknown
  tax_rate?: unknown
  tax_amount?: unknown
  vat_base?: unknown
} | null | undefined): VatRecord {
  const amount = Number(inv?.tax_amount) || 0
  // A row from before the migration with tax on it was issued with tax.
  const applied = inv?.vat_applied === true || (inv?.vat_applied === undefined && amount > 0)
  return withBase({
    vat_applied: applied,
    vat_rate: applied ? normaliseVatRate(inv?.tax_rate) : null,
    vat_amount: applied ? amount : 0,
  }, applied ? inv?.vat_base : null)
}

/**
 * A trip's VAT facts as its documents read them: the flag and the rate it
 * took from its quote and, when the reader worked them out from the trip's
 * lines (tripVatExcluded / loadTripVatExtras), the client price of its extras
 * (not taxed) and the client total they are part of.
 */
export interface TripVat {
  vat_applied?: unknown
  vat_rate?: unknown
  /** Client price of the trip's extras: left out of the VAT base. */
  vat_excluded?: unknown
  /** The trip's client total those extras are part of. */
  vat_net?: unknown
}

/**
 * VAT on a document whose net still moves (an itinerary's client total is
 * re-added from its lines): the RATE is the one recorded when the flag was
 * set, the amount follows the net it is shown beside, less the trip's extras.
 */
export function vatOnLiveNet(
  row: TripVat | null | undefined,
  net: unknown,
  currency: string | null | undefined
): VatRecord {
  if (row?.vat_applied !== true) return { vat_applied: false, vat_rate: null, vat_amount: 0 }
  return vatColumns({ applied: true, net, rate: normaliseVatRate(row.vat_rate) ?? DEFAULT_VAT_RATE, currency, excluded: row.vat_excluded })
}

/**
 * The VAT inside a payment towards an invoice: the invoice's recorded VAT in
 * proportion to the share of the invoice this payment is. A receipt for half
 * an invoice carrying ¥14,000 VAT says ¥7,000 of it is VAT.
 */
export function vatInPayment(
  amount: unknown,
  invoice: { vat_applied?: unknown; tax_rate?: unknown; tax_amount?: unknown; total_amount?: unknown; vat_base?: unknown } | null | undefined,
  currency: string | null | undefined
): VatRecord {
  // The invoice's VAT already left its extras and insurance out; the share
  // keeps the invoice's base as its flag, so the receipt carries the note too.
  const vat = readInvoiceVat(invoice)
  const total = Number(invoice?.total_amount) || 0
  if (!vat.vat_applied || total <= 0) return vat.vat_applied ? { ...vat, vat_amount: 0 } : vat
  const a = Number(amount) || 0
  return { ...vat, vat_amount: roundToCurrency((a * vat.vat_amount) / total, currency || 'EUR') }
}

/**
 * The VAT inside a gross amount paid towards a trip that carries VAT at its
 * recorded rate (an itinerary payment has no invoice to take a share of):
 * gross × rate / (100 + rate). When the trip has extras (vat_excluded of its
 * client total vat_net) only the taxed share s = (net − extras) / net bears
 * VAT, so it is gross × rate·s / (100 + rate·s): the same proportion of the
 * payment as the trip's VAT is of the trip's total incl. VAT.
 */
export function vatInsideGross(
  gross: unknown,
  trip: TripVat | null | undefined,
  currency: string | null | undefined
): VatRecord {
  if (trip?.vat_applied !== true) return { vat_applied: false, vat_rate: null, vat_amount: 0 }
  const rate = normaliseVatRate(trip.vat_rate) ?? DEFAULT_VAT_RATE
  const cur = currency || 'EUR'
  const g = Number(gross) || 0
  const net = Number(trip.vat_net) || 0
  const excluded = Math.max(0, Number(trip.vat_excluded) || 0)
  const share = net > 0 && excluded > 0 ? Math.max(0, net - excluded) / net : 1
  const effective = rate * share
  const amount = g > 0 && effective > 0 ? roundToCurrency((g * effective) / (100 + effective), cur) : 0
  const vat: VatRecord = { vat_applied: true, vat_rate: rate, vat_amount: amount }
  // The part of this payment VAT was charged on — recorded only when the
  // trip's extras were left out, so the receipt says so.
  return share < 1 ? { ...vat, vat_base: g > 0 ? roundToCurrency((g - amount) * share, cur) : 0 } : vat
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

/** What a marker adds when the document left extras or insurance out. */
export function vatExclusionNote(lang: VatLang = 'en'): string {
  return lang === 'ja' ? '（オプション・保険はVAT対象外）' : ' (extras and insurance not taxed)'
}

/**
 * The marker every client document carries: "VAT 14% included: ¥14,000" or
 * "VAT not applied" (Japanese: 「VAT（14%）適用：¥14,000」/「VAT 不適用」),
 * with " (extras and insurance not taxed)" when the document left them out.
 */
export function vatMarker(vat: VatRecord, currency: string | null | undefined, lang: VatLang = 'en'): string {
  if (!vat.vat_applied) return lang === 'ja' ? 'VAT 不適用' : 'VAT not applied'
  const rate = formatVatRate(vat.vat_rate ?? DEFAULT_VAT_RATE)
  const amount = formatMoney(Number(vat.vat_amount) || 0, currency || 'EUR')
  const note = vatExcludesExtras(vat) ? vatExclusionNote(lang) : ''
  return lang === 'ja' ? `VAT（${rate}%）適用：${amount}${note}` : `VAT ${rate}% included: ${amount}${note}`
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

// ---------------------------------------------------------------------------
// What is NOT taxed: extras and insurance (owner, 2026-10-13)
// ---------------------------------------------------------------------------
// An extra is a catalogue extra priced into a quote (rate_source
// 'extras_catalogue'), a trip line of type 'extra' (what a quote's extras
// become on conversion), or an extra / upgrade sold after the sale and billed
// on an invoice (booking_extras). Insurance is a traveller's premium billed on
// an invoice; a line of category 'insurance' anywhere is treated the same.

const VAT_EXEMPT_CATEGORIES = new Set(['extra', 'extras', 'extras_catalogue', 'insurance'])

/** Is a line of this category / service type left out of the VAT base? */
export function isVatExemptCategory(category: unknown): boolean {
  return typeof category === 'string' && VAT_EXEMPT_CATEGORIES.has(normalizeServiceType(category))
}

type QuoteLine = {
  rate_source?: unknown
  service_category?: unknown
  line_total?: unknown
  extra?: { pinned?: unknown; sell_total?: unknown } | null
}

/**
 * The part of a B2B quote's selling price that is extras (and insurance), from
 * its services_snapshot: what the engine added for each such line — a pinned
 * price as it is, else its cost at the quote's margin — with the season
 * premium on top, as the engine takes it on the whole trip
 * (app/api/b2b/calculate-price foldExtras).
 */
export function quoteVatExcluded(quote: {
  services_snapshot?: unknown
  margin_percent?: unknown
  season_uplift_percent?: unknown
} | null | undefined): number {
  const lines = Array.isArray(quote?.services_snapshot) ? (quote.services_snapshot as QuoteLine[]) : []
  const m = Number(quote?.margin_percent) || 0
  const u = Number(quote?.season_uplift_percent) || 0
  let total = 0
  for (const l of lines) {
    if (!l || (l.rate_source !== 'extras_catalogue' && !isVatExemptCategory(l.service_category))) continue
    const pinnedSell = l.extra?.pinned === true && l.extra.sell_total !== null ? Number(l.extra.sell_total) : NaN
    const sell = Number.isFinite(pinnedSell) ? pinnedSell : (Number(l.line_total) || 0) * (1 + m / 100)
    total += sell * (1 + u / 100)
  }
  return Math.round(total * 100) / 100
}

type TripLine = { service_type?: unknown; total_cost?: unknown; client_price?: unknown }

/** The client price of a trip's extras lines — what its VAT leaves out. */
export function tripVatExcluded(days: Array<{ services?: TripLine[] | null }> | null | undefined): number {
  let total = 0
  for (const day of days ?? []) {
    for (const s of day.services ?? []) {
      if (isVatExemptCategory(s.service_type)) total += serviceClientPrice(s)
    }
  }
  return Math.round(total * 100) / 100
}

/** The share of a trip's client total that is extras, in [0, 1]. */
export function tripVatExcludedShare(trip: { vat_excluded?: unknown; vat_net?: unknown } | null | undefined): number {
  const net = Number(trip?.vat_net) || 0
  const x = Math.max(0, Number(trip?.vat_excluded) || 0)
  return net > 0 ? Math.min(1, x / net) : 0
}

/** What a trip's lines say about its VAT base. */
export interface TripVatExtras {
  /** The trip's client total (its lines plus the season premium). */
  vat_net: number
  /** Client price of its extras lines. */
  vat_excluded: number
  /** Supplier cost of its extras lines (an offer is priced from cost). */
  excluded_cost: number
}

/**
 * Read a trip's lines and add up its extras. Never throws: a trip whose lines
 * cannot be read is taxed on its whole net, as before, rather than refused.
 */
export async function loadTripVatExtras(db: OrgReader, itineraryId: string | null | undefined): Promise<TripVatExtras> {
  const none: TripVatExtras = { vat_net: 0, vat_excluded: 0, excluded_cost: 0 }
  if (!itineraryId) return none
  try {
    const [{ data: days }, { data: trip }] = await Promise.all([
      db.from('itinerary_days').select('id').eq('itinerary_id', itineraryId),
      db.from('itineraries').select('*').eq('id', itineraryId).maybeSingle(),
    ])
    const ids = ((days ?? []) as Array<{ id: string }>).map(d => d.id)
    if (!ids.length) return { ...none, vat_net: Number(trip?.total_cost) || 0 }
    const { data: services, error } = await db
      .from('itinerary_services')
      .select('service_type, total_cost, client_price')
      .in('itinerary_day_id', ids)
    if (error) {
      console.warn(`[vat] could not read the lines of ${itineraryId}: ${error.message}`)
      return none
    }
    const lines = (services ?? []) as TripLine[]
    const r2 = (n: number) => Math.round(n * 100) / 100
    const clientLines = lines.reduce((s, l) => s + serviceClientPrice(l), 0)
    return {
      vat_net: clientLines > 0 ? r2(clientLines + seasonSupplementOf(trip)) : Number(trip?.total_cost) || 0,
      vat_excluded: tripVatExcluded([{ services: lines }]),
      excluded_cost: r2(lines.filter(l => isVatExemptCategory(l.service_type)).reduce((s, l) => s + (Number(l.total_cost) || 0), 0)),
    }
  } catch (e) {
    console.warn(`[vat] trip lines lookup threw for ${itineraryId}: ${e instanceof Error ? e.message : String(e)}`)
    return none
  }
}

/**
 * The part of a B2C offer's price that is the trip's extras. An offer is its
 * trip's supplier cost plus margin plus the season premium — every step a
 * percentage — so the extras' share of the price is their share of the cost.
 */
export function offerVatExcluded(input: {
  sellingPrice: unknown
  cost: unknown
  extrasCost: unknown
  currency: string | null | undefined
}): number {
  const cost = Number(input.cost) || 0
  const x = Math.max(0, Number(input.extrasCost) || 0)
  if (cost <= 0 || x <= 0) return 0
  return roundToCurrency((Number(input.sellingPrice) || 0) * Math.min(1, x / cost), input.currency || 'EUR')
}

/** The invoice lines the server added as insurance or an extra (tagged `source`). */
export function invoiceLinesVatExcluded(lines: unknown): number {
  if (!Array.isArray(lines)) return 0
  let total = 0
  for (const l of lines as Array<{ source?: unknown; amount?: unknown; quantity?: unknown; unit_price?: unknown }>) {
    if (l?.source !== 'insurance' && l?.source !== 'extra') continue
    const amount = l.amount !== undefined && l.amount !== null ? Number(l.amount) : (Number(l.quantity) || 1) * (Number(l.unit_price) || 0)
    if (Number.isFinite(amount) && amount > 0) total += amount
  }
  return Math.round(total * 100) / 100
}

/**
 * What an invoice's VAT leaves out of its net: the insurance and extras the
 * server added to it, plus — when it bills a trip whose lines include extras —
 * that share of the rest. One rule for a standard, deposit or final invoice,
 * so a deposit and its final together tax the trip less its extras.
 */
export function invoiceVatExcluded(input: {
  net: unknown
  additions: unknown
  tripShare: unknown
  currency: string | null | undefined
}): number {
  const additions = Math.max(0, Number(input.additions) || 0)
  const rest = Math.max(0, (Number(input.net) || 0) - additions)
  const share = Math.min(1, Math.max(0, Number(input.tripShare) || 0))
  return roundToCurrency(additions + rest * share, input.currency || 'EUR')
}
