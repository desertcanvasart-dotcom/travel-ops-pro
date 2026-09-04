// ============================================
// PER-CURRENCY TOTALS
// ============================================
// Money in different currencies does not add. A $10,000 payment and a £5,000
// payment are not "€15,000 received" — that figure is not true in any currency,
// and it drives wrong revenue and wrong collection decisions.
//
// These helpers keep sums SEPARATE by currency so a tile can show
// "€12,400 + $3,000" instead of a merged fiction. No FX conversion happens
// here and no rate is ever invented; when a report genuinely needs one number,
// it converts through lib/fx-conversion.ts, which refuses to guess.

export type CurrencyTotals = Record<string, number>

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  EGP: 'E£',
  JPY: '¥',
}

/** Currencies with no minor unit — rendering ¥1,200.00 is wrong, not just ugly. */
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY'])

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] || code
}

export function currencyDecimals(code: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(code.toUpperCase()) ? 0 : 2
}

/**
 * Round an amount to the smallest unit its currency actually has.
 *
 * Any money DERIVED by arithmetic — a deposit taken as a percentage, a balance
 * taken as a difference, a converted amount — has to pass through here before
 * it is stored or billed. `(1854367 * 20) / 100` is ¥370,873.4, and a yen with
 * a decimal place is not a quantity of money that exists.
 */
export function roundToCurrency(amount: unknown, currency: unknown): number {
  const code = normCurrency(currency)
  const factor = currencyDecimals(code) === 0 ? 1 : 100
  return Math.round(num(amount) * factor) / factor
}

/** Normalise to a 3-letter upper code; blank/garbage falls back to EUR. */
function normCurrency(c: unknown): string {
  const s = typeof c === 'string' ? c.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(s) ? s : 'EUR'
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

/** Start an empty accumulator. */
export function emptyTotals(): CurrencyTotals {
  return {}
}

/**
 * Add one amount to its currency bucket.
 *
 * Rounded to the currency's own precision: cents for EUR/USD/GBP/EGP, whole
 * units for JPY. Rounding a yen bucket to 2dp would accumulate fractional yen
 * that cannot exist.
 */
export function addToTotals(totals: CurrencyTotals, amount: unknown, currency: unknown): void {
  const code = normCurrency(currency)
  const factor = currencyDecimals(code) === 0 ? 1 : 100
  const next = (totals[code] ?? 0) + num(amount)
  totals[code] = Math.round(next * factor) / factor
}

/** Sum a list into per-currency totals. */
export function sumByCurrency<T>(
  items: T[] | null | undefined,
  getAmount: (item: T) => unknown,
  getCurrency: (item: T) => unknown
): CurrencyTotals {
  const totals = emptyTotals()
  for (const item of items ?? []) addToTotals(totals, getAmount(item), getCurrency(item))
  return totals
}

/** Format one amount in its own currency, at that currency's precision. */
export function formatMoney(amount: number, currency: string): string {
  const code = normCurrency(currency)
  const decimals = currencyDecimals(code)
  return `${currencySymbol(code)}${amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

export type RateAverage = { amount: number; currency: string | null }

/**
 * Average a rate column in ONE currency, or refuse to average at all.
 *
 * The same rule as sumByCurrency, one level up. An average across currencies
 * is not a rougher version of the truth, it is a different number: summing a
 * raw 600 (EGP) with a raw 22 (org currency) produced the ¥44,817 header
 * fiction on the attractions page, and "Avg. Tip $600.00" for two rows stored
 * as EGP 500 and EGP 700 is neither a dollar figure nor a number anybody
 * typed (operator, 1 Sep).
 *
 * So: average the org-currency rows when there are any; otherwise, if every
 * priced row shares one entry currency (an all-EGP list), average in THAT
 * currency; mixed currencies get null, which the caller renders as a dash.
 * Nothing is ever converted — this is a stat, not an exchange desk.
 *
 * Unpriced rows are excluded from both the sum AND the count, because a blank
 * rate is a hole and not a 0. (Dividing by every row, holes included, is what
 * the first version of this on the attractions page did.)
 *
 * Returns null — never the string '—' — so a caller cannot format a dash as
 * a number. That mistake is where the ¥NaN card came from.
 */
export function averageRateInOneCurrency<T>(
  items: T[] | null | undefined,
  getAmount: (item: T) => unknown,
  getCurrency: (item: T) => unknown
): RateAverage | null {
  const code = (item: T): string | null => {
    const c = getCurrency(item)
    return typeof c === 'string' && c.trim() ? c.trim().toUpperCase() : null
  }
  const priced = (items ?? []).filter(i => num(getAmount(i)) > 0)
  if (priced.length === 0) return null

  // Rounded to the currency's own precision, the same rule addToTotals
  // follows: an average of ¥100 and ¥101 is ¥101, not ¥100.5.
  const avg = (rows: T[], currency: string | null) => {
    const mean = rows.reduce((sum, r) => sum + num(getAmount(r)), 0) / rows.length
    if (!currency) return mean
    const factor = currencyDecimals(currency) === 0 ? 1 : 100
    return Math.round(mean * factor) / factor
  }

  const orgRows = priced.filter(i => code(i) === null)
  if (orgRows.length) return { amount: avg(orgRows, null), currency: null }

  const currencies = new Set(priced.map(code))
  if (currencies.size === 1) {
    const currency = code(priced[0])
    return { amount: avg(priced, currency), currency }
  }
  return null
}

/** Render a RateAverage in its own currency, the org's, or an honest dash. */
export function formatRateAverage(
  average: RateAverage | null,
  orgFormat: (amount: number) => string
): string {
  if (average === null) return '\u2014'
  return average.currency
    ? formatMoney(average.amount, average.currency)
    : orgFormat(average.amount)
}

export type RateAverageBucket = RateAverage & { count: number }

/**
 * Per-currency averages — the mixed-list answer averageRateInOneCurrency
 * refuses to give. Same honesty rule (nothing is ever converted, unpriced
 * rows are excluded); instead of a dash, a mixed list gets one true number
 * PER currency: 16 EGP meals and 2 USD meals read "E£812 · $23", which is
 * what the operator's list actually says (Meal Rates card, 2026-09-04).
 * Buckets are ordered by row count, biggest first; org-currency rows (no
 * entry currency) form their own bucket with currency null.
 */
export function averageRatesByCurrency<T>(
  items: T[] | null | undefined,
  getAmount: (item: T) => unknown,
  getCurrency: (item: T) => unknown
): RateAverageBucket[] {
  const buckets = new Map<string, T[]>()
  for (const item of items ?? []) {
    if (num(getAmount(item)) <= 0) continue
    const c = getCurrency(item)
    const code = typeof c === 'string' && c.trim() ? c.trim().toUpperCase() : ''
    const rows = buckets.get(code)
    if (rows) rows.push(item)
    else buckets.set(code, [item])
  }
  const out: RateAverageBucket[] = []
  for (const [code, rows] of buckets) {
    const currency = code || null
    const mean = rows.reduce((sum, r) => sum + num(getAmount(r)), 0) / rows.length
    const factor = currency && currencyDecimals(currency) === 0 ? 1 : 100
    out.push({ amount: Math.round(mean * factor) / factor, currency, count: rows.length })
  }
  return out.sort((a, b) => b.count - a.count)
}

/** "E£812.00 · $23.00" — or a dash when nothing is priced. */
export function formatRateAverages(
  buckets: RateAverageBucket[],
  orgFormat: (amount: number) => string
): string {
  if (buckets.length === 0) return '—'
  return buckets
    .map(b => (b.currency ? formatMoney(b.amount, b.currency) : orgFormat(b.amount)))
    .join(' · ')
}

/**
 * Render totals for a single tile: "€1,200.00 + $300.00".
 *
 * Empty → a zero in the given default currency, so a tile never renders blank.
 * Buckets that summed to exactly 0 are dropped UNLESS that leaves nothing, in
 * which case one zero is shown.
 */
export function formatTotals(totals: CurrencyTotals, opts?: { defaultCurrency?: string }): string {
  const entries = Object.entries(totals).filter(([, v]) => v !== 0)
  if (entries.length === 0) {
    return formatMoney(0, opts?.defaultCurrency ?? 'EUR')
  }
  // Largest first, so the dominant currency leads.
  entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  return entries.map(([code, v]) => formatMoney(v, code)).join(' + ')
}
