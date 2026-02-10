import { describe, it, expect } from 'vitest'
import {
  PACKAGE_TYPE_CONFIGS,
  PACKAGE_TYPE_SLUGS,
  isValidPackageType,
  getPackageTypeInstructions,
  getPackageTypeSummary,
  type PackageType,
} from '@/lib/package-types'

describe('PackageType system', () => {
  it('should define exactly 7 package types', () => {
    expect(PACKAGE_TYPE_CONFIGS).toHaveLength(7)
  })

  it('should include all expected slugs', () => {
    const expectedSlugs: PackageType[] = [
      'day-trips', 'tours-only', 'land-package', 'full-package',
      'cruise-package', 'cruise-land', 'shore-excursions'
    ]
    expect(PACKAGE_TYPE_SLUGS).toEqual(expect.arrayContaining(expectedSlugs))
    expect(expectedSlugs).toEqual(expect.arrayContaining(PACKAGE_TYPE_SLUGS))
  })

  it('should have required fields on every config', () => {
    for (const config of PACKAGE_TYPE_CONFIGS) {
      expect(config.slug).toBeTruthy()
      expect(config.name).toBeTruthy()
      expect(config.description).toBeTruthy()
      expect(config.includes).toBeDefined()
      expect(typeof config.includes.accommodation).toBe('boolean')
      expect(typeof config.includes.airportTransfers).toBe('boolean')
      expect(typeof config.includes.internalTransfers).toBe('boolean')
      expect(typeof config.includes.tours).toBe('boolean')
      expect(['none', 'optional', 'per-hotel']).toContain(config.includes.meals)
    }
  })

  describe('isValidPackageType', () => {
    it('should return true for all valid types', () => {
      for (const slug of PACKAGE_TYPE_SLUGS) {
        expect(isValidPackageType(slug)).toBe(true)
      }
    })

    it('should return false for invalid types', () => {
      expect(isValidPackageType('invalid')).toBe(false)
      expect(isValidPackageType('')).toBe(false)
      expect(isValidPackageType('Day-Trips')).toBe(false) // case sensitive
    })
  })

  describe('getPackageTypeInstructions', () => {
    it('should return instructions for all valid types', () => {
      for (const slug of PACKAGE_TYPE_SLUGS) {
        const instructions = getPackageTypeInstructions(slug)
        expect(instructions).toBeTruthy()
        expect(instructions.length).toBeGreaterThan(10)
      }
    })

    it('should include accommodation for full-package', () => {
      const instructions = getPackageTypeInstructions('full-package')
      expect(instructions).toContain('INCLUDE accommodation')
      expect(instructions).toContain('INCLUDE airport pickup')
    })

    it('should exclude accommodation for day-trips', () => {
      const instructions = getPackageTypeInstructions('day-trips')
      expect(instructions).toContain('DO NOT include any accommodation')
    })

    it('should mention port pickup for shore-excursions', () => {
      const instructions = getPackageTypeInstructions('shore-excursions')
      expect(instructions).toContain('cruise ship terminal/port')
    })
  })

  describe('getPackageTypeSummary', () => {
    it('should list hotels as included for full-package', () => {
      const summary = getPackageTypeSummary('full-package')
      expect(summary.includes).toContain('Hotels/Accommodation')
      expect(summary.includes).toContain('Airport Transfers')
    })

    it('should list hotels as excluded for tours-only', () => {
      const summary = getPackageTypeSummary('tours-only')
      expect(summary.excludes).toContain('Hotels/Accommodation')
    })
  })

  describe('cruise package types include accommodation', () => {
    it('cruise-package should include accommodation', () => {
      const config = PACKAGE_TYPE_CONFIGS.find(c => c.slug === 'cruise-package')
      expect(config?.includes.accommodation).toBe(true)
    })

    it('cruise-land should include accommodation', () => {
      const config = PACKAGE_TYPE_CONFIGS.find(c => c.slug === 'cruise-land')
      expect(config?.includes.accommodation).toBe(true)
    })
  })
})
