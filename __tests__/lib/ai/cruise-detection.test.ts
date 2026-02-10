import { describe, it, expect } from 'vitest'
import { detectCruiseRequest } from '@/lib/ai/cruise-detection'

describe('detectCruiseRequest', () => {
  const defaultArgs = {
    interests: [] as string[],
    cities: [] as string[],
    specialRequests: [] as string[],
    durationDays: 5,
  }

  describe('positive cruise detection', () => {
    it('should detect "Nile Cruise" as cruise', () => {
      const result = detectCruiseRequest(
        'Nile Cruise from Luxor to Aswan',
        defaultArgs.interests, defaultArgs.cities,
        defaultArgs.specialRequests, defaultArgs.durationDays
      )
      expect(result.isCruise).toBe(true)
      expect(result.cruiseType).toBe('nile-cruise')
    })

    it('should detect CRZ abbreviation as cruise', () => {
      const result = detectCruiseRequest(
        '3NTS CRZ',
        defaultArgs.interests, defaultArgs.cities,
        defaultArgs.specialRequests, defaultArgs.durationDays
      )
      expect(result.isCruise).toBe(true)
      expect(result.cruiseNights).toBe(3)
    })

    it('should detect "4 night cruise" as booking term', () => {
      const result = detectCruiseRequest(
        'I want a 4 night cruise on the Nile',
        defaultArgs.interests, defaultArgs.cities,
        defaultArgs.specialRequests, defaultArgs.durationDays
      )
      expect(result.isCruise).toBe(true)
    })

    it('should detect Lake Nasser cruise type', () => {
      const result = detectCruiseRequest(
        'Lake Nasser cruise',
        defaultArgs.interests, defaultArgs.cities,
        defaultArgs.specialRequests, defaultArgs.durationDays
      )
      expect(result.isCruise).toBe(true)
      expect(result.cruiseType).toBe('lake-nasser')
    })
  })

  describe('negative cruise detection', () => {
    it('should NOT detect hotel-only itinerary as cruise', () => {
      const result = detectCruiseRequest(
        '4 days Cairo with Marriott Mena House',
        defaultArgs.interests,
        ['Cairo'],
        defaultArgs.specialRequests,
        4,
        '2NTS CAI Marriott Mena House',
        'land-package' // parser says land package
      )
      expect(result.isCruise).toBe(false)
    })

    it('should NOT false-positive on generic travel text', () => {
      const result = detectCruiseRequest(
        'Cairo pyramids and museum tour',
        defaultArgs.interests,
        ['Cairo', 'Giza'],
        defaultArgs.specialRequests,
        3
      )
      expect(result.isCruise).toBe(false)
    })
  })

  describe('cruise route detection', () => {
    it('should detect luxor-to-aswan route', () => {
      const result = detectCruiseRequest(
        'Nile Cruise from Luxor to Aswan',
        defaultArgs.interests, defaultArgs.cities,
        defaultArgs.specialRequests, defaultArgs.durationDays
      )
      expect(result.route).toBe('luxor-aswan')
      expect(result.startCity).toBe('Luxor')
      expect(result.endCity).toBe('Aswan')
    })

    it('should detect aswan-to-luxor route', () => {
      const result = detectCruiseRequest(
        'Nile Cruise from Aswan to Luxor',
        defaultArgs.interests, defaultArgs.cities,
        defaultArgs.specialRequests, defaultArgs.durationDays
      )
      expect(result.route).toBe('aswan-luxor')
      expect(result.startCity).toBe('Aswan')
    })

    it('should default to aswan-luxor when no route specified', () => {
      const result = detectCruiseRequest(
        'Nile Cruise 4 nights',
        defaultArgs.interests, defaultArgs.cities,
        defaultArgs.specialRequests, defaultArgs.durationDays
      )
      expect(result.route).toBe('aswan-luxor')
    })
  })

  describe('cruise + land detection', () => {
    it('should detect includesLand when Cairo is present', () => {
      const result = detectCruiseRequest(
        '2NTS CAI + 3NTS CRZ',
        defaultArgs.interests,
        ['Cairo', 'Luxor', 'Aswan'],
        defaultArgs.specialRequests,
        6
      )
      expect(result.isCruise).toBe(true)
      expect(result.includesLand).toBe(true)
      expect(result.cruiseNights).toBe(3)
      expect(result.landNights).toBe(2)
    })

    it('should NOT detect includesLand for cruise-only', () => {
      const result = detectCruiseRequest(
        '4NTS CRZ Luxor to Aswan',
        defaultArgs.interests,
        ['Luxor', 'Aswan'],
        defaultArgs.specialRequests,
        5
      )
      expect(result.isCruise).toBe(true)
      expect(result.includesLand).toBe(false)
    })
  })

  describe('duration detection', () => {
    it('should detect duration from "4 night" pattern', () => {
      const result = detectCruiseRequest(
        '4 night Nile Cruise',
        defaultArgs.interests, defaultArgs.cities,
        defaultArgs.specialRequests, defaultArgs.durationDays
      )
      expect(result.detectedDuration).toBe(5) // 4 nights + 1
    })

    it('should detect duration from NTS CRZ pattern', () => {
      const result = detectCruiseRequest(
        '',
        defaultArgs.interests, defaultArgs.cities,
        defaultArgs.specialRequests, defaultArgs.durationDays,
        '3NTS CRZ Aswan to Luxor'
      )
      expect(result.cruiseNights).toBe(3)
      expect(result.detectedDuration).toBe(4) // 3 NTS + 1
    })
  })
})
