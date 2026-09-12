// ============================================
// What a supplier can be — one list
// ============================================
// This list had drifted into four different hardcoded copies: the suppliers
// screen, the booking page's Add Supplier modal (nine values, missing every
// type added since), expenses, and supplier invoices. A dropdown that offers
// fewer types than the database allows is a dropdown that cannot record what
// the operator actually bought.
//
// Since 20261007 the list itself is the agency's — Settings → Vocabulary →
// Supplier types — and these seventeen are the BUILT-INS: the seed every
// install starts from, and what a picker offers until the vocabulary loads.
// An entry the agency adds ("Lodge") carries a BEHAVIOUR (one of
// lib/vocabulary SUPPLIER_BEHAVIORS — "behaves like a hotel"), and every
// consumer that used to compare the KEY ('hotel') resolves through the
// behaviour instead: the Properties tab, the "type=hotel" supplier filter
// the hotel-rate form asks, the guide picker. The helpers at the bottom are
// that resolution, pure, for the client hook (hooks/useSupplierTypes) and
// the routes alike. The database keeps only the SHAPE (a slug key).

import type { VocabularyItem } from '@/lib/vocabulary'

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

const GROUP_ORDER = ['Stay & Food', 'Ground', 'Travel', 'People', 'Experiences', 'Other'] as const

/** Option groups in display order, for a grouped <select>. */
export function supplierTypeGroupsFor(options: readonly SupplierTypeOption[]): { group: string; options: SupplierTypeOption[] }[] {
  return GROUP_ORDER.map(group => ({ group, options: options.filter(t => t.group === group) })).filter(g => g.options.length > 0)
}

export const SUPPLIER_TYPE_GROUPS = supplierTypeGroupsFor(SUPPLIER_TYPES)

// ============================================
// The agency's supplier types, resolved by behaviour
// ============================================

/** The behaviour each built-in type has — what the vocabulary seed gave it. */
export const BUILT_IN_SUPPLIER_BEHAVIOUR: Record<string, string> = {
  hotel: 'hotel', restaurant: 'restaurant', cruise: 'cruise',
  transport: 'transport_company', driver: 'driver', local_operator: 'tour_operator', ground_handler: 'ground_handler',
  train_operator: 'train_operator', air_carrier: 'airline',
  guide: 'guide', airport_assistant: 'ground_handler', hotel_assistant: 'ground_handler',
  activity_provider: 'activity_provider', attraction: 'attraction', tour_operator: 'tour_operator', shop: 'shop',
  other: 'other',
}

/** Where an agency-added type sits in a grouped picker, by what it behaves like. */
const GROUP_OF_BEHAVIOUR: Record<string, SupplierTypeOption['group']> = {
  hotel: 'Stay & Food', restaurant: 'Stay & Food', cruise: 'Stay & Food',
  transport_company: 'Ground', driver: 'Ground', ground_handler: 'Ground',
  train_operator: 'Travel', airline: 'Travel',
  guide: 'People',
  activity_provider: 'Experiences', attraction: 'Experiences', tour_operator: 'Experiences', shop: 'Experiences',
  other: 'Other',
}

/** A supplier-type vocabulary entry, as much of it as these helpers read. */
export type SupplierTypeEntry = Pick<VocabularyItem, 'key'> & {
  behavior?: string | null
  label?: string | null
  label_ja?: string | null
  is_active?: boolean
}

/** What a stored type key behaves like: the vocabulary entry's behaviour,
 *  else the built-in's, else 'other'. */
export function supplierBehaviourOf(key: string | null | undefined, items: readonly SupplierTypeEntry[]): string {
  if (!key) return 'other'
  const entry = items.find(i => i.key === key)
  return entry?.behavior || BUILT_IN_SUPPLIER_BEHAVIOUR[key] || 'other'
}

/** The type keys a "type=hotel" filter should match: each requested key
 *  itself, plus every AGENCY-ADDED entry that behaves like it — so a lodge
 *  turns up where hotels are asked for. A built-in never pulls in another
 *  built-in (asking for local operators must not return tour operators,
 *  though both behave as tour_operator). */
export function supplierTypeKeysMatching(requested: readonly string[], items: readonly SupplierTypeEntry[]): string[] {
  const out = new Set<string>()
  for (const key of requested) {
    if (!key) continue
    out.add(key)
    const behaviour = supplierBehaviourOf(key, items)
    for (const item of items) {
      if (item.key in BUILT_IN_SUPPLIER_BEHAVIOUR) continue
      if ((item.behavior || 'other') === behaviour) out.add(item.key)
    }
  }
  return [...out]
}

/** Whether a supplier fills a role that behaves like `behaviour`. */
export function supplierHasBehaviour(
  supplier: { type?: string | null; types?: readonly string[] | null },
  behaviour: string,
  items: readonly SupplierTypeEntry[],
): boolean {
  const roles = supplier.types?.length ? supplier.types : supplier.type ? [supplier.type] : []
  return roles.some(r => supplierBehaviourOf(r, items) === behaviour)
}

/** The keys a supplier may be filed under: the agency's entries (hidden
 *  ones too — an existing supplier keeps its role after Settings hides it)
 *  plus the built-ins. */
export function allowedSupplierTypeKeys(items: readonly SupplierTypeEntry[]): Set<string> {
  return new Set([...SUPPLIER_TYPE_VALUES, ...items.map(i => i.key)])
}

export function unknownSupplierTypes(types: readonly string[], allowed: ReadonlySet<string>): string[] {
  return types.filter(t => !allowed.has(t))
}

/** The 400 for a role the agency has not defined — the vocabulary screen is
 *  where a new kind of supplier is born, not the supplier form. */
export function unknownSupplierTypeError(unknown: readonly string[]): string {
  return `Unknown supplier type${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Add it in Settings → Vocabulary → Supplier types first.`
}

/** The choices a supplier-type picker offers: the agency's active entries
 *  in their order (label for the locale, grouped by what each behaves like),
 *  else the built-ins until the vocabulary loads. */
export function supplierTypeOptionsFor(items: readonly SupplierTypeEntry[], locale = 'en'): SupplierTypeOption[] {
  const active = items.filter(i => i.is_active !== false)
  if (active.length === 0) return SUPPLIER_TYPES
  return active.map(item => {
    const builtIn = BY_VALUE.get(item.key)
    const override = locale === 'ja' ? item.label_ja : item.label
    return {
      value: item.key,
      label: override?.trim() ? override : (builtIn?.label ?? supplierTypeLabel(item.key)),
      group: builtIn?.group ?? GROUP_OF_BEHAVIOUR[supplierBehaviourOf(item.key, items)] ?? 'Other',
    }
  })
}
