// ============================================
// Natural-key matching for rate CREATE routes
// ============================================
// A create route looks for "the same rate" before inserting. Every column it
// leaves OUT of that lookup is a column two real rates may differ by while
// still matching — and then the second one silently REPLACES the first.
//
// That is exactly what happened to the train rates (2026-08-31 / 2026-09-02):
// the key was (origin, destination, class, supplier) — no train, no validity
// period — so entering the Talgo price for Cairo→Qena overwrote the ENR price,
// and entering the VIP Train price overwrote the Talgo one. Thirteen "create"
// requests, zero inserts; the row count never moved, so nothing looked deleted.
// The audit log (rate_audit_log) is the only reason the numbers were recoverable.
//
// Two rules this helper exists to make easy to follow:
//   1. The key is the FULL identity of a rate — including every column a user
//      can pick on the form that distinguishes one priced thing from another.
//   2. A create route never updates. On a full-key match it answers 409 with
//      the existing row, and the form offers to edit THAT rate.

type Filterable = {
  eq: (col: string, val: unknown) => Filterable
  is: (col: string, val: null) => Filterable
  ilike: (col: string, pattern: string) => Filterable
}

/**
 * Narrow `query` to rows whose `col` equals `value`, treating null/''/undefined
 * as one identity (SQL `IS NULL`). `ilike` makes text compare case-insensitively
 * (city names are typed by hand: "Cairo" and "cairo" are one place).
 */
export function whereNullable<Q extends Filterable>(
  query: Q,
  col: string,
  value: unknown,
  opts: { ilike?: boolean } = {}
): Q {
  if (value === null || value === undefined || value === '') {
    return query.is(col, null) as Q
  }
  return (opts.ilike ? query.ilike(col, String(value)) : query.eq(col, value)) as Q
}

/** A human-readable "valid 2026-09-02 to 2027-09-02" fragment, or '' when undated. */
export function describeValidity(from: string | null | undefined, to: string | null | undefined): string {
  if (!from && !to) return ''
  if (from && to) return `, valid ${from} to ${to}`
  return from ? `, valid from ${from}` : `, valid until ${to}`
}
