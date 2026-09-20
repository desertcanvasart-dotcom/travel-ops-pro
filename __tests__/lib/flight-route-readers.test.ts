// Operator, 2026-09-20: "I got a warning that the route Aswan to Cairo flight
// rate is not recorded while it is recorded."
//
// It was recorded. flight_rates.route_from / route_to hold airport KEYS since
// migration 20261023 — the row says `asw` — and three readers still compared
// that key with a CITY NAME. `cityKey('asw') === cityKey('Aswan')` is
// 'asw' === 'aswan', so every flight leg answered "No rate for this route" on
// routes that had one.
//
// The engine learned the keys when they landed. The travel-leg picker, the
// grid's flight options and the grid's option labels did not. Same mistake
// three times, which is why the rule now lives in one place.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { airportsFrom, flightRouteMatches, flightRouteLabel, cityOfAirportKey } from '@/lib/rates/airports'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const airports = airportsFrom([
  { key: 'asw', label: 'Aswan', meta: { iata: 'ASW', city: 'Aswan', country_code: 'EG' }, is_active: true },
  { key: 'cai', label: 'Cairo', meta: { iata: 'CAI', city: 'Cairo', country_code: 'EG' }, is_active: true },
  { key: 'nrt', label: 'Tokyo Narita', meta: { iata: 'NRT', city: 'Tokyo', country_code: 'JP' }, is_active: true },
  { key: 'hnd', label: 'Tokyo Haneda', meta: { iata: 'HND', city: 'Tokyo', country_code: 'JP' }, is_active: true },
])

describe('a fare matches a leg through the airports', () => {
  const asw_cai = { route_from: 'asw', route_to: 'cai' }

  it('finds the rate the operator had already entered', () => {
    expect(flightRouteMatches(airports, asw_cai, 'Aswan', 'Cairo')).toBe(true)
  })

  it('does not match the reverse direction', () => {
    expect(flightRouteMatches(airports, asw_cai, 'Cairo', 'Aswan')).toBe(false)
  })

  it('matches any airport of a city with more than one', () => {
    expect(flightRouteMatches(airports, { route_from: 'hnd', route_to: 'cai' }, 'Tokyo', 'Cairo')).toBe(true)
    expect(flightRouteMatches(airports, { route_from: 'nrt', route_to: 'cai' }, 'Tokyo', 'Cairo')).toBe(true)
  })

  it('is false when a city has no airport, rather than matching by luck', () => {
    expect(flightRouteMatches(airports, asw_cai, 'Osaka', 'Cairo')).toBe(false)
    expect(flightRouteMatches(airports, asw_cai, '', 'Cairo')).toBe(false)
  })
})

describe('a fare reads as places', () => {
  it('names the cities, not the keys', () => {
    // "Egypt Air asw→cai" named nothing anybody recognises.
    expect(flightRouteLabel(airports, { route_from: 'asw', route_to: 'cai' })).toBe('Aswan → Cairo')
  })

  it('falls back to the stored key when the airport is gone', () => {
    expect(flightRouteLabel(airports, { route_from: 'xxx', route_to: 'cai' })).toBe('xxx → Cairo')
  })

  it('gives the city a day can be matched against', () => {
    expect(cityOfAirportKey(airports, 'asw')).toBe('Aswan')
    expect(cityOfAirportKey(airports, 'nope')).toBe('')
  })
})

describe('every reader goes through it', () => {
  it('the travel-leg picker', () => {
    const src = read('components/TravelLegPicker.tsx')
    expect(src).toContain('flightRouteMatches(airports, r, from, to)')
    expect(src).not.toContain('cityKey(r.route_from as string)')
  })

  it('the grid option label and the day-city it is matched on', () => {
    const src = read('app/api/pricing-grid/rates/route.ts')
    expect(src).toContain('flightRouteLabel(airports, r)')
    expect(src).toContain('city: cityOfAirportKey(airports, r.route_from)')
    expect(src).not.toContain('city: r.route_from,')
  })
})
