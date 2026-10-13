// Rates › Transport & Tickets — what the four forms offer (audit 2026-10):
//   T4  the transport company list reads every role, and agency types by behaviour
//   A3  airports come from the company's Airports vocabulary
//   R4  train cities are the company's destinations (source pin: page wiring)
//   F5/R2  Show Inactive actually asks for inactive rates (source pins)
//   F1  the pricing grid reads the flight guide fare as stored
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isTransportSupplier } from '@/lib/rates/transport-suppliers'
import { airportChoices } from '@/lib/rates/airport-choices'
import { supplierHasBehaviour } from '@/lib/supplier-types'

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')

describe('T4: who can be the transport company', () => {
  const agencyTypes = [{ key: 'coach_operator', behavior: 'transport_company' }, { key: 'lodge', behavior: 'hotel' }]
  const has = (s: { type?: string | null; types?: readonly string[] | null }, b: string) => supplierHasBehaviour(s, b, agencyTypes)

  it('a transport role anywhere among the supplier’s roles, not only the first', () => {
    expect(isTransportSupplier({ type: 'hotel', types: ['hotel', 'transport'] }, has)).toBe(true)
    expect(isTransportSupplier({ type: 'driver' }, has)).toBe(true)
    expect(isTransportSupplier({ type: 'hotel', types: ['hotel'] }, has)).toBe(false)
  })

  it('an agency-added type that behaves as a transport company', () => {
    expect(isTransportSupplier({ type: 'coach_operator', types: ['coach_operator'] }, has)).toBe(true)
    expect(isTransportSupplier({ type: 'lodge', types: ['lodge'] }, has)).toBe(false)
  })
})

describe('A3: the airport picker is the company’s Airports vocabulary', () => {
  const airports = [
    { key: 'cai', label: 'Cairo', code: 'CAI', city: 'Cairo', countryCode: 'EG' },
    { key: 'abs', label: 'Abu Simbel', code: 'abs', city: 'Abu Simbel', countryCode: 'EG' },
    { key: 'nrt', label: 'Tokyo Narita', code: 'NRT', city: 'Tokyo', countryCode: 'JP' },
    { key: 'noc', label: 'No code yet', code: '', city: 'Somewhere', countryCode: '' },
  ]

  it('every airport with a code, upper-cased; an airport without one is not offered', () => {
    expect(airportChoices(airports)).toEqual([
      { code: 'CAI', name: 'Cairo' }, { code: 'ABS', name: 'Abu Simbel' }, { code: 'NRT', name: 'Tokyo Narita' },
    ])
  })

  it('a code a stored rate names that the list lacks is still offered, once', () => {
    expect(airportChoices(airports, ['SSH', 'CAI', 'ssh']).map(a => a.code)).toEqual(['CAI', 'ABS', 'NRT', 'SSH'])
  })

  it('the page no longer carries its own five airports', () => {
    const page = read('app/rates/airport-services/page.tsx')
    expect(page).not.toMatch(/'Sharm El-Sheikh'/)
    expect(page).toMatch(/airportChoices\(airports, rates\.map/)
  })
})

describe('R4: train cities are the company’s destinations', () => {
  it('the fixed 19-city list is gone; the pickers read useDestinationCities', () => {
    const page = read('app/rates/trains/train-rates-content.tsx')
    expect(page).not.toMatch(/TRAIN_CITIES/)
    expect(page).toMatch(/useDestinationCities\(\)/)
  })
})

describe('Show Inactive asks the server for inactive rates', () => {
  it('F5: flights send active_only=false (the API defaults to true)', () => {
    expect(read('app/rates/flights/flights-content.tsx')).toMatch(/params\.append\('active_only', showInactive \? 'false' : 'true'\)/)
  })

  it('R2: trains refetch when the toggle changes', () => {
    expect(read('app/rates/trains/train-rates-content.tsx')).toMatch(/fetchRates\(\)\s*\n\s*\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\s*\n\s*\}, \[showInactive\]\)/)
  })

  it('T5: the transportation tiles read the server’s summary', () => {
    const page = read('app/rates/transportation/transportation-content.tsx')
    expect(page).toMatch(/\/api\/resources\/transportation\?summary=1/)
    expect(page).toMatch(/const inactiveRates = summary\?\.inactive/)
  })
})

describe('F1: the pricing grid’s flight option reads the guide fare as stored', () => {
  it('through flightGuideFare, not the mirrored column', () => {
    const src = read('app/api/pricing-grid/rate-options.ts')
    expect(src).toMatch(/guide_rate: flightGuideFare\(r\)/)
    expect(src).not.toMatch(/guide_rate: r\.guide_rate == null \? null : toNum\(r\.guide_rate\)/)
  })
})
