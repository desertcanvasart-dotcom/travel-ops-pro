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

  it('does not divide one traveller\'s upgrade across the people added later', () => {
    // €2000 agreed for 2 (=€1000pp), plus an €820 business-class upgrade for
    // ONE of them, so total_cost is €2820. Adding a third traveller must cost
    // €1000 — not €1410, which is what dividing the total would charge.
    const r = computeAddTravellerReprice({
      oldTotal: 2820, oldBaseTotal: 2000, oldPax: 2, addedPax: 1,
      depositPercent: 20, oldBalanceDue: 2820,
    })
    if (r.method !== 'per_person') throw new Error('expected per_person')
    expect(r.perPerson).toBe(1000)
    expect(r.delta).toBe(1000)
    expect(r.newTotal).toBe(3820)          // the upgrade rides along, unscaled
    expect(r.newBaseTotalCost).toBe(3000)  // and stays out of the base
    expect(r.newDepositAmount).toBe(600)   // 20% of the base, not of 3820
    expect(r.newBalanceDue).toBe(3820)
  })

  it('keeps the base in step so a SECOND addition is still correct', () => {
    const first = computeAddTravellerReprice({
      oldTotal: 2820, oldBaseTotal: 2000, oldPax: 2, addedPax: 1,
      depositPercent: 20, oldBalanceDue: 2820,
    })
    if (first.method !== 'per_person') throw new Error('expected per_person')
    const second = computeAddTravellerReprice({
      oldTotal: first.newTotal, oldBaseTotal: first.newBaseTotalCost,
      oldPax: 3, addedPax: 1, depositPercent: 20, oldBalanceDue: first.newBalanceDue,
    })
    if (second.method !== 'per_person') throw new Error('expected per_person')
    expect(second.perPerson).toBe(1000)  // still €1000pp, not creeping upward
    expect(second.delta).toBe(1000)
  })

  it('is unchanged on a booking with no extras (base absent)', () => {
    const withoutBase = computeAddTravellerReprice({
      oldTotal: 2000, oldPax: 2, addedPax: 2, depositPercent: 25, oldBalanceDue: 2000,
    })
    const withBaseEqualToTotal = computeAddTravellerReprice({
      oldTotal: 2000, oldBaseTotal: 2000, oldPax: 2, addedPax: 2, depositPercent: 25, oldBalanceDue: 2000,
    })
    expect(withoutBase).toEqual(withBaseEqualToTotal)
  })

  it('falls back to manual when there is no priced base', () => {
    expect(computeAddTravellerReprice({ oldTotal: 0, oldPax: 2, addedPax: 1, depositPercent: 25, oldBalanceDue: 0 }).method).toBe('manual')
    expect(computeAddTravellerReprice({ oldTotal: null, oldPax: 2, addedPax: 1, depositPercent: 25, oldBalanceDue: null }).method).toBe('manual')
    expect(computeAddTravellerReprice({ oldTotal: 2000, oldPax: 0, addedPax: 1, depositPercent: 25, oldBalanceDue: 0 }).method).toBe('manual')
  })
})
