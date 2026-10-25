// ============================================
// Rate rows for a PICKER, in the company's rate currency
// ============================================
// The rate pages list each row in its own currency (an EGP guide rate says
// E£1,500 with a badge). The pickers that COPY a rate onto something — the
// supplier voucher editor, the itinerary's rate picker — took base_rate_eur
// as if it were in the company's rate currency, so a USD company's guide
// rate of 1500 EGP went onto a voucher as $1,500 instead of about $31 (Rates
// audit, Guides & Services #1; the bug Tour Manager already had fixed).
//
// A list route asked with ?in_rate_currency=true hands its rows through the
// pricing engines' own normaliser (lib/rates/rate-currency): each row from
// ITS rate_currency into the company's, the org's own exchange rates merged
// over the market's. A row is then marked in the company's currency, with
// the currency it was entered in kept beside it; a row no rate can convert
// has no price (null) and says so — never its unconverted number.
// entered_fx is 1 unit of the entered currency in the company's, the factor
// the row was converted with, so a line priced from it can say what the
// supplier is paid in (lib/paid-currency); null for a row in the company's.

import { createRateNormalizer, type RateCurrencyTable } from '@/lib/rates/rate-currency'
import type { ExchangeRates } from '@/lib/currency-service'
import { normaliseRateCurrency } from '@/lib/org-rate-currency'

export async function rowsInRateCurrency<T extends Record<string, unknown>>(
  table: RateCurrencyTable,
  rows: T[],
  rateCurrency: string,
  deps?: { getRates?: () => Promise<ExchangeRates> }
): Promise<Array<T & { entered_currency: string | null; entered_fx: number | null; rate_unconvertible?: true }>> {
  const normalizer = createRateNormalizer(rateCurrency, deps)
  const converted = ((await normalizer.normalize(table, rows)) ?? rows) as T[]
  const missed = new Set(normalizer.misses.map(m => String(m.id)))
  const run = normaliseRateCurrency(rateCurrency)
  const factors = new Map<string, number | null>()
  for (const row of rows) {
    const cur = normaliseRateCurrency(row?.rate_currency)
    if (cur && cur !== run && !factors.has(cur)) factors.set(cur, await normalizer.fxFor(cur))
  }
  return converted.map((row, i) => {
    const entered = (rows[i]?.rate_currency as string | null | undefined) ?? null
    const cur = normaliseRateCurrency(entered)
    return {
      ...row,
      rate_currency: rateCurrency,
      entered_currency: entered,
      entered_fx: cur && cur !== run ? factors.get(cur) ?? null : null,
      ...(missed.has(String(row.id)) ? { rate_unconvertible: true as const } : {}),
    }
  })
}
