// ============================================
// Rates › Fixed Costs, charged by the grid on every sightseeing day
// ============================================
// The automatic engine and both AI builders charge EVERY active fixed cost as
// its own named line, per person for each sightseeing day (lib/fixed-costs.ts).
// The grid used to offer one hardcoded "Water" pick instead, priced by the
// days the agent happened to pick it on. Now the grid charges the same costs
// itself, with no per-day choice, so a grid price matches automatic pricing.
//
// ONE rule for the screen (calculator.ts) and the save (it writes these as
// itinerary lines), like guide-rule.ts: the amounts come from the server's
// getFixedDailyCosts, never from the browser's request.
//
// SIGHTSEEING DAY. The engine's rule is `guide_required || attractions.length > 0`
// (lib/auto-pricing-service.ts). Here that is read off the day's picks, as the
// grid's own guide / attraction logic sees them:
//   - a SOLD guide (a guide pick or typed guide amount, with the guide switched
//     on — guide-rule.ts), or
//   - an attraction: anything in Entrance Fees, Experiences or Boat Rides (a
//     pick or a typed amount).
// A day with neither (arrival, transfer, free, departure with nothing booked)
// is not charged. The day-type preset does not decide it: only what is picked.
//
// Pure: the page, the save route and the tests share it.

import type { GridDay, GridFixedCost, SlotValue } from '../types'
import { soldItems, customAmountSold } from './guide-rule'

/** The slots whose picks are the day's attractions. */
const ATTRACTION_SLOTS = ['entrance_fees', 'experiences', 'boat_rides'] as const

const hasPicks = (slot: SlotValue | undefined): boolean =>
  !!slot && ((slot.selectedItems?.length ?? 0) > 0 || (slot.customAmount ?? 0) > 0)

/** Whether the day is a sightseeing day (the rule above). */
export function isSightseeingDay(day: Pick<GridDay, 'slots'>, withGuide: boolean): boolean {
  const slots = day.slots ?? []
  const guide = slots.find(s => s.slotId === 'guide')
  if (guide) {
    const typed = (guide.customAmount ?? 0) > 0 && customAmountSold('guide', withGuide)
    if (typed || soldItems(guide, withGuide).length > 0) return true
  }
  return ATTRACTION_SLOTS.some(id => hasPicks(slots.find(s => s.slotId === id)))
}

/** The fixed costs one day is charged: every cost, per person — none on a day that is not a sightseeing day. */
export function fixedCostsForDay(
  day: Pick<GridDay, 'slots'>,
  config: { withGuide: boolean; fixedCosts?: readonly GridFixedCost[] | null },
): GridFixedCost[] {
  const costs = (config.fixedCosts ?? []).filter(c => Number.isFinite(c.perPersonPerDay) && c.perPersonPerDay > 0)
  if (costs.length === 0 || !isSightseeingDay(day, config.withGuide)) return []
  return costs.map(c => ({ name: c.name, perPersonPerDay: c.perPersonPerDay }))
}

/** What one person pays for the day's fixed costs, together. */
export function fixedCostPerPerson(
  day: Pick<GridDay, 'slots'>,
  config: { withGuide: boolean; fixedCosts?: readonly GridFixedCost[] | null },
): number {
  return fixedCostsForDay(day, config).reduce((sum, c) => sum + c.perPersonPerDay, 0)
}

/** How many days of the trip are sightseeing days. */
export function sightseeingDayCount(days: ReadonlyArray<Pick<GridDay, 'slots'>>, withGuide: boolean): number {
  return days.filter(d => isSightseeingDay(d, withGuide)).length
}

/**
 * The picks of a trip saved or drafted BEFORE the grid charged fixed costs
 * itself: the old single-select Water slot (the hardcoded "Water Bottles"
 * option). Dropped, so a reloaded trip is not charged water twice — the
 * automatic lines replace it. Returns the same array when there is nothing to
 * drop (a React state update can skip it).
 */
export function dropLegacyFixedCostPicks<D extends { slots?: SlotValue[] }>(days: D[]): D[] {
  if (!days.some(d => (d.slots ?? []).some(s => s.slotId === 'water'))) return days
  return days.map(d => (d.slots ?? []).some(s => s.slotId === 'water')
    ? { ...d, slots: (d.slots ?? []).filter(s => s.slotId !== 'water') }
    : d)
}
