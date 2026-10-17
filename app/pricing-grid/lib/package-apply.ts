// ============================================
// A package change applied to the days already on the grid
// ============================================
// The package only steered the parser: switching Full Package → Tours Only
// after a parse left every hotel and airport transfer in place, priced. This
// removes what the new package does not sell — hotels and hotel services,
// cruise nights, airport services and airport-transfer routes — and says
// what it removed. Nothing is added: a leaner product never invents services.

import type { PackageTypeConfig } from '@/lib/package-types'
import type { GridDay } from '../types'

export interface PackageApplyResult {
  days: GridDay[]
  removed: { hotels: number; airport: number; cruises: number }
}

/** `typeOf(rateId)`: a route item's service_type (from the grid's route options). */
export function applyPackageToDays(days: GridDay[], pkg: PackageTypeConfig, typeOf: (rateId: string) => string | undefined): PackageApplyResult {
  const removed = { hotels: 0, airport: 0, cruises: 0 }
  const next = days.map(day => {
    let changed = false
    const slots = day.slots.map(slot => {
      const n = slot.selectedItems.length
      if (n === 0) return slot
      if (!pkg.includes.accommodation && (slot.slotId === 'accommodation' || slot.slotId === 'hotel_services')) {
        if (slot.slotId === 'accommodation') removed.hotels++
        changed = true
        return { ...slot, selectedItems: [] }
      }
      if (!pkg.includes.accommodation && slot.slotId === 'cruise') {
        removed.cruises++
        changed = true
        return { ...slot, selectedItems: [] }
      }
      if (!pkg.includes.airportTransfers && slot.slotId === 'airport_services') {
        removed.airport += n
        changed = true
        return { ...slot, selectedItems: [] }
      }
      if (!pkg.includes.airportTransfers && slot.slotId === 'route') {
        const kept = slot.selectedItems.filter(item => (item.serviceType ?? typeOf(item.rateId)) !== 'airport_transfer')
        if (kept.length !== n) {
          removed.airport += n - kept.length
          changed = true
          return { ...slot, selectedItems: kept }
        }
      }
      return slot
    })
    return changed ? { ...day, slots } : day
  })
  return { days: next, removed }
}

/** "3 hotel nights and 2 airport services" — or '' when nothing went. */
export function describeRemoved(r: PackageApplyResult['removed']): string {
  const parts = [
    r.hotels ? `${r.hotels} hotel night${r.hotels === 1 ? '' : 's'}` : '',
    r.cruises ? `${r.cruises} cruise night${r.cruises === 1 ? '' : 's'}` : '',
    r.airport ? `${r.airport} airport service${r.airport === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
