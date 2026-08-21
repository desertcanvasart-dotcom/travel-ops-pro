// ============================================
// What a supplier can be — one list
// ============================================
// This vocabulary is enforced by a CHECK on suppliers.type, and it had drifted
// into four different hardcoded copies: the suppliers screen, the booking
// page's Add Supplier modal (nine values, missing every type added since),
// expenses, and supplier invoices. A dropdown that offers fewer types than the
// database allows is a dropdown that cannot record what the operator actually
// bought.
//
// Keep this in step with the CHECK in migrations/20260820_supplier_types_transport_assist.sql.

export interface SupplierTypeOption {
  value: string
  label: string
  /** Grouped in pickers so a long list stays readable. */
  group: 'Ground' | 'Stay & Food' | 'Experiences' | 'Travel' | 'People' | 'Other'
}

export const SUPPLIER_TYPES: SupplierTypeOption[] = [
  { value: 'hotel',             label: 'Hotel',              group: 'Stay & Food' },
  { value: 'restaurant',        label: 'Restaurant',         group: 'Stay & Food' },
  { value: 'cruise',            label: 'Cruise',             group: 'Stay & Food' },

  { value: 'transport',         label: 'Transport',          group: 'Ground' },
  { value: 'driver',            label: 'Driver',             group: 'Ground' },
  { value: 'local_operator',    label: 'Local Operator',     group: 'Ground' },
  { value: 'ground_handler',    label: 'Ground Handler',     group: 'Ground' },

  { value: 'train_operator',    label: 'Train Operator',     group: 'Travel' },
  { value: 'air_carrier',       label: 'Air Carrier',        group: 'Travel' },

  { value: 'guide',             label: 'Guide',              group: 'People' },
  { value: 'airport_assistant', label: 'Airport Assistant',  group: 'People' },
  { value: 'hotel_assistant',   label: 'Hotel Assistant',    group: 'People' },

  { value: 'activity_provider', label: 'Activity Provider',  group: 'Experiences' },
  { value: 'attraction',        label: 'Attraction / Ticket', group: 'Experiences' },
  { value: 'tour_operator',     label: 'Tour Operator',      group: 'Experiences' },
  { value: 'shop',              label: 'Shop',               group: 'Experiences' },

  { value: 'other',             label: 'Other',              group: 'Other' },
]

export const SUPPLIER_TYPE_VALUES = SUPPLIER_TYPES.map(t => t.value)

const BY_VALUE = new Map(SUPPLIER_TYPES.map(t => [t.value, t]))

/** The label for a stored value, including legacy ones no longer offered. */
export function supplierTypeLabel(value: string | null | undefined): string {
  if (!value) return 'Other'
  const known = BY_VALUE.get(value)
  if (known) return known.label
  // Rows written before this list existed: 'flight' and 'entrance' were the
  // booking page's own words for air_carrier and attraction.
  const legacy: Record<string, string> = { flight: 'Air Carrier', entrance: 'Attraction / Ticket', activity: 'Activity Provider' }
  return legacy[value] || value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Option groups in display order, for a grouped <select>. */
export const SUPPLIER_TYPE_GROUPS: { group: string; options: SupplierTypeOption[] }[] =
  (['Stay & Food', 'Ground', 'Travel', 'People', 'Experiences', 'Other'] as const).map(group => ({
    group,
    options: SUPPLIER_TYPES.filter(t => t.group === group),
  }))
