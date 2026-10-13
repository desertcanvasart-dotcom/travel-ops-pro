// ============================================
// Transport package rules the screen and the API share
// ============================================
// Tours › Transport Packages (app/b2b/pricing-rules). Pricing picks ONE
// package per sailing by type, length and route (lib/pricing/cruise-package),
// so the rows must not contradict each other (Tours audit, 2026-10, #8):
//
//   - Duration is a whole number of days, 1 or more. The API took 0 or a
//     negative number ("|| 1" turned only 0 into 1).
//   - Two ACTIVE packages of the same type, length and route are refused:
//     with both on file, which one priced a cruise was the database's choice.
//   - Removing (deleting, deactivating, or moving to another type or length)
//     the last active Cruise Sightseeing package of a length leaves every
//     sailing of that length at No rate: the screen warns before it happens.
//
// Client-safe: no database.

import { CRUISE_SIGHTSEEING } from '@/lib/pricing/cruise-package'

export interface PackageSlot {
  id?: string | null
  package_type?: string | null
  duration_days?: number | null
  origin_city?: string | null
  destination_city?: string | null
  is_active?: boolean | null
}

/** A duration the API accepts: a whole number ≥ 1, else null. */
export function validDuration(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n : null
}

const key = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/** Same type, same length, same route (cities compared without case). */
export function sameSlot(a: PackageSlot, b: PackageSlot): boolean {
  return key(a.package_type) === key(b.package_type)
    && (a.duration_days ?? null) === (b.duration_days ?? null)
    && key(a.origin_city) === key(b.origin_city)
    && key(a.destination_city) === key(b.destination_city)
}

/** Another active package that `candidate` would duplicate, if it is active. */
export function duplicateOf<P extends PackageSlot>(candidate: PackageSlot, others: readonly P[]): P | null {
  if (candidate.is_active === false) return null
  return others.find(o => o.is_active !== false && o.id !== candidate.id && sameSlot(candidate, o)) ?? null
}

/** The message a refused duplicate answers with. */
export function duplicateMessage(dup: { package_name?: string | null }): string {
  return `An active package with the same type, duration and route already exists ("${dup.package_name ?? ''}"). Edit that one, or make one of them inactive.`
}

/** When `before` is the only active Cruise Sightseeing package of its length
 *  and `after` (null = deleted) no longer is one, the length it leaves
 *  without a package; else null. */
export function lengthLeftWithout(before: PackageSlot, after: PackageSlot | null, all: readonly PackageSlot[]): number | null {
  const counts = (p: PackageSlot | null) =>
    !!p && p.is_active !== false && key(p.package_type) === CRUISE_SIGHTSEEING && p.duration_days != null
  if (!counts(before)) return null
  if (after && counts(after) && after.duration_days === before.duration_days) return null
  const others = all.filter(o => o.id !== before.id && counts(o) && o.duration_days === before.duration_days)
  return others.length === 0 ? before.duration_days! : null
}
