import { describe, it, expect } from 'vitest'
import { flightTypeForRoute, destinationOfCity } from '@/lib/rates/flight-type'

// The flights form decided "domestic" from a hardcoded Egypt city list; it
// now follows the agency's destinations, whatever country they sell.
const EGYPT = { id: 'eg', cities: [{ name: 'Cairo' }, { name: 'Luxor', aliases: ['Louxor'] }, { name: 'Aswan' }] }
const JAPAN = { id: 'jp', cities: [{ name: 'Tokyo' }, { name: 'Osaka' }] }

describe('flightTypeForRoute', () => {
  it('two cities of the same destination are domestic', () => {
    expect(flightTypeForRoute('Cairo', 'Luxor', [EGYPT])).toBe('domestic')
    expect(flightTypeForRoute('Tokyo', 'Osaka', [EGYPT, JAPAN])).toBe('domestic')
  })

  it('cities of two different destinations are international', () => {
    expect(flightTypeForRoute('Cairo', 'Tokyo', [EGYPT, JAPAN])).toBe('international')
  })

  it('a known city to one the agency sells nothing in is international — abroad by definition', () => {
    expect(flightTypeForRoute('Cairo', 'Rome', [EGYPT])).toBe('international')
    expect(flightTypeForRoute('Rome', 'Cairo', [EGYPT])).toBe('international')
  })

  it('two unknown cities are no guess at all', () => {
    expect(flightTypeForRoute('Rome', 'Paris', [EGYPT])).toBeNull()
    expect(flightTypeForRoute('', 'Cairo', [EGYPT])).toBe('international')
    expect(flightTypeForRoute('', '', [EGYPT])).toBeNull()
  })

  it('matches by alias and ignores case and spacing, and answers with the agency\'s keys', () => {
    expect(destinationOfCity(' louxor ', [EGYPT])).toBe('eg')
    expect(flightTypeForRoute('CAIRO', 'louxor', [EGYPT], { domestic: 'kokunai', international: 'kokusai' })).toBe('kokunai')
  })
})
