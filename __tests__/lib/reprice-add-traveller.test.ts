import { describe, it, expect } from 'vitest'
import { computeAddTravellerReprice } from '@/lib/reprice-add-traveller'

describe('computeAddTravellerReprice', () => {
  it('extends the per-person rate the customer agreed to', () => {
    // €2000 for 2 people = €1000pp; +2 → €4000, delta €2000.
    const r = computeAddTravellerReprice({ oldTotal: 2000, oldPax: 2, addedPax: 2, depositPercent: 25, oldBalanceDue: 2000 })
    expect(r.method).toBe('per_person')
    if (r.method !== 'per_person') return
    expect(r.perPerson).toBe(1000)
    expect(r.newTotal).toBe(4000)
    expect(r.delta).toBe(2000)
    expect(r.newDepositAmount).toBe(1000) // 25% of 4000
    expect(r.newBalanceDue).toBe(4000)    // old 2000 + delta 2000
  })

  it('preserves what has already been paid (balance rises by delta only)', () => {
    // €3000 for 3 people, €1000 already paid so balance was €2000; +1 → +€1000.
    const r = computeAddTravellerReprice({ oldTotal: 3000, oldPax: 3, addedPax: 1, depositPercent: 20, oldBalanceDue: 2000 })
    if (r.method !== 'per_person') throw new Error('expected per_person')
    expect(r.newTotal).toBe(4000)
    expect(r.delta).toBe(1000)
    expect(r.newBalanceDue).toBe(3000) // 2000 paid-adjusted balance + 1000
  })

  it('rounds to cents', () => {
    const r = computeAddTravellerReprice({ oldTotal: 1000, oldPax: 3, addedPax: 1, depositPercent: 0, oldBalanceDue: 1000 })
    if (r.method !== 'per_person') throw new Error('expected per_person')
    expect(r.perPerson).toBe(333.33)
    expect(r.newTotal).toBe(1333.33) // 1000/3*4 = 1333.33…
  })

  it('falls back to manual when there is no priced base', () => {
    expect(computeAddTravellerReprice({ oldTotal: 0, oldPax: 2, addedPax: 1, depositPercent: 25, oldBalanceDue: 0 }).method).toBe('manual')
    expect(computeAddTravellerReprice({ oldTotal: null, oldPax: 2, addedPax: 1, depositPercent: 25, oldBalanceDue: null }).method).toBe('manual')
    expect(computeAddTravellerReprice({ oldTotal: 2000, oldPax: 0, addedPax: 1, depositPercent: 25, oldBalanceDue: 0 }).method).toBe('manual')
  })
})
