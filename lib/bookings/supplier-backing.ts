// ============================================
// Does "Suppliers Confirmed" mean anything on this booking?
// ============================================
// bookings.status used to be written straight from the header dropdown with no
// reference to booking_supplier_status, so a booking could announce that every
// supplier was confirmed while its Suppliers tab was empty. One rule, defined
// here, is what the API enforces and what the header shows — the two must
// never drift apart.
//
// An empty Suppliers tab is NOT backing. `Math.max(total, 1)` is what makes
// zero rows fail: "all zero of my suppliers are confirmed" is exactly the
// claim that started this.

/** True when the supplier rows themselves justify a supplier_confirmed status. */
export function isSupplierBacked(total: number, confirmed: number): boolean {
  return confirmed >= Math.max(total, 1)
}

export interface SupplierBacking {
  total: number
  confirmed: number
  backed: boolean
}

/** The same rule, counted from the booking's supplier rows. */
export function supplierBacking(
  rows: { status: string | null }[] | null | undefined
): SupplierBacking {
  const list = rows ?? []
  const total = list.length
  const confirmed = list.filter(r => r.status === 'confirmed').length
  return { total, confirmed, backed: isSupplierBacked(total, confirmed) }
}
