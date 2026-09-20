import type { VocabularyKind } from '@/lib/vocabulary'
// ============================================
// Supplier properties — shared vocabulary
// ============================================
// The assets a supplier operates (supplier-HAS-properties, 2026-08-31).
// Phase 1 wires ships (cruises); hotel and train are declared so later phases
// change no vocabulary, only UI + rate linkage.

export const PROPERTY_TYPES = ['ship', 'hotel', 'train'] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export interface SupplierProperty {
  id: string
  supplier_id: string
  property_type: PropertyType
  name: string
  city: string | null
  category: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  /** Printed on Japanese customer documents (日程表 利用ホテル); null = the English name. */
  name_ja?: string | null
  address?: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Which property types a supplier's roles imply it can own. Pass the
 *  roles' BEHAVIOURS (lib/supplier-types supplierBehaviourOf) so an
 *  agency-added type that behaves as a hotel owns hotels; the built-in keys
 *  are their own behaviour, so raw roles still work for those. */
export function propertyTypesForRoles(types: string[] | null | undefined): PropertyType[] {
  const out = new Set<PropertyType>()
  for (const t of types ?? []) {
    if (t === 'cruise') out.add('ship')
    if (t === 'hotel') out.add('hotel')
    if (t === 'train_operator') out.add('train')
  }
  return [...out]
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  ship: 'Ship',
  hotel: 'Hotel',
  train: 'Train',
}

/**
 * Which vocabulary a property type's class comes from.
 *
 * It used to be a constant here. It was written to stop the field being free
 * text — the same hotel class had been spelled five ways across the fleet —
 * and it did not work, because a list nobody can edit is a list people write
 * around: the live data holds "4 Stars" and "5 Stars" beside the "5★ deluxe"
 * the list offered (operator, 2026-09-20: "why does this drop down have these
 * categories which do not exist in the vocabulary section?").
 *
 * TRAINS ALREADY HAD A KIND. `train_class` has held the agency's own words
 * since the word lists were unpicked, while this constant offered
 * standard/express/VIP/sleeper beside it. Two lists for one thing, disagreeing.
 *
 * NOT the pricing tier: a five-star hotel can be sold in any tier, and the tier
 * is what a rate row is filed under. Nothing prices from the class — it is how
 * the office recognises a property at a glance.
 */
export const PROPERTY_CLASS_KIND: Record<PropertyType, VocabularyKind> = {
  hotel: 'hotel_class',
  ship: 'ship_category',
  train: 'train_class',
}

/** The words each list held before the vocabulary did — the built-in an
 *  install falls back to until it has entries of its own. */
export const PROPERTY_CATEGORIES: Record<PropertyType, readonly string[]> = {
  hotel: ['3★ standard', '4★ superior', '4★ deluxe', '5★ deluxe', '5★ luxury'],
  ship: ['Budget', 'Standard', 'Deluxe', 'Luxury'],
  train: ['First Class', 'Second Class AC', 'Second Class'],
}
