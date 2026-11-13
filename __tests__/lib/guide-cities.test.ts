import { describe, it, expect } from 'vitest'
import {
  cleanCityList, guideCitiesText, guideCityRank, guideRateCities, guideRateNamesCity, withGuideCities,
} from '@/lib/guides/guide-cities'

// The cities a guide works in belong to the GUIDE (supplier_cities, 20270118):
// one price in every city the guide works (operator 2026-11-13). Rate rows
// carry them as `guide_cities`; the rate's own city / cities are retired.

describe('guideRateCities', () => {
  it("reads only the guide's cities, never the retired rate columns", () => {
    expect(guideRateCities({ guide_cities: ['Cairo', 'Alexandria'] })).toEqual(['Cairo', 'Alexandria'])
    expect(guideRateCities({ guide_cities: ['Luxor', 'luxor ', '', null] })).toEqual(['Luxor'])
    expect(guideRateCities({ city: 'Aswan', cities: ['Aswan'] } as any)).toEqual([])
    expect(guideRateCities({ guide_cities: null })).toEqual([])
  })
})

describe('guideCityRank', () => {
  const cairoAlex = { guide_cities: ['Cairo', 'Alexandria'] }
  it("0 = the guide works there, 1 = every-city guide, 2 = other cities only", () => {
    expect(guideCityRank(cairoAlex, 'alexandria')).toBe(0)
    expect(guideCityRank(cairoAlex, 'Cairo')).toBe(0)
    expect(guideCityRank({ guide_cities: [] }, 'Cairo')).toBe(1)
    expect(guideCityRank({}, 'Cairo')).toBe(1)
    expect(guideCityRank(cairoAlex, 'Luxor')).toBe(2)
  })
  it('with no city asked, an every-city guide fits best', () => {
    expect(guideCityRank({ guide_cities: [] }, null)).toBe(0)
    expect(guideCityRank(cairoAlex, '')).toBe(1)
  })
  it('names a city only by its list', () => {
    expect(guideRateNamesCity(cairoAlex, 'Alexandria')).toBe(true)
    expect(guideRateNamesCity({ guide_cities: [] }, 'Alexandria')).toBe(false)
  })
})

describe('cleanCityList / guideCitiesText / withGuideCities', () => {
  it('cleans, de-duplicates case-insensitively, keeps the first spelling', () => {
    expect(cleanCityList([' Cairo ', 'cairo', 'Luxor', '', null, 3])).toEqual(['Cairo', 'Luxor', '3'])
    expect(cleanCityList('Cairo')).toEqual([])
  })
  it('words the list, null for every city', () => {
    expect(guideCitiesText({ guide_cities: ['Luxor', 'Aswan'] })).toBe('Luxor, Aswan')
    expect(guideCitiesText({ guide_cities: [] })).toBeNull()
  })
  it("attaches each rate's guide cities; a rate with no guide works everywhere", () => {
    const map = new Map([['g1', ['Cairo', 'Alexandria']]])
    const out = withGuideCities([{ id: 'a', supplier_id: 'g1' }, { id: 'b', supplier_id: 'g2' }, { id: 'c', supplier_id: null }], map)
    expect(out.map(r => r.guide_cities)).toEqual([['Cairo', 'Alexandria'], [], []])
    // A copy: editing one row's list never edits the guide's.
    out[0].guide_cities.push('Luxor')
    expect(map.get('g1')).toEqual(['Cairo', 'Alexandria'])
  })
})
