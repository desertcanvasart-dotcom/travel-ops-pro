// ============================================
// Money on the tour-builder screens
// ============================================
// The builder's selectors read rate rows through /api/rates?type=…&
// in_org_currency=true, so every amount they show is ALREADY in the org's
// rate currency — converted by the server from whatever the row was entered
// in, through the same normaliser the pricing engine uses. That is the only
// reason the org symbol is right here: a raw row printed under the org symbol
// is exactly the bug that made 101 EGP transport rates read as dollars.
//
// Two things the server can hand back that a plain `.toFixed(2)` mishandles:
//   - a NULL amount: the row is unpriced, or its currency could not be
//     converted (no FX rate on file). That is a hole to show, not a 0 — and
//     certainly not a crash.
//   - `converted_from`: the currency the row was entered in, when it differs.
//     The screen says so, so a number that looks odd can be traced.

/** `$1,234.50`, or a dash for an unpriced/unconvertible amount. */
export function fmtMoney(symbol: string, amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—'
  return `${symbol}${Number(amount).toFixed(2)}`
}

/** Multiply a possibly-unpriced unit rate; a hole stays a hole. */
export function times(amount: number | null | undefined, factor: number): number | null {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return null
  return Number(amount) * factor
}

/** A row's original currency when the server converted it, else null. */
export function convertedFrom(row: { converted_from?: string | null } | null | undefined): string | null {
  return row?.converted_from || null
}
