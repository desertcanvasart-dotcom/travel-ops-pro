// ============================================
// Bidirectional mapping: Grid Slots ↔ Itinerary Services
// ============================================

import type { SlotValue } from '../types'
import { SLOT_DEFINITIONS } from '../types'
import { normalizeServiceType } from '@/lib/service-types'
import { storedUnitPrice, type StoredServiceRow } from './saved-price'

// --- Slot → Service Type ---

export const SLOT_TO_SERVICE_TYPE: Record<string, string> = {
  route: 'transportation',
  guide: 'guide',
  // Slot ids keep their plural names; the SERVICE TYPE they emit is the
  // canonical singular (lib/service-types.ts, AUT-L02).
  airport_services: 'airport_service',
  hotel_services: 'hotel_service',
  tipping: 'tips',
  boat_rides: 'activity',
  accommodation: 'accommodation',
  entrance_fees: 'entrance',
  flights: 'flight',
  experiences: 'activity',
  meals: 'meal',
  water: 'supplies',
  cruise: 'cruise',
  other_group: 'extra',
  other_pp: 'extra',
}

// --- Service Type → Slot (reverse map with disambiguation) ---

export function serviceTypeToSlotId(serviceType: string, serviceName: string, quantity: number, pax: number): string {
  // Rows written before the taxonomy was unified may carry the plural
  // spelling — normalize before matching (lib/service-types.ts).
  switch (normalizeServiceType(serviceType)) {
    case 'transportation': return 'route'
    case 'guide': return 'guide'
    case 'airport_service': return 'airport_services'
    case 'hotel_service': return 'hotel_services'
    case 'tips': return 'tipping'
    case 'accommodation': return 'accommodation'
    case 'entrance': return 'entrance_fees'
    case 'flight': return 'flights'
    case 'meal': return 'meals'
    case 'supplies': return 'water'
    case 'cruise': return 'cruise'
    case 'activity':
      // Disambiguate: boat rides vs experiences
      if (/boat|felucca|motor|sailing|kayak/i.test(serviceName)) return 'boat_rides'
      return 'experiences'
    case 'extra':
      // Disambiguate: group vs per-person based on quantity
      return quantity === pax ? 'other_pp' : 'other_group'
    default:
      return 'other_group'
  }
}

// --- Grid Slots → Service Rows ---
// One writer: the save route (app/api/pricing-grid/save) — the sold items, at
// each day's rate, the throughout guide's rows, priced from the stored rates.
// A second copy of those rules lived here (mapSlotsToServices), used by tests
// only and already out of step with the save (no guide switch, no dated
// rates); it was removed so nobody builds on it.

// --- Service Rows → Grid Slots ---

export function mapServicesToSlots(
  services: Array<{
    id: string
    service_type: string
    service_name: string
    quantity: number
    rate_eur: number
    rate_non_eur: number
    total_cost: number
    notes?: string | null
    description?: string | null
    supplier_currency?: string | null
    exchange_rate_used?: number | string | null
  }>,
  pax: number,
  /** The trip's currency and the grid's rate currency (with today's rates):
   *  given, each line carries its stored price in the rate currency, kept
   *  when it has no current rate (saved-price.ts). */
  savedPrices?: Parameters<typeof storedUnitPrice>[1]
): SlotValue[] {
  // Start with empty slots for all definitions
  const slotMap = new Map<string, SlotValue>()
  for (const def of SLOT_DEFINITIONS) {
    slotMap.set(def.slotId, {
      slotId: def.slotId,
      selectedItems: [],
      customAmount: 0,
    })
  }

  for (const svc of services) {
    // Try to extract original slotId from grid metadata
    // Check description first (new format: __grid:slot:xxx|rate_id:yyy)
    // Then notes (legacy format: slot:xxx|rate_id:yyy)
    let slotId: string | null = null
    const metaSource = svc.description || svc.notes || ''
    const slotMatch = metaSource.match(/slot:(\w+)/)
    if (slotMatch) slotId = slotMatch[1]

    // Fall back to service_type reverse mapping
    if (!slotId) {
      slotId = serviceTypeToSlotId(svc.service_type, svc.service_name, svc.quantity, pax)
    }

    const slot = slotMap.get(slotId)
    if (!slot) continue

    // Check if this was a custom amount
    if (metaSource.includes('custom_amount')) {
      slot.customAmount = svc.rate_eur
      continue
    }

    // Extract original rate_id from metadata if available
    let rateId = svc.id // fallback to service row ID
    const rateMatch = metaSource.match(/rate_id:(.+?)(\||$)/)
    if (rateMatch) rateId = rateMatch[1]

    // The page re-prices every pick from the rate it names (hydrate-items.ts)
    // — periods, guide bed, supplement key, the vehicle for the group. A line
    // with no current rate keeps the price stored on its row, in the rate
    // currency, marked as such; one that cannot be put in the rate currency
    // has no price.
    const stored = savedPrices ? storedUnitPrice(svc as StoredServiceRow, savedPrices) : null
    slot.selectedItems.push({
      rateId,
      name: svc.service_name,
      rateEur: stored ? stored.rateEur : savedPrices ? 0 : svc.rate_eur,
      rateNonEur: stored ? stored.rateNonEur : savedPrices ? 0 : svc.rate_non_eur,
      serviceId: svc.id,
      ...(stored ? { savedPrice: true } : {}),
    })
  }

  return SLOT_DEFINITIONS.map(def => slotMap.get(def.slotId)!)
}
