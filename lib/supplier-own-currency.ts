// ============================================
// A supplier's lines in the supplier's OWN currency, when that is safe
// ============================================
// itinerary_services.total_cost is converted to the TRIP's currency (and
// moves with every FX reprice); supplier_currency / supplier_cost_original /
// exchange_rate_used record what the supplier actually charges. An Egyptian
// hotel contracted at EGP 15,000 on a yen trip is owed EGP 15,000, not
// "¥45,xxx".
//
// supplier_cost_original is written when the line is created and NOT kept in
// step when the line is edited (2 rooms → 3 changes total_cost only). So a
// line's own-currency cost is used only while it still agrees with total_cost
// at the rate it was converted at; a stale amount is never stated. When every
// line is in one foreign currency and agrees, the money is in that currency;
// otherwise it stays in the trip's, at total_cost.
//
// Used by vouchers (lib/documents/plan-documents voucherMoney) and by a
// booking's supplier rows (lib/bookings/supplier-lines), so a voucher and the
// expense for the same supplier agree. The SQL backfill in
// migrations/20270101_booking_supplier_currency.sql applies the same rule.

export interface OwnCurrencyLine {
  total_cost?: number | string | null
  supplier_currency?: string | null
  supplier_cost_original?: number | string | null
  exchange_rate_used?: number | string | null
}

const num = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

/** The line's own-currency cost still agrees with its trip-currency total. */
export function ownCostIsCurrent(s: OwnCurrencyLine): boolean {
  const original = num(s.supplier_cost_original)
  const rate = num(s.exchange_rate_used)
  const total = num(s.total_cost)
  if (original === null || rate === null || rate <= 0 || total === null) return false
  // Within a cent per unit of trip currency, or 0.5% — rounding, not an edit.
  return Math.abs(original * rate - total) <= Math.max(0.01, Math.abs(total) * 0.005)
}

/**
 * The money for a group of one supplier's lines: `own` is true when it is in
 * the supplier's own currency (every line agrees, one foreign currency).
 */
export function supplierOwnMoney(
  services: OwnCurrencyLine[],
  tripCurrency: string,
): { currency: string; total: number; lineAmounts: number[]; own: boolean } {
  const trip = String(tripCurrency || '').trim().toUpperCase()
  const currencies = new Set(services.map(s => String(s.supplier_currency ?? '').trim().toUpperCase()))
  const [only] = [...currencies]
  const own = services.length > 0
    && currencies.size === 1
    && !!only
    && only !== trip
    && services.every(ownCostIsCurrent)
  const lineAmounts = services.map(s => (own ? num(s.supplier_cost_original) : num(s.total_cost)) ?? 0)
  const total = Math.round(lineAmounts.reduce((a, b) => a + b, 0) * 100) / 100
  return { currency: own ? only : tripCurrency, total, lineAmounts, own }
}
