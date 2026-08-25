import { describe, it, expect } from 'vitest'
import { sanitizeTiers, pickTier, applyActivityTiers } from '@/lib/rates/activity-tiers'

const FELUCCA = [
  { min_pax: 1, max_pax: 4, rate_eur: 30, rate_non_eur: 24, label: 'Small' },
  { min_pax: 5, max_pax: 15, rate_eur: 20, rate_non_eur: null, label: 'Large' },
]

describe('sanitizeTiers', () => {
  it('accepts a valid band set and sorts it', () => {
    const out = sanitizeTiers([FELUCCA[1], FELUCCA[0]])
    expect(out).not.toBeNull()
    expect(out![0].max_pax).toBe(4)
    expect(out![1].max_pax).toBe(15)
  })

  it('rejects empty / non-array / malformed input as null, never throws', () => {
    expect(sanitizeTiers(null)).toBeNull()
    expect(sanitizeTiers([])).toBeNull()
    expect(sanitizeTiers('nope')).toBeNull()
    expect(sanitizeTiers([{ min_pax: 1 }])).toBeNull()
  })

  it('rejects a zero or negative rate — an unpriced hole must not price as free', () => {
    expect(sanitizeTiers([{ min_pax: 1, max_pax: 4, rate_eur: 0 }])).toBeNull()
    expect(sanitizeTiers([{ min_pax: 1, max_pax: 4, rate_eur: -5 }])).toBeNull()
    expect(sanitizeTiers([{ min_pax: 1, max_pax: 4, rate_eur: 30, rate_non_eur: 0 }])).toBeNull()
  })

  it('rejects overlapping bands', () => {
    expect(sanitizeTiers([
      { min_pax: 1, max_pax: 5, rate_eur: 30 },
      { min_pax: 5, max_pax: 10, rate_eur: 20 },
    ])).toBeNull()
  })

  it('treats empty-string non-EUR as null (falls back to EUR later)', () => {
    const out = sanitizeTiers([{ min_pax: 1, max_pax: 4, rate_eur: 30, rate_non_eur: '' }])
    expect(out![0].rate_non_eur).toBeNull()
  })
})

describe('pickTier', () => {
  it('matches the band containing the group size', () => {
    expect(pickTier(FELUCCA, 3).label).toBe('Small')
    expect(pickTier(FELUCCA, 5).label).toBe('Large')
    expect(pickTier(FELUCCA, 15).label).toBe('Large')
  })

  it('a group beyond every band uses the last band', () => {
    expect(pickTier(FELUCCA, 40).label).toBe('Large')
  })
})

describe('applyActivityTiers', () => {
  it('prices per person at the matched band rate', () => {
    const r = applyActivityTiers(FELUCCA, 3, true, '$')
    expect(r.unitCost).toBe(30)
    expect(r.lineTotal).toBe(90)
    expect(r.quantityMode).toBe('per_pax')
  })

  it('volume discount kicks in for the bigger band', () => {
    const r = applyActivityTiers(FELUCCA, 10, true, '$')
    expect(r.unitCost).toBe(20)
    expect(r.lineTotal).toBe(200)
  })

  it('non-EUR passport uses rate_non_eur, falling back to rate_eur when absent', () => {
    expect(applyActivityTiers(FELUCCA, 2, false, '$').unitCost).toBe(24) // Small has non_eur
    expect(applyActivityTiers(FELUCCA, 10, false, '$').unitCost).toBe(20) // Large falls back
  })
})
