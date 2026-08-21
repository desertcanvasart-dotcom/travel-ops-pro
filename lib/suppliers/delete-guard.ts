// ============================================
// May this supplier be deleted?
// ============================================
// 28 columns reference suppliers.id. The rate tables and the trip assignment
// columns are ON DELETE SET NULL — a deleted supplier's rates simply become
// unattributed, which is how single-row delete has always behaved. The tables
// below are different: they are money and records. A supplier with an invoice,
// an expense, a commission, a priced line on a trip, a booking status or a
// document must not vanish from under them, and a parent company must not
// vanish from under its properties.
//
// The route refuses with 409 and names what blocks it — the same shape as the
// departments delete — instead of a 500 from a foreign-key violation, or worse,
// a quiet orphan if the constraint happens to cascade. Bulk delete relies on
// this: one referenced supplier in a selection of twenty must fail alone,
// with its reason, while the other nineteen go.
// ============================================

export const SUPPLIER_REFERENCE_CHECKS = [
  { table: 'supplier_invoices',       column: 'supplier_id',        label: 'invoices' },
  { table: 'expenses',                column: 'supplier_id',        label: 'expenses' },
  { table: 'commissions',             column: 'supplier_id',        label: 'commissions' },
  { table: 'itinerary_services',      column: 'supplier_id',        label: 'priced trip services' },
  { table: 'booking_supplier_status', column: 'supplier_id',        label: 'booking statuses' },
  { table: 'supplier_documents',      column: 'supplier_id',        label: 'documents' },
  { table: 'suppliers',               column: 'parent_supplier_id', label: 'child properties' },
] as const

export type ReferenceCount = { label: string; count: number }

/** Human sentence naming every non-zero reference, or null when nothing blocks. */
export function describeBlockers(counts: ReferenceCount[]): string | null {
  const blocking = counts.filter((c) => c.count > 0)
  if (blocking.length === 0) return null
  const parts = blocking.map((c) => `${c.count} ${c.label}`)
  return `Supplier is referenced by ${parts.join(', ')} — deactivate it instead`
}
