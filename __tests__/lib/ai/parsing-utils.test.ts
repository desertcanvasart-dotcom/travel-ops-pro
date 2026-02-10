import { describe, it, expect } from 'vitest'
import {
  isValidDate,
  toNumber,
  normalizeTier,
  calculateExpectedDays,
  preParseRawItinerary,
  VALID_TIERS,
  TIER_MAP,
} from '@/lib/ai/parsing-utils'

describe('isValidDate', () => {
  it('should return true for valid dates', () => {
    expect(isValidDate('2025-03-15')).toBe(true)
    expect(isValidDate('2025-12-31')).toBe(true)
  })

  it('should return false for null/undefined', () => {
    expect(isValidDate(null)).toBe(false)
    expect(isValidDate(undefined)).toBe(false)
  })

  it('should return false for invalid strings', () => {
    expect(isValidDate('not-a-date')).toBe(false)
    expect(isValidDate('')).toBe(false)
  })
})

describe('toNumber', () => {
  it('should convert valid numbers', () => {
    expect(toNumber(5)).toBe(5)
    expect(toNumber('10')).toBe(10)
    expect(toNumber(0)).toBe(0)
  })

  it('should return fallback for invalid values', () => {
    expect(toNumber(null)).toBe(0)
    expect(toNumber(undefined)).toBe(0)
    expect(toNumber('abc')).toBe(0)
    expect(toNumber(NaN)).toBe(0)
  })

  it('should use custom fallback', () => {
    expect(toNumber(null, 99)).toBe(99)
  })
})

describe('normalizeTier', () => {
  it('should normalize valid tiers', () => {
    expect(normalizeTier('budget')).toBe('budget')
    expect(normalizeTier('standard')).toBe('standard')
    expect(normalizeTier('deluxe')).toBe('deluxe')
    expect(normalizeTier('luxury')).toBe('luxury')
  })

  it('should map legacy values', () => {
    expect(normalizeTier('economy')).toBe('budget')
    expect(normalizeTier('mid-range')).toBe('standard')
    expect(normalizeTier('superior')).toBe('deluxe')
    expect(normalizeTier('premium')).toBe('luxury')
    expect(normalizeTier('vip')).toBe('luxury')
  })

  it('should default to standard for unknown values', () => {
    expect(normalizeTier(null)).toBe('standard')
    expect(normalizeTier(undefined)).toBe('standard')
    expect(normalizeTier('unknown')).toBe('standard')
  })

  it('should be case-insensitive', () => {
    expect(normalizeTier('LUXURY')).toBe('luxury')
    expect(normalizeTier('Budget')).toBe('budget')
  })
})

describe('calculateExpectedDays', () => {
  it('should count day markers (D1, D2...)', () => {
    const raw = 'D1 Cairo\nD2 Alexandria\nD3 Luxor\nD4 Aswan\nD5 Departure'
    expect(calculateExpectedDays(raw, null)).toBe(5)
  })

  it('should calculate from NTS pattern', () => {
    const raw = '2NTS CAI + 3NTS CRZ + 2NTS HRG'
    expect(calculateExpectedDays(raw, null)).toBe(8) // 7 nights + 1
  })

  it('should use extracted days count', () => {
    const extractedDays = Array.from({ length: 4 }, (_, i) => ({
      day_number: i + 1,
      date: null,
      date_display: null,
      title: `Day ${i + 1}`,
      city: 'Cairo',
      is_arrival: false,
      is_departure: false,
      is_transfer_only: false,
      is_free_day: false,
      activities: [],
      attractions: [],
      meals_included: { breakfast: false, lunch: false, dinner: false },
      guide_required: false,
      transport_type: null,
      flight_info: null,
      hotel_name: null,
      overnight_city: 'Cairo',
      notes: null,
    }))
    expect(calculateExpectedDays('', extractedDays)).toBe(4)
  })

  it('should take the maximum of all methods', () => {
    const raw = 'D1 CAI\nD2 CAI\n3NTS CAI'
    // Day markers: max=2, NTS: 3+1=4, no extracted
    expect(calculateExpectedDays(raw, null)).toBe(4)
  })

  it('should default to 1 if nothing found', () => {
    expect(calculateExpectedDays('', null)).toBe(1)
  })
})

describe('preParseRawItinerary', () => {
  it('should parse D1, D2 format', () => {
    const raw = 'D1 Cairo pyramids\nD2 Alexandria library\nD3 Departure'
    const result = preParseRawItinerary(raw)
    expect(result).toHaveLength(3)
    expect(result[0].dayNumber).toBe(1)
    expect(result[1].dayNumber).toBe(2)
    expect(result[2].dayNumber).toBe(3)
  })

  it('should parse "Day 1", "Day 2" format', () => {
    const raw = 'Day 1: Cairo\nDay 2: Luxor\nDay 3: Aswan'
    const result = preParseRawItinerary(raw)
    expect(result).toHaveLength(3)
    expect(result[0].dayNumber).toBe(1)
  })

  it('should return single segment if no day markers', () => {
    const raw = 'Cairo pyramids and museum'
    const result = preParseRawItinerary(raw)
    expect(result).toHaveLength(1)
    expect(result[0].dayNumber).toBe(1)
    expect(result[0].rawContent).toBe(raw)
  })

  it('should sort by day number', () => {
    const raw = 'D3 Aswan\nD1 Cairo\nD2 Luxor'
    const result = preParseRawItinerary(raw)
    expect(result[0].dayNumber).toBe(1)
    expect(result[1].dayNumber).toBe(2)
    expect(result[2].dayNumber).toBe(3)
  })
})

describe('TIER constants', () => {
  it('should have 4 valid tiers', () => {
    expect(VALID_TIERS).toEqual(['budget', 'standard', 'deluxe', 'luxury'])
  })

  it('TIER_MAP should map all legacy values', () => {
    expect(Object.keys(TIER_MAP).length).toBeGreaterThanOrEqual(9)
  })
})
