// ============================================
// May this supplier be deleted?
// ============================================
// 28 columns reference suppliers.id. Most are ON DELETE SET NULL, and some
// have no foreign key at all — so a delete the database accepts could still
// quietly take things with it:
//   - supplier_properties is ON DELETE CASCADE: deleting a hotel group or a
//     cruise line deleted its hotels and ships, and every rate's property_id
//     went NULL behind them. The property's own delete refuses while rates use
//     it; the supplier delete went round that guard through the cascade.
//   - every rate table is SET NULL: the rates stayed, bought from nobody.
//   - trip assignments (itineraries.assigned_*, bookings.assigned_guide_id,
//     tour_departures.assigned_guide_id, itinerary_resources.resource_id):
//     a guide assigned to next week's trips was silently unassigned, or left
//     as an id pointing at nothing where there is no foreign key.
//   - booking extras and the extras catalogue: SET NULL.
// And the money and records — an invoice, an expense, a commission, a priced
// line on a trip, a booking status, a voucher — must never lose their supplier.
//
// So a supplier anything still points at is refused: 409, counted by kind,
// "— deactivate it instead". An inactive supplier keeps every link. Bulk
// delete relies on this: one referenced supplier in a selection of twenty
// fails alone, with its reason, while the other nineteen go.
// ============================================

export interface SupplierReferenceCheck {
  table: string
  column: string
  /** What the operator is told it is; checks sharing a label are summed. */
  label: string
}

/** Every rate table that carries supplier_id (the set
 *  20261205_suppliers_org_id walks). A table this database lacks reads as 0. */
export const SUPPLIER_RATE_TABLES = [
  'accommodation_rates', 'activity_rates', 'airport_staff_rates', 'assistant_rates',
  'entrance_fees', 'flight_rates', 'guide_rates', 'hotel_staff_rates', 'meal_rates',
  'nile_cruises', 'seasonal_rates', 'sleeping_train_rates', 'train_rates',
  'transportation_rates', 'vehicle_rates',
] as const

export const SUPPLIER_REFERENCE_CHECKS: readonly SupplierReferenceCheck[] = [
  { table: 'supplier_properties',     column: 'supplier_id',               label: 'properties' },
  ...SUPPLIER_RATE_TABLES.map((table) => ({ table, column: 'supplier_id', label: 'rates' })),
  { table: 'itineraries',             column: 'assigned_guide_id',         label: 'trip assignments' },
  { table: 'itineraries',             column: 'assigned_airport_staff_id', label: 'trip assignments' },
  { table: 'itineraries',             column: 'assigned_hotel_staff_id',   label: 'trip assignments' },
  { table: 'itinerary_resources',     column: 'resource_id',               label: 'trip assignments' },
  { table: 'tour_departures',         column: 'assigned_guide_id',         label: 'departure assignments' },
  { table: 'bookings',                column: 'assigned_guide_id',         label: 'bookings' },
  { table: 'booking_supplier_status', column: 'supplier_id',               label: 'booking statuses' },
  { table: 'booking_extras',          column: 'supplier_id',               label: 'booking extras' },
  { table: 'extras_catalogue',        column: 'supplier_id',               label: 'catalogue extras' },
  { table: 'supplier_invoices',       column: 'supplier_id',               label: 'invoices' },
  { table: 'expenses',                column: 'supplier_id',               label: 'expenses' },
  { table: 'commissions',             column: 'supplier_id',               label: 'commissions' },
  { table: 'itinerary_services',      column: 'supplier_id',               label: 'priced trip services' },
  { table: 'itinerary_services',      column: 'sold_by_supplier_id',       label: 'trip services sold' },
  { table: 'supplier_documents',      column: 'supplier_id',               label: 'vouchers and documents' },
]

export type ReferenceCount = { label: string; count: number }

/** A count query's error meaning "this database has no such table or column"
 *  — nothing there can point at the supplier. Any other error is a check that
 *  failed, and a failed check must not read as "nothing blocks". */
export function isMissingRelation(error: { code?: string | null } | null | undefined): boolean {
  const code = error?.code ?? ''
  return code === '42P01' || code === '42703' || code === 'PGRST204' || code === 'PGRST205'
}

/** The counts summed per label, in first-seen order, zeros dropped. */
export function blockingCounts(counts: ReferenceCount[]): ReferenceCount[] {
  const byLabel = new Map<string, number>()
  for (const c of counts) byLabel.set(c.label, (byLabel.get(c.label) ?? 0) + c.count)
  return [...byLabel].filter(([, n]) => n > 0).map(([label, count]) => ({ label, count }))
}

/** Human sentence naming every non-zero reference, or null when nothing blocks. */
export function describeBlockers(counts: ReferenceCount[]): string | null {
  const blocking = blockingCounts(counts)
  if (blocking.length === 0) return null
  const parts = blocking.map((c) => `${c.count} ${c.label}`)
  return `Supplier is referenced by ${parts.join(', ')} — deactivate it instead`
}
