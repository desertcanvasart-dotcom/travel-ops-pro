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
