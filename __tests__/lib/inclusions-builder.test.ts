import { describe, it, expect } from 'vitest'
import {
  extractItineraryDetails,
  formatCityList,
  buildInclusionsExclusions,
  type InclusionsBuilderInput,
} from '@/lib/inclusions-builder'

// ============================================
// extractItineraryDetails
// ============================================

describe('extractItineraryDetails', () => {
  it('should count hotel nights per city', () => {
    const days = [
      { day_number: 1, city: 'Cairo', overnight_city: 'Cairo', is_arrival: true },
      { day_number: 2, city: 'Cairo', overnight_city: 'Cairo' },
      { day_number: 3, city: 'Cairo', overnight_city: 'Cairo' },
      { day_number: 4, city: 'Luxor', overnight_city: 'Luxor', transport_type: 'flight', flight_info: 'MS123' },
      { day_number: 5, city: 'Luxor', overnight_city: 'Luxor' },
      { day_number: 6, city: 'Cairo', overnight_city: 'Cairo', is_departure: true },
    ]

    const details = extractItineraryDetails(days)
    expect(details.nightsPerCity.get('Cairo')).toBe(3)
    expect(details.nightsPerCity.get('Luxor')).toBe(2)
  })

  it('should not count last day as a hotel night', () => {
    const days = [
      { day_number: 1, city: 'Cairo', overnight_city: 'Cairo', is_arrival: true },
      { day_number: 2, city: 'Cairo', overnight_city: 'Cairo' },
      { day_number: 3, city: 'Cairo', overnight_city: 'Cairo', is_departure: true },
    ]

    const details = extractItineraryDetails(days)
    expect(details.nightsPerCity.get('Cairo')).toBe(2)
  })

  it('should not count cruise days as hotel nights', () => {
    const days = [
      { day_number: 1, city: 'Aswan', overnight_city: 'Aswan' },
      { day_number: 2, city: 'Aswan', is_cruise_day: true, accommodation_type: 'cruise' },
      { day_number: 3, city: 'Luxor', is_cruise_day: true, accommodation_type: 'cruise' },
      { day_number: 4, city: 'Luxor', overnight_city: 'Luxor' },
    ]

    const details = extractItineraryDetails(days)
    expect(details.nightsPerCity.get('Aswan')).toBe(1)
    expect(details.nightsPerCity.has('Luxor')).toBe(false) // last day, no night counted
  })

  it('should detect domestic flights', () => {
    const days = [
      { day_number: 1, city: 'Cairo', overnight_city: 'Cairo', is_arrival: true },
      { day_number: 2, city: 'Cairo', overnight_city: 'Cairo' },
      { day_number: 3, city: 'Aswan', overnight_city: 'Aswan', transport_type: 'flight', flight_info: 'MS091', is_arrival: false, is_departure: false },
      { day_number: 4, city: 'Aswan', overnight_city: 'Aswan', is_departure: true },
    ]

    const details = extractItineraryDetails(days)
    expect(details.domesticFlights).toHaveLength(1)
    expect(details.domesticFlights[0]).toEqual({ from: 'Cairo', to: 'Aswan' })
  })

  it('should NOT detect international arrival/departure as domestic flights', () => {
    const days = [
      { day_number: 1, city: 'Cairo', overnight_city: 'Cairo', is_arrival: true, flight_info: 'MS956', transport_type: 'flight' },
      { day_number: 2, city: 'Cairo', overnight_city: 'Cairo' },
      { day_number: 3, city: 'Cairo', overnight_city: 'Cairo', is_departure: true, flight_info: 'MS957', transport_type: 'flight' },
    ]

    const details = extractItineraryDetails(days)
    expect(details.domesticFlights).toHaveLength(0)
  })

  it('should detect intercity road transfers', () => {
    const days = [
      { day_number: 1, city: 'Cairo', overnight_city: 'Cairo' },
      { day_number: 2, city: 'Cairo', overnight_city: 'Cairo' },
      { day_number: 3, city: 'Alexandria', overnight_city: 'Alexandria' },
      { day_number: 4, city: 'Alexandria', overnight_city: 'Alexandria', is_departure: true },
    ]

    const details = extractItineraryDetails(days)
    expect(details.intercityTransfers).toHaveLength(1)
    expect(details.intercityTransfers[0]).toEqual({ from: 'Cairo', to: 'Alexandria' })
  })

  it('should NOT detect day trips as intercity transfers', () => {
    const days = [
      { day_number: 1, city: 'Cairo', overnight_city: 'Cairo' },
      { day_number: 2, city: 'Alexandria', overnight_city: 'Cairo' }, // day trip — returns to Cairo
      { day_number: 3, city: 'Cairo', overnight_city: 'Cairo', is_departure: true },
    ]

    const details = extractItineraryDetails(days)
    // Day 2: city=Alexandria but overnight=Cairo, Day 3: city=Cairo, overnight=Cairo
    // previous overnight (Cairo) === current city (Cairo) on Day 3 → no intercity
    expect(details.intercityTransfers).toHaveLength(0)
  })

  it('should NOT confuse domestic flights with intercity transfers', () => {
    const days = [
      { day_number: 1, city: 'Cairo', overnight_city: 'Cairo' },
      { day_number: 2, city: 'Aswan', overnight_city: 'Aswan', transport_type: 'flight', flight_info: 'MS091', is_arrival: false, is_departure: false },
      { day_number: 3, city: 'Aswan', overnight_city: 'Aswan', is_departure: true },
    ]

    const details = extractItineraryDetails(days)
    expect(details.domesticFlights).toHaveLength(1)
    expect(details.intercityTransfers).toHaveLength(0) // flight, not road transfer
  })

  it('should track ordered cities', () => {
    const days = [
      { day_number: 1, city: 'Cairo' },
      { day_number: 2, city: 'Cairo' },
      { day_number: 3, city: 'Luxor' },
      { day_number: 4, city: 'Aswan' },
      { day_number: 5, city: 'Cairo' },
    ]

    const details = extractItineraryDetails(days)
    expect(details.orderedCities).toEqual(['Cairo', 'Luxor', 'Aswan'])
  })

  it('should handle empty days array', () => {
    const details = extractItineraryDetails([])
    expect(details.nightsPerCity.size).toBe(0)
    expect(details.domesticFlights).toHaveLength(0)
    expect(details.intercityTransfers).toHaveLength(0)
    expect(details.orderedCities).toHaveLength(0)
  })

  it('should handle cruise content with "overnight" field (not "overnight_city")', () => {
    const days = [
      { day_number: 1, city: 'Aswan', overnight: 'Aswan' },
      { day_number: 2, city: 'Kom Ombo', overnight: 'On board', is_cruise_day: true, accommodation_type: 'cruise' },
      { day_number: 3, city: 'Luxor', overnight: 'On board', is_cruise_day: true, accommodation_type: 'cruise' },
      { day_number: 4, city: 'Luxor' },
    ]

    const details = extractItineraryDetails(days)
    expect(details.nightsPerCity.get('Aswan')).toBe(1)
    expect(details.orderedCities).toEqual(['Aswan', 'Kom Ombo', 'Luxor'])
  })

  it('should detect multiple domestic flights and intercity transfers', () => {
    const days = [
      { day_number: 1, city: 'Cairo', overnight_city: 'Cairo', is_arrival: true },
      { day_number: 2, city: 'Cairo', overnight_city: 'Cairo' },
      { day_number: 3, city: 'Aswan', overnight_city: 'Aswan', transport_type: 'flight', flight_info: 'MS091', is_arrival: false, is_departure: false },
      { day_number: 4, city: 'Aswan', overnight_city: 'Aswan' },
      { day_number: 5, city: 'Luxor', overnight_city: 'Luxor' }, // intercity from Aswan → Luxor
      { day_number: 6, city: 'Luxor', overnight_city: 'Luxor' },
      { day_number: 7, city: 'Hurghada', overnight_city: 'Hurghada', transport_type: 'flight', flight_info: 'MS200', is_arrival: false, is_departure: false },
      { day_number: 8, city: 'Hurghada', overnight_city: 'Hurghada', is_departure: true },
    ]

    const details = extractItineraryDetails(days)
    expect(details.domesticFlights).toHaveLength(2)
    expect(details.domesticFlights[0]).toEqual({ from: 'Cairo', to: 'Aswan' })
    expect(details.domesticFlights[1]).toEqual({ from: 'Luxor', to: 'Hurghada' })
    expect(details.intercityTransfers).toHaveLength(1)
    expect(details.intercityTransfers[0]).toEqual({ from: 'Aswan', to: 'Luxor' })
  })
})

// ============================================
// formatCityList
// ============================================

describe('formatCityList', () => {
  it('should return empty string for no cities', () => {
    expect(formatCityList([])).toBe('')
  })

  it('should return single city name', () => {
    expect(formatCityList(['Cairo'])).toBe('Cairo')
  })

  it('should join two cities with "and"', () => {
    expect(formatCityList(['Cairo', 'Luxor'])).toBe('Cairo and Luxor')
  })

  it('should use Oxford comma for three cities', () => {
    expect(formatCityList(['Cairo', 'Luxor', 'Aswan'])).toBe('Cairo, Luxor, and Aswan')
  })

  it('should use Oxford comma for four+ cities', () => {
    expect(formatCityList(['Cairo', 'Luxor', 'Aswan', 'Hurghada'])).toBe('Cairo, Luxor, Aswan, and Hurghada')
  })
})

// ============================================
// buildInclusionsExclusions
// ============================================

describe('buildInclusionsExclusions', () => {
  const baseInput: InclusionsBuilderInput = {
    packageType: 'full-package',
    tier: 'standard',
    includeLunch: true,
    includeDinner: false,
    includeAccommodation: true,
    isCruise: false,
    language: 'English',
    hotelName: 'Marriott Mena House',
    hasAirportTransfer: true,
    attractions: ['Pyramids of Giza', 'Egyptian Museum'],
    citiesVisited: ['Cairo'],
    totalDays: 5,
    numAdults: 2,
    numChildren: 0,
  }

  describe('backward compatibility', () => {
    it('should produce valid inclusions without new fields', () => {
      const result = buildInclusionsExclusions(baseInput)
      expect(result.inclusions.length).toBeGreaterThan(0)
      expect(result.exclusions.length).toBeGreaterThan(0)
    })

    it('should fall back to single hotelName when hotelsPerCity is not provided', () => {
      const result = buildInclusionsExclusions(baseInput)
      const hotelInclusion = result.inclusions.find(i => i.includes('Marriott Mena House'))
      expect(hotelInclusion).toBeTruthy()
      expect(hotelInclusion).toContain('bed & breakfast')
    })

    it('should use "vehicle" when vehicleType is not provided', () => {
      const result = buildInclusionsExclusions(baseInput)
      const vehicleInclusion = result.inclusions.find(i => i.includes('air-conditioned'))
      expect(vehicleInclusion).toContain('vehicle')
    })
  })

  describe('tour summary', () => {
    it('should add tour summary with cities and days', () => {
      const result = buildInclusionsExclusions({
        ...baseInput,
        citiesVisited: ['Cairo', 'Luxor', 'Aswan'],
        totalDays: 8,
      })
      expect(result.inclusions[0]).toBe('8-day private guided tour covering Cairo, Luxor, and Aswan')
    })

    it('should not add tour summary with zero days', () => {
      const result = buildInclusionsExclusions({
        ...baseInput,
        totalDays: 0,
      })
      expect(result.inclusions[0]).not.toContain('-day private guided tour')
    })

    it('should not add tour summary with no cities', () => {
      const result = buildInclusionsExclusions({
        ...baseInput,
        citiesVisited: [],
      })
      expect(result.inclusions[0]).not.toContain('-day private guided tour')
    })
  })

  describe('vehicle type', () => {
    it('should include specific vehicle type when provided', () => {
      const result = buildInclusionsExclusions({
        ...baseInput,
        vehicleType: 'Minivan',
      })
      const vehicleInclusion = result.inclusions.find(i => i.includes('air-conditioned'))
      expect(vehicleInclusion).toContain('Minivan')
    })
  })

  describe('per-city hotels', () => {
    it('should list hotels per city with night counts', () => {
      const result = buildInclusionsExclusions({
        ...baseInput,
        hotelsPerCity: [
          { city: 'Cairo', hotelName: 'Marriott Mena House', nights: 3 },
          { city: 'Luxor', hotelName: 'Sofitel Winter Palace', nights: 2 },
        ],
      })
      const hotelInclusion = result.inclusions.find(i => i.startsWith('Accommodation at'))
      expect(hotelInclusion).toContain('Marriott Mena House, Cairo (3 nights, BB)')
      expect(hotelInclusion).toContain('Sofitel Winter Palace, Luxor (2 nights, BB)')
    })

    it('should handle single city hotel', () => {
      const result = buildInclusionsExclusions({
        ...baseInput,
        hotelsPerCity: [
          { city: 'Cairo', hotelName: 'Marriott Mena House', nights: 4 },
        ],
      })
      const hotelInclusion = result.inclusions.find(i => i.startsWith('Accommodation at'))
      expect(hotelInclusion).toBe('Accommodation at Marriott Mena House, Cairo (4 nights, BB)')
    })

    it('should use singular "night" for 1 night', () => {
      const result = buildInclusionsExclusions({
        ...baseInput,
        hotelsPerCity: [
          { city: 'Alexandria', hotelName: 'Hilton Alexandria', nights: 1 },
        ],
      })
      const hotelInclusion = result.inclusions.find(i => i.startsWith('Accommodation at'))
      expect(hotelInclusion).toContain('1 night, BB')
    })
  })

  describe('domestic flights', () => {
    it('should list domestic flights', () => {
      const result = buildInclusionsExclusions({
        ...baseInput,
        domesticFlights: [
          { from: 'Cairo', to: 'Aswan' },
        ],
      })
      const flightInclusion = result.inclusions.find(i => i.startsWith('Domestic flight'))
      expect(flightInclusion).toContain('Cairo')
      expect(flightInclusion).toContain('Aswan')
    })

    it('should list multiple domestic flights', () => {
      const result = buildInclusionsExclusions({
        ...baseInput,
        domesticFlights: [
          { from: 'Cairo', to: 'Aswan' },
          { from: 'Luxor', to: 'Cairo' },
        ],
      })
      const flightInclusions = result.inclusions.filter(i => i.startsWith('Domestic flight'))
      expect(flightInclusions).toHaveLength(2)
    })
  })

  describe('intercity transfers', () => {
    it('should list intercity transfers', () => {
      const result = buildInclusionsExclusions({
        ...baseInput,
        intercityTransfers: [
          { from: 'Aswan', to: 'Luxor' },
        ],
      })
      const transferInclusion = result.inclusions.find(i => i.startsWith('Private intercity transfer'))
      expect(transferInclusion).toContain('Aswan')
      expect(transferInclusion).toContain('Luxor')
    })
  })

  describe('full integration', () => {
    it('should produce correct order with all new fields', () => {
      const result = buildInclusionsExclusions({
        ...baseInput,
        citiesVisited: ['Cairo', 'Aswan', 'Luxor'],
        totalDays: 8,
        vehicleType: 'Minivan',
        hotelsPerCity: [
          { city: 'Cairo', hotelName: 'Marriott Mena House', nights: 3 },
          { city: 'Aswan', hotelName: 'Movenpick Aswan', nights: 2 },
          { city: 'Luxor', hotelName: 'Sofitel Winter Palace', nights: 2 },
        ],
        domesticFlights: [{ from: 'Cairo', to: 'Aswan' }],
        intercityTransfers: [{ from: 'Aswan', to: 'Luxor' }],
      })

      // Verify order: summary → vehicle → airport → guide → accommodation → flights → transfers → entrance → meals → ...
      expect(result.inclusions[0]).toContain('8-day private guided tour')
      expect(result.inclusions[1]).toContain('Minivan')
      expect(result.inclusions[2]).toContain('Airport meet')
      expect(result.inclusions[3]).toContain('Egyptologist guide')
      expect(result.inclusions[4]).toContain('Accommodation at')
      expect(result.inclusions[4]).toContain('Marriott Mena House')
      expect(result.inclusions[4]).toContain('Movenpick Aswan')
      expect(result.inclusions[4]).toContain('Sofitel Winter Palace')

      // Find flights and transfers (after accommodation)
      const flightIdx = result.inclusions.findIndex(i => i.startsWith('Domestic flight'))
      const transferIdx = result.inclusions.findIndex(i => i.startsWith('Private intercity transfer'))
      const entranceIdx = result.inclusions.findIndex(i => i.startsWith('Entrance fees'))

      expect(flightIdx).toBeGreaterThan(4)
      expect(transferIdx).toBeGreaterThan(flightIdx)
      expect(entranceIdx).toBeGreaterThan(transferIdx)
    })
  })

  describe('exclusions', () => {
    it('should always include international flights', () => {
      const result = buildInclusionsExclusions(baseInput)
      expect(result.exclusions).toContain('International flights')
    })

    it('should exclude meals when not included', () => {
      const result = buildInclusionsExclusions({
        ...baseInput,
        includeLunch: false,
        includeDinner: false,
      })
      expect(result.exclusions).toContain('Lunches')
      expect(result.exclusions).toContain('Dinners')
    })

    it('should not exclude meals when included', () => {
      const result = buildInclusionsExclusions({
        ...baseInput,
        includeLunch: true,
        includeDinner: true,
      })
      expect(result.exclusions).not.toContain('Lunches')
      expect(result.exclusions).not.toContain('Dinners')
    })
  })
})
