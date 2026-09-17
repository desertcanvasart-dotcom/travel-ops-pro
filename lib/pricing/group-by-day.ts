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

/** Lines that cover more than one day, though the engine files them on the
 *  first day they touch: the cruise transport package (every cruise day), a
 *  cruise supplement or the throughout guide's cabin (the whole sailing), the
 *  rooming adjustment (the whole stay). In a day's band they inflated that
 *  day's total (Greptile on #460) — they belong under Whole trip. */
export function isTripWideLine(id: string | null | undefined): boolean {
  const v = String(id ?? '')
  return v === 'cruise-transport-package' || v === 'rooming-adjustment' || /-cruise-supp-/.test(v) || /-guide-cabin$/.test(v)
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
    const x = toLine(line)
    const d = x.dayNumber
    const key = typeof d === 'number' && d > 0 && !isTripWideLine(x.id) ? d : -1
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(line)
  }
  // Whole trip last, after every day.
  return [...groups.entries()]
    .sort(([a], [b]) => (a === -1 ? 1 : 0) - (b === -1 ? 1 : 0))
    .map(([day, grouped]) => ({ day, lines: grouped }))
}
