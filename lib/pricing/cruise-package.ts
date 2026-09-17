// ============================================
// Cruise sightseeing transport: which package a sailing needs
// ============================================
// A package in Rates → Transport Packages is sold by the cruise's length in
// DAYS: "4D" is a 3-night cruise, "5D" a 4-night one. Pricing counted the
// NIGHTS aboard (the days marked as cruise days) and sold a 4-night cruise the
// 4D package, then fell back to the closest length when the exact one was
// missing — the wrong package, at the wrong price (operator, 2026-09-17).
//
//   - a sailing is a run of consecutive cruise nights; its length in days is
//     nights + 1 (the disembarkation day, whose transfer off the ship the
//     package covers)
//   - a package is matched by that exact length; none → No rate, never a
//     neighbour
//
// Client-safe: no database, no engine import.

type DayLike = { day: number; is_cruise_day?: boolean }

export interface Sailing {
  /** Nights aboard. */
  nights: number
  /** The package length this sailing needs: nights + 1. */
  durationDays: number
  /** The day numbers spent aboard (one per night). */
  nightDays: number[]
  /** The day the party leaves the ship, when the programme has one. */
  disembarkDay: number | null
}

/** Every sailing in the programme, in order. */
export function cruiseSailings(days: readonly DayLike[]): Sailing[] {
  const sailings: Sailing[] = []
  let run: number[] = []
  const close = (nextIndex: number) => {
    if (run.length === 0) return
    const after = days[nextIndex]
    sailings.push({
      nights: run.length,
      durationDays: run.length + 1,
      nightDays: run,
      disembarkDay: after ? after.day : null,
    })
    run = []
  }
  days.forEach((d, i) => {
    if (d.is_cruise_day === true) run.push(d.day)
    else close(i)
  })
  close(days.length)
  return sailings
}

/** The package for a sailing of `durationDays`: the exact length only. */
export function packageForDuration<P extends { duration_days?: number | null }>(packages: readonly P[], durationDays: number): P | null {
  return packages.find(p => p.duration_days === durationDays) ?? null
}
