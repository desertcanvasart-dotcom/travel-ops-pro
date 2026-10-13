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
// duration, area, supplier, route name, trip shape and validity window
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
    text(r.duration), text(r.area),
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
