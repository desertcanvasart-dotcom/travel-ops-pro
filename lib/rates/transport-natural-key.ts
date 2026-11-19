// ============================================
// "The same transportation rate" — for the Transportation Rates form's create
// ============================================
// Rates → Transportation saves through /api/resources/transportation, whose
// create had no duplicate check at all: only the per-company unique
// service_code stood in the way, so a typed code or a second save of the same
// route inserted a second row, and the engine priced the route from whichever
// row it happened to read last (lib/auto-pricing-service orderTransportRows
// now makes that pick fixed, but a duplicate is still a duplicate).
//
// The identity is every column the form lets the operator set that tells one
// priced service from another: service type, city, departure and destination,
// duration, pickup area, supplier, route name, trip shape and validity window
// (rate_valid_from/to — next year's price is its own row, and pricing picks it
// on the days it covers). NOT the service code:
// it is unique per company already (a clash is answered separately), and a
// code typed differently over the same route, supplier and name is exactly
// the duplicate that slipped through. Two suppliers for one route are two
// rates (the engine picks between them in a fixed order); two NAMED routes
// in one city (Aswan's fifteen city tours) differ by their route name.
// Text compares case-insensitively; null and '' are one.
//
// Pure. The route fetches the company's rows of the service type and asks.

import { rateTripShape } from '@/lib/pricing/road-trips'

type Row = Record<string, unknown>

const text = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** The natural key of a transportation rate, without its trip shape. */
export function transportRateKey(r: Row): string {
  return [
    text(r.service_type),
    text(r.city), text(r.origin_city), text(r.destination_city),
    text(r.duration),
    // The pickup area (20270125): the same route is priced once per area.
    text(r.zone),
    text(r.supplier_id),
    text(r.route_name),
    text(r.rate_valid_from).slice(0, 10), text(r.rate_valid_to).slice(0, 10),
  ].join('|')
}

/** The first existing row that is the same rate as `candidate`, or null.
 *  `candidate.trip_shape` is the shape the write resolved (null off the road);
 *  a stored row with no shape reads it from its name, as pricing does. */
export function findSameTransportRate<T extends Row>(candidate: Row, existing: readonly T[]): T | null {
  const want = transportRateKey(candidate)
  const shape = candidate.trip_shape ? String(candidate.trip_shape) : null
  return existing.find(r =>
    transportRateKey(r) === want &&
    (shape ? rateTripShape(r as Parameters<typeof rateTripShape>[0]) === shape : true)
  ) ?? null
}

/** An existing row already using this service code (unique per company), or null. */
export function findServiceCodeClash<T extends Row>(code: unknown, existing: readonly T[], exceptId?: string | null): T | null {
  const want = text(code)
  if (!want) return null
  return existing.find(r => text(r.service_code) === want && String(r.id ?? '') !== String(exceptId ?? '')) ?? null
}

/**
 * The code a NEW rate saves under: `code` itself when it is free, else the
 * first free `code-2`, `code-3`, …
 *
 * The form fills the code from the route (CAIRO-TO-ALEXANDRIA-INTERCITY), so
 * a second transport company quoting the same route and cars was refused with
 * "Service code … is already used" — although it is a different rate (the
 * supplier is part of findSameTransportRate's key, which still refuses a real
 * duplicate first). The code is a label; operator 2026-11-07: several
 * suppliers share one route and car type at different prices.
 */
export function freeServiceCode(code: string, existing: readonly Row[]): string {
  const taken = new Set(existing.map(r => text(r.service_code)).filter(Boolean))
  if (!taken.has(text(code))) return code
  for (let n = 2; ; n++) {
    const next = `${code}-${n}`
    if (!taken.has(text(next))) return next
  }
}

/** "2026-11-01" from a date or timestamp; '' when none. */
const day = (v: unknown) => String(v ?? '').slice(0, 10)

/**
 * The message for a create or edit that would make a second copy of a rate:
 * it names the card that already exists (its code, route, supplier and
 * validity), so the operator can find it and edit it, instead of a bare
 * "a rate with these details already exists". Ported from autoura-saas #837.
 */
export function duplicateTransportRateMessage(existing: Row): string {
  const code = String(existing.service_code ?? '').trim()
  const from = String(existing.origin_city ?? '').trim(), to = String(existing.destination_city ?? '').trim()
  const route = String(existing.route_name ?? '').trim()
    || (from && to ? `${from} → ${to}` : String(existing.city ?? '').trim())
  const supplier = String(existing.supplier_name ?? '').trim() || 'no supplier (direct booking)'
  const validFrom = day(existing.rate_valid_from), validTo = day(existing.rate_valid_to)
  const validity = validFrom || validTo ? `, valid ${validFrom || '…'} to ${validTo || '…'}` : ''
  const card = [code, route].filter(Boolean).join(' · ')
  return `This rate already exists: ${card || 'an existing rate'}, from ${supplier}${validity}. ` +
    'Edit that rate instead (search for its code in the list), or change what makes this one different: ' +
    'the supplier, route name, city, duration, pickup area or validity dates.'
}

/**
 * An edit that turns a rate into a copy of ANOTHER one: the existing row it
 * would duplicate, or null. Only when the edit changes the rate's identity:
 * live data may already hold two copies, and refusing every edit to them
 * would block fixing a price.
 */
export function editMakesDuplicate<T extends Row>(current: Row, edited: Row, others: readonly T[]): T | null {
  const id = String(current.id ?? '')
  const unchanged = transportRateKey(current) === transportRateKey(edited) &&
    String(current.trip_shape ?? '') === String(edited.trip_shape ?? '')
  if (unchanged) return null
  return findSameTransportRate(edited, others.filter(r => String(r.id ?? '') !== id))
}
