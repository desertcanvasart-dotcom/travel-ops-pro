import { describe, it, expect } from 'vitest'
import { guideCitiesText, guideCitiesWrite, guideCityRank, guideRateCities, guideRateNamesCity } from '@/lib/guides/guide-cities'

// One guide rate covers several cities (operator 2026-11-07): Cairo + Alexandria,
// Luxor + Aswan, or all cities (an empty list).

describe('guideRateCities', () => {
  it('reads the list, falls back to the old single city, and [] means all cities', () => {
    expect(guideRateCities({ city: 'Cairo', cities: ['Cairo', 'Alexandria'] })).toEqual(['Cairo', 'Alexandria'])
    expect(guideRateCities({ city: 'Aswan', cities: [] })).toEqual(['Aswan'])
    expect(guideRateCities({ city: 'Aswan' })).toEqual(['Aswan'])
    expect(guideRateCities({ city: null, cities: null })).toEqual([])
    expect(guideRateCities({ cities: ['Luxor', 'luxor ', ''] })).toEqual(['Luxor'])
  })
})

describe('guideCityRank', () => {
  const cairoAlex = { city: 'Cairo', cities: ['Cairo', 'Alexandria'] }
  it('0 for any city in the list, 1 for an all-cities rate, 2 for other cities', () => {
    expect(guideCityRank(cairoAlex, 'alexandria')).toBe(0)
    expect(guideCityRank(cairoAlex, 'Cairo')).toBe(0)
    expect(guideCityRank({ cities: [] }, 'Cairo')).toBe(1)
    expect(guideCityRank(cairoAlex, 'Luxor')).toBe(2)
  })
  it('with no city asked, an all-cities rate fits best', () => {
    expect(guideCityRank({ cities: [] }, null)).toBe(0)
    expect(guideCityRank(cairoAlex, '')).toBe(1)
  })
  it('names a city only when listed', () => {
    expect(guideRateNamesCity(cairoAlex, 'Alexandria')).toBe(true)
    expect(guideRateNamesCity({ cities: [] }, 'Alexandria')).toBe(false)
  })
})

describe('guideCitiesWrite', () => {
  it('cities wins and sets city to the first; city alone writes a one-city list; neither = untouched', () => {
    expect(guideCitiesWrite({ city: 'Giza', cities: ['Luxor', 'Aswan'] })).toEqual({ city: 'Luxor', cities: ['Luxor', 'Aswan'] })
    expect(guideCitiesWrite({ cities: [] })).toEqual({ city: null, cities: [] })
    expect(guideCitiesWrite({ city: ' Cairo ' })).toEqual({ city: 'Cairo', cities: ['Cairo'] })
    expect(guideCitiesWrite({ city: '' })).toEqual({ city: null, cities: [] })
    expect(guideCitiesWrite({})).toBeNull()
  })
  it('text for lists; null for all cities', () => {
    expect(guideCitiesText({ cities: ['Luxor', 'Aswan'] })).toBe('Luxor, Aswan')
    expect(guideCitiesText({ cities: [] })).toBeNull()
  })
})
