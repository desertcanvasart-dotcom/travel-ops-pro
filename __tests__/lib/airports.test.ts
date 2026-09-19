// Operator, 2026-09-19: "we use international flights from Tokyo and from
// Osaka to Cairo and other cities in Egypt. But the from and the to tabs only
// show Egyptian city so there is no way to add international flights."
//
// Two Egypt assumptions were in the way. The flight form's From/To read the
// DESTINATIONS the agency sells — and Tokyo is not a destination, nobody runs
// a tour there. And lib/pricing/flight-leg carried nine hardcoded Egyptian
// cities, answering 'CAI' for everything else, so an install in another
// country got Cairo for all of its airports, silently.
import { describe, it, expect } from 'vitest'
import {
  airportsFrom,
  airportsForCity,
  airportByKey,
  cityAirportCode,
  airportLabel,
  groupByCountry,
} from '@/lib/rates/airports'

const item = (key: string, label: string, meta: Record<string, unknown>, is_active = true) =>
  ({ key, label, meta, is_active })

const CAI = item('cai', 'Cairo', { iata: 'CAI', city: 'Cairo', country_code: 'EG' })
const LXR = item('lxr', 'Luxor', { iata: 'LXR', city: 'Luxor', country_code: 'EG' })
const NRT = item('nrt', 'Tokyo Narita', { iata: 'NRT', city: 'Tokyo', country_code: 'JP' })
const HND = item('hnd', 'Tokyo Haneda', { iata: 'HND', city: 'Tokyo', country_code: 'JP' })

describe('airportsFrom', () => {
  it('flattens a vocabulary read', () => {
    expect(airportsFrom([NRT])).toEqual([
      { key: 'nrt', label: 'Tokyo Narita', code: 'NRT', city: 'Tokyo', countryCode: 'JP' },
    ])
  })

  it('drops what the agency switched off', () => {
    expect(airportsFrom([CAI, item('old', 'Old', {}, false)]).map(a => a.key)).toEqual(['cai'])
  })

  it('keeps an airport whose city is missing', () => {
    // The city is what joins an airport to a trip. One without it is a gap the
    // operator should SEE on the rate, not a row quietly dropped.
    const [a] = airportsFrom([item('xxx', 'Somewhere', { iata: 'XXX' })])
    expect(a).toMatchObject({ key: 'xxx', city: '', code: 'XXX' })
  })

  it('normalises the codes it is given', () => {
    const [a] = airportsFrom([item('nrt', 'Narita', { iata: ' nrt ', city: ' Tokyo ', country_code: 'jp' })])
    expect(a).toMatchObject({ code: 'NRT', city: 'Tokyo', countryCode: 'JP' })
  })
})

describe('airportsForCity', () => {
  const all = airportsFrom([CAI, LXR, NRT, HND])

  it('finds every airport of a city', () => {
    expect(airportsForCity(all, 'Tokyo').map(a => a.key)).toEqual(['nrt', 'hnd'])
  })

  it('matches the way the engine matches cities', () => {
    expect(airportsForCity(all, '  cairo ').map(a => a.key)).toEqual(['cai'])
  })

  it('empty is a real answer', () => {
    // A city with no airport cannot be flown to, and the caller must say so
    // rather than reach for a default. The old default was Cairo.
    expect(airportsForCity(all, 'Osaka')).toEqual([])
    expect(airportsForCity(all, '')).toEqual([])
    expect(airportsForCity(all, null)).toEqual([])
  })
})

describe('cityAirportCode', () => {
  const all = airportsFrom([CAI, NRT, HND])

  it('gives the code when a city has exactly one airport', () => {
    expect(cityAirportCode(all, 'Cairo')).toBe('CAI')
  })

  it('declines when a city has two — there is no single code', () => {
    // Tokyo is NRT or HND. Answering one of them would be a guess, and the
    // caller that needs certainty resolves the airport, not the city.
    expect(cityAirportCode(all, 'Tokyo')).toBeNull()
  })

  it('declines for a city it does not know', () => {
    expect(cityAirportCode(all, 'Osaka')).toBeNull()
  })
})

describe('airportByKey', () => {
  const all = airportsFrom([CAI, NRT])
  it('finds by the key a rate stores', () => expect(airportByKey(all, 'nrt')?.code).toBe('NRT'))
  it('answers null for a key that is gone', () => expect(airportByKey(all, 'xxx')).toBeNull())
  it('answers null for nothing', () => expect(airportByKey(all, null)).toBeNull())
})

describe('airportLabel', () => {
  it('reads as the agency wrote it, with the code', () => {
    expect(airportLabel(airportsFrom([NRT])[0])).toBe('Tokyo Narita (NRT)')
  })
  it('drops the parentheses when there is no code', () => {
    expect(airportLabel(airportsFrom([item('x', 'Somewhere', { city: 'X' })])[0])).toBe('Somewhere')
  })
})

describe('groupByCountry', () => {
  it('keeps one country flat enough to render flat', () => {
    expect(groupByCountry(airportsFrom([CAI, LXR]))).toHaveLength(1)
  })

  it('separates an origin from the places the agency operates', () => {
    const groups = groupByCountry(airportsFrom([NRT, CAI, LXR]))
    expect(groups.map(g => g.countryCode)).toEqual(['EG', 'JP'])
    expect(groups[1].airports.map(a => a.key)).toEqual(['nrt'])
  })
})
