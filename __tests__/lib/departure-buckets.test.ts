// The departures grid splits each date band into AIR / 燃油 / LND / 合計
// (handover/feature-specs/6). These pin the one split rule and the assembly so
// the grid and any export cannot drift apart.
import { describe, it, expect } from 'vitest'
import {
  bucketOf,
  isAirLine,
  sumBuckets,
  assembleBand,
  convertAtRate,
  type BucketableLine,
} from '@/lib/pricing/departure-buckets'

const line = (serviceType: string, amount: number): BucketableLine => ({ serviceType, amount })

describe('the split rule: air tickets are AIR, everything else is LND', () => {
  it('classifies a flight line as air', () => {
    expect(bucketOf({ serviceType: 'flight' })).toBe('air')
    expect(isAirLine({ serviceType: 'flight' })).toBe(true)
  })

  it('is case-insensitive on serviceType', () => {
    expect(bucketOf({ serviceType: 'FLIGHT' })).toBe('air')
  })

  it('keeps a guide who flies with the party in LND, not AIR', () => {
    // The engine emits "Throughout Guide — flight …" as serviceType 'guide'.
    expect(bucketOf({ serviceType: 'guide' })).toBe('land')
    expect(isAirLine({ serviceType: 'guide' })).toBe(false)
  })

  it('puts hotels, cruise, entrance, tips, ground transport in LND', () => {
    for (const t of ['accommodation', 'cruise', 'entrance', 'tips', 'transportation', 'meal', 'airport_service']) {
      expect(bucketOf({ serviceType: t })).toBe('land')
    }
  })

  it('treats a missing serviceType as land', () => {
    expect(bucketOf({ serviceType: '' })).toBe('land')
  })
})

describe('summing lines into buckets', () => {
  it('adds each line into its own bucket', () => {
    const lines = [
      line('flight', 300),        // domestic air → AIR
      line('flight', 700),        // international air → AIR
      line('guide', 120),         // guide-on-flight → LND
      line('accommodation', 400),
      line('cruise', 500),
      line('entrance', 40),
    ]
    expect(sumBuckets(lines)).toEqual({ air: 1000, land: 1060 })
  })

  it('is empty-safe and coerces non-numbers to 0', () => {
    expect(sumBuckets([])).toEqual({ air: 0, land: 0 })
    expect(sumBuckets([{ serviceType: 'flight', amount: NaN }])).toEqual({ air: 0, land: 0 })
  })
})

describe('assembling a band (per person, target currency)', () => {
  it('totals AIR + 燃油 + LND', () => {
    const band = assembleBand({ airPp: 1000, fuelPp: 150, landPp: 2000 })
    expect(band.totalPp).toBe(3150)
    expect(band.incomplete).toBe(false)
  })

  it('carries un-entered fuel through as null but still totals AIR + LND', () => {
    const band = assembleBand({ airPp: 1000, fuelPp: null, landPp: 2000 })
    expect(band.fuelPp).toBeNull()
    expect(band.totalPp).toBe(3000)
  })

  it('marks a band incomplete when the engine reported holes', () => {
    const band = assembleBand({ airPp: 1000, fuelPp: 150, landPp: 0, incomplete: true })
    expect(band.incomplete).toBe(true)
  })
})

describe('FX conversion is a parameter, rounded to whole target units', () => {
  it('converts USD to whole JPY at the office rate', () => {
    // 160 JPY per USD, the office internal rate.
    expect(convertAtRate(1000, 160)).toBe(160000)
    expect(convertAtRate(12.345, 160)).toBe(1975) // 1975.2 → 1975
  })

  it('is zero-safe', () => {
    expect(convertAtRate(0, 160)).toBe(0)
    expect(convertAtRate(100, 0)).toBe(0)
  })
})
