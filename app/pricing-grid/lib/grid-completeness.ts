// Grid completeness gate (consolidation Phase B).
//
// The bespoke grid never fabricates (it's a pure sum of selected rates), but it
// can silently UNDER-price by leaving required slots empty. This computes the
// structural gaps that are knowable from the grid's slot model so the UI can
// show "needs attention" and the save response can flag them.
//
// SCOPE NOTE: this grid has a fixed 16-slot model with no per-day "day type" /
// component metadata, so we flag high-confidence structural gaps only. A richer
// per-day required-component check (type-aware transport, class-aware entrances)
// like the sibling app's "B-full" would require adding that day model + data
// tagging first — deferred. See PRICING-CONSOLIDATION-PLAN.md.

import type { GridDay, GridConfig } from '../types'

export interface GridCompleteness {
  /** No blocking issues — safe to treat as a deliverable basis. */
  ok: boolean
  /** Issues that make the grid non-deliverable. */
  blocking: string[]
  /** Soft issues worth a human glance, but not blocking. */
  warnings: string[]
}

function slotIsPriced(slot: { selectedItems?: any[]; customAmount?: number }): boolean {
  return (slot.selectedItems?.length ?? 0) > 0 || (slot.customAmount ?? 0) > 0
}

export function gridCompleteness(
  days: GridDay[] | any[],
  config: Partial<GridConfig> | any
): GridCompleteness {
  const blocking: string[] = []
  const warnings: string[] = []

  const dayList = Array.isArray(days) ? days : []

  // Nothing priced anywhere → there is no quote yet.
  const anyService = dayList.some((d) => (d.slots || []).some(slotIsPriced))
  if (!anyService) {
    blocking.push('No services are priced yet — nothing to quote.')
  }

  // A day with no priced service at all is most likely unfinished.
  for (const d of dayList) {
    const priced = (d.slots || []).some(slotIsPriced)
    if (!priced) {
      warnings.push(`Day ${d.dayNumber} (${d.title || 'untitled'}) has no priced services.`)
    }
  }

  // Guide explicitly enabled but never actually selected → a real gap.
  if (config?.withGuide) {
    const anyGuide = dayList.some((d) =>
      (d.slots || []).some(
        (s: any) => s.slotId === 'guide' && (s.selectedItems?.length ?? 0) > 0
      )
    )
    if (!anyGuide) {
      blocking.push('Guide is enabled but no guide rate is selected on any day.')
    }
  }

  return { ok: blocking.length === 0, blocking, warnings }
}
