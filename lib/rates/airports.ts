// ============================================
// AIRPORTS — the agency's own list, not a hardcoded country's
// ============================================
// A flight rate is priced between AIRPORTS, not cities. Tokyo Narita and Tokyo
// Haneda are two fares; so are Osaka Kansai and Itami. Everything else in the
// system works in cities — hotels, transport, guides, the days of a trip — and
// should keep doing so, because that is the level those things happen at.
//
// This is the seam between the two. An airport belongs to a city; a leg between
// cities is served by whichever airports those cities have.
//
// WHY A VOCABULARY. The old list was nine Egyptian cities hardcoded in
// lib/pricing/flight-leg, and it answered 'CAI' for everything it did not
// recognise — so an agency in another country got Cairo for all of them, and
// the customers' own origin (Tokyo, for the Japanese desk) could not be
// expressed at all. An install-local list the agency curates is the same answer
// this codebase reached for airlines, tiers, vehicle types and the rest.
//
// AND IT IS DELIBERATELY NOT `destinations`. A destination is somewhere the
// agency SELLS — it carries a generation brief and a glossary, and its cities
// fill every rate form. The airport your customers fly FROM is not that: nobody
// runs a tour in it, and Tokyo has no business appearing in the hotel city
// list. Origin airports live here precisely because they are not destinations.

import type { VocabularyItem } from '@/lib/vocabulary'

/** One airport, flattened out of its vocabulary item. */
export interface Airport {
  /** The vocabulary key — what a flight rate stores. Stable across installs. */
  key: string
  /** The agency's own words: "Tokyo Narita", "Cairo". */
  label: string
  /** IATA, upper-case. May be empty: the code is for display and documents,
   *  never for matching — the key is what matches. */
  code: string
  /** The city this airport serves, as the rest of the system spells it. */
  city: string
  /** ISO country code, for grouping a long list. */
  countryCode: string
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** The airports out of a vocabulary read. Items with no city are kept: the
 *  city is what joins them to a leg, and an airport missing one is a gap the
 *  operator should see on the rate, not a row we silently drop. */
export function airportsFrom(items: Array<Pick<VocabularyItem, 'key' | 'label' | 'meta' | 'is_active'>>): Airport[] {
  return items
    .filter(i => i.is_active !== false)
    .map(i => ({
      key: i.key,
      label: i.label,
      code: str(i.meta?.iata).toUpperCase(),
      city: str(i.meta?.city),
      countryCode: str(i.meta?.country_code).toUpperCase(),
    }))
}

/** Cities compare the way the pricing engine compares them. */
export const cityKey = (city: unknown): string => String(city ?? '').trim().toLowerCase()

/**
 * The airports serving a city.
 *
 * Empty is a real answer, and an honest one: a city with no airport in the list
 * cannot be flown to, and the caller should say so rather than reach for a
 * default. The old code's default was Cairo.
 */
export function airportsForCity(airports: Airport[], city: string | null | undefined): Airport[] {
  const wanted = cityKey(city)
  if (!wanted) return []
  return airports.filter(a => cityKey(a.city) === wanted)
}

/** An airport by its key. */
export function airportByKey(airports: Airport[], key: string | null | undefined): Airport | null {
  const wanted = str(key)
  if (!wanted) return null
  return airports.find(a => a.key === wanted) ?? null
}

/**
 * The IATA code to print for a city.
 *
 * Null when the city has no airport, or has SEVERAL and so has no single code —
 * Tokyo is NRT or HND, and answering one of them would be a guess. A caller
 * that needs certainty resolves the airport, not the city.
 */
export function cityAirportCode(airports: Airport[], city: string | null | undefined): string | null {
  const serving = airportsForCity(airports, city)
  if (serving.length !== 1) return null
  return serving[0].code || null
}

/** How an airport reads in a picker: "Tokyo Narita (NRT)". */
export function airportLabel(airport: Airport): string {
  return airport.code ? `${airport.label} (${airport.code})` : airport.label
}

/**
 * Airports grouped by country, for a picker that has grown past one country.
 *
 * The agency that sells one destination sees a flat list, exactly as it always
 * did. The one whose customers fly in from abroad sees their origin under its
 * own heading rather than mixed into the cities it runs tours in — the same
 * rule CityOptions applies to destinations.
 */
export function groupByCountry(airports: Airport[]): Array<{ countryCode: string; airports: Airport[] }> {
  const groups = new Map<string, Airport[]>()
  for (const a of airports) {
    const key = a.countryCode || ''
    const list = groups.get(key)
    if (list) list.push(a)
    else groups.set(key, [a])
  }
  return [...groups.entries()]
    .map(([countryCode, list]) => ({ countryCode, airports: list }))
    .sort((a, b) => a.countryCode.localeCompare(b.countryCode))
}
