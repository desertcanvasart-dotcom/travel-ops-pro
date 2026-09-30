// ============================================
// A loaded or parsed grid item takes its rate's pricing basis
// ============================================
// How a rate applies to the group — per group, per person or per unit
// (lib/pricing/pricing-basis.ts) — belongs to the rate, not to the saved line.
// A reloaded itinerary or an AI-parsed day brings items with a rate id and a
// price but no basis; without it the calculator would fall back to the row's
// rule and a per-person airport assist would count once. This attaches the
// basis from the grid's rate list, by rate id. Prices are never touched.

import type { AllRates, GridDay, RateOption } from '../types'
import { BASIS_SLOTS } from './item-basis'

export function attachPricingBasis(days: GridDay[], rates: Partial<AllRates>): { days: GridDay[]; changed: number } {
  let changed = 0
  const next = days.map(day => {
    let dayChanged = false
    const slots = day.slots.map(slot => {
      if (!BASIS_SLOTS.has(slot.slotId) || slot.selectedItems.length === 0) return slot
      const options: RateOption[] = (rates as Record<string, RateOption[] | undefined>)[slot.slotId] ?? []
      if (options.length === 0) return slot
      const byId = new Map(options.map(o => [o.id, o]))
      let slotChanged = false
      const items = slot.selectedItems.map(item => {
        const opt = byId.get(item.rateId)
        if (!opt?.pricing_basis || item.pricingBasis) return item
        slotChanged = true
        changed++
        return { ...item, pricingBasis: opt.pricing_basis, unitCapacity: opt.unit_capacity ?? null }
      })
      if (!slotChanged) return slot
      dayChanged = true
      return { ...slot, selectedItems: items }
    })
    return dayChanged ? { ...day, slots } : day
  })
  return { days: changed > 0 ? next : days, changed }
}
