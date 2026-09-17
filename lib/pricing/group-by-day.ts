// ============================================
// Price lines grouped into the days they belong to
// ============================================
// Every price view — the calculator's Cost Breakdown, a saved quote, a tour's
// price breakdown — lists its lines day by day, in the order each day runs
// (lib/pricing/breakdown-order). One grouping so the three read the same way
// (operator, 2026-09-17: "nothing like a line between each day").

import { sortByItineraryFlow } from './breakdown-order'

export interface DayGroup<T> {
  /** The day number; -1 for whole-trip lines with no day. */
  day: number
  lines: T[]
}

export function groupLinesByDay<T>(
  lines: readonly T[],
  toLine: (line: T) => { id?: string | null; category?: string | null; dayNumber?: number | null }
): DayGroup<T>[] {
  const ordered = sortByItineraryFlow(lines, l => {
    const x = toLine(l)
    return { id: x.id ?? '', category: x.category ?? '', dayNumber: x.dayNumber ?? null }
  })
  const groups = new Map<number, T[]>()
  for (const line of ordered) {
    const d = toLine(line).dayNumber
    const key = typeof d === 'number' && d > 0 ? d : -1
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(line)
  }
  return [...groups.entries()].map(([day, grouped]) => ({ day, lines: grouped }))
}
