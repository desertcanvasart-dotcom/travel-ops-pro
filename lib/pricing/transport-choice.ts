// ============================================
// Several transport rates for one question
// ============================================
// Two or more rates can answer the same transport question: the same service
// type, city, duration and area, or the same road route and shape. Until now
// the engine took the first in a fixed order (starred, then the newest
// contract), so an older, cheaper card of the same company was never used and
// nobody was told the others existed.
//
// The owner's rule (2026-11-18, "cheapest plus warning", as autoura-saas
// #827):
//   1. One rate: it.
//   2. Exactly one starred (Preferred): the starred one, no warning.
//   3. Otherwise, among the starred ones (several starred) or all of them
//      (none starred):
//        - rates from SEVERAL companies: a gap. Which company to book is the
//          office's choice; the price never makes it (autoura-saas #799).
//        - one company: the cheapest for the group size, with a warning
//          naming the others, so the usual one can be starred.
//
// Only rates answering the SAME question compete: the engine's fallbacks
// (a row of another area, any duration) are not widened by this. And one
// company's rows under one route name are ONE rate in several contract
// periods (this year's, next year's): the first in the engine's order (the
// newest contract valid on the day) stands for it, as before. Only different
// rates compete.
//
// Pure.

import { getTransportRateForPax } from '@/lib/transport-rate-utils'

export interface ChoiceRow {
  id?: string | null
  service_code?: string | null
  service_type?: string | null
  city?: string | null
  origin_city?: string | null
  destination_city?: string | null
  duration?: string | null
  area?: string | null
  route_name?: string | null
  supplier_id?: string | null
  supplier_name?: string | null
  is_preferred?: boolean | null
}

export interface TransportChoice<T> {
  /** The rate to price; null when the choice is between several companies. */
  rate: T | null
  /** Set when one company's several rates answer and the cheapest was taken. */
  cheapestOf?: { chosen: string; others: string[]; amongStarred: boolean }
  /** Set when rates from several companies answer and none (or several) is starred. */
  companies?: string[]
  /** With `companies`: several of them are starred (else none is). */
  companiesStarred?: boolean
}

const low = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** The name a rate is known by in the warning: its route name, else its code. */
export const rateName = (r: ChoiceRow) => String(r.route_name ?? '').trim() || String(r.service_code ?? '').trim() || String(r.id ?? '')

const companyKey = (r: ChoiceRow) => low(r.supplier_id) || `name:${low(r.supplier_name)}`
const companyName = (r: ChoiceRow) => String(r.supplier_name ?? '').trim() || 'no supplier (direct booking)'

/**
 * Choose among `group`: every rate answering one question, valid on the day,
 * in the engine's order (orderTransportRows: starred first, then newest).
 */
export function chooseTransportRate<T extends ChoiceRow>(group: readonly T[], pax: number): TransportChoice<T> {
  // One row per rate: its contract periods are not rivals.
  const rates = new Map<string, T>()
  for (const r of group) {
    const key = `${companyKey(r)}\u0000${low(r.route_name)}`
    if (!rates.has(key)) rates.set(key, r)
  }
  const distinct = [...rates.values()]
  if (distinct.length === 0) return { rate: null }
  if (distinct.length === 1) return { rate: distinct[0] }

  const starred = distinct.filter(r => r.is_preferred === true)
  if (starred.length === 1) return { rate: starred[0] }
  const pool = starred.length > 0 ? starred : distinct

  const companies = new Map<string, string>()
  for (const r of pool) companies.set(companyKey(r), companyName(r))
  if (companies.size > 1) return { rate: null, companies: [...companies.values()], companiesStarred: starred.length > 0 }

  // The price for this group size; a rate with no price for it goes last.
  const price = (r: T) => {
    const n = Number(getTransportRateForPax(r, pax)?.rateEur)
    return Number.isFinite(n) && n > 0 ? n : Infinity
  }
  // Stable: equal prices keep the engine's order.
  const chosen = pool
    .map((r, i) => ({ r, i, p: price(r) }))
    .sort((a, b) => a.p - b.p || a.i - b.i)[0].r
  const names = [...new Set(pool.map(rateName))]
  const others = names.filter(n => n !== rateName(chosen))
  return { rate: chosen, cheapestOf: { chosen: rateName(chosen), others, amongStarred: starred.length > 0 } }
}

/** The quote's warning for a cheapest-of-several pick. */
export function cheapestOfWarning(day: number, what: string, c: NonNullable<TransportChoice<unknown>['cheapestOf']>): string {
  const all = [c.chosen, ...c.others]
  return `Day ${day}: ${all.length} rates answer ${what} (${all.join(', ')}). Priced the cheapest, "${c.chosen}". ` +
    `${c.amongStarred ? 'Several are starred: keep the star on one' : 'Star the usual one'} in Rates → Transportation.`
}

/** The gap's message when several companies answer and none is chosen. */
export function severalCompaniesMessage(what: string, companies: readonly string[], starred = false): string {
  return `${companies.length} companies have a rate for ${what} (${companies.join(', ')}) and ${starred ? 'more than one is starred' : 'none is starred'}. ` +
    'Star the one to book in Rates → Transportation.'
}
