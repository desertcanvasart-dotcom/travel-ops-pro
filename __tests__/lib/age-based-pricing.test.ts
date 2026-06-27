import { describe, it, expect, vi } from 'vitest'

// auto-pricing-service builds a Supabase client at module load; composeAgeBasedPricing
// / calculateAgeBasedPricing are pure, so we mock the client to import in isolation.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({ select: () => ({}) }) }),
}))

import {
  composeAgeBasedPricing,
  calculateAgeBasedPricing,
  type PaxPricingResult,
} from '@/lib/auto-pricing-service'

// A synthetic 2-pax reference row. Only totalCost (PRE-margin) and numPax are
// read by composeAgeBasedPricing; the rest mirror a 25%-margin sheet for realism.
// Per-person cost = withoutLeader.totalCost / numPax = 2000 / 2 = €1000.
function paxRow(over: Partial<PaxPricingResult['withoutLeader'] & { leaderTotal: number }> = {}): PaxPricingResult {
  const withoutTotal = 2000
  const leaderTotal = over.leaderTotal ?? 2400 // +€400 leader add-on (room + extra seat)
  return {
    numPax: 2,
    withoutLeader: { totalCost: withoutTotal, marginAmount: 500, sellingPrice: 2500, pricePerPerson: 1250 },
    withLeader: { totalCost: leaderTotal, tourLeaderCost: 320, marginAmount: leaderTotal * 0.25, sellingPrice: leaderTotal * 1.25, pricePerPerson: (leaderTotal * 1.25) / 2 },
  }
}

const MARGIN = 25
const adults = (n: number) => ({ numAdults: n, numChildren: 0, numInfants: 0 })

describe('composeAgeBasedPricing — margin applied exactly once', () => {
  it('2 adults: effective markup is the configured margin, NOT margin squared', () => {
    const r = composeAgeBasedPricing(paxRow(), adults(2), MARGIN, false)
    // cost = €1000 × 2 = €2000 ; +25% = €2500 ; per person €1250.
    expect(r.totalCost).toBe(2000)
    expect(r.sellingPrice).toBe(2500)
    expect(r.pricePerPerson).toBe(1250)
    // The bug produced €3125 (2000 × 1.25 × 1.25). Lock it out.
    expect(r.sellingPrice).not.toBe(3125)
    // Invariant: markup === configured margin.
    expect(r.sellingPrice / r.totalCost).toBeCloseTo(1 + MARGIN / 100, 10)
  })

  it('children get the 50% discount off the pre-margin cost, margined once', () => {
    const r = composeAgeBasedPricing(paxRow(), { numAdults: 1, numChildren: 1, numInfants: 0 }, MARGIN, false)
    // adult €1000 + child €500 = €1500 cost ; +25% = €1875.
    expect(r.totalCost).toBe(1500)
    expect(r.sellingPrice).toBe(1875)
    expect(r.sellingPrice / r.totalCost).toBeCloseTo(1.25, 10)
  })

  it('infants are free (cost side); markup still exactly the margin', () => {
    const r = composeAgeBasedPricing(paxRow(), { numAdults: 2, numChildren: 0, numInfants: 1 }, MARGIN, false)
    expect(r.totalCost).toBe(2000) // infant adds €0 to cost
    expect(r.sellingPrice / r.totalCost).toBeCloseTo(1.25, 10)
  })

  it('tour leader is added ONCE (cost delta), margined once; price is self-consistent', () => {
    const r = composeAgeBasedPricing(paxRow({ leaderTotal: 2400 }), adults(2), MARGIN, true)
    // passengers €2000 + leader delta €400 = €2400 cost ; +25% = €3000 ; per paying person €1500.
    expect(r.tourLeaderCost).toBe(400)
    expect(r.totalCost).toBe(2400)
    expect(r.sellingPrice).toBe(3000)
    // Self-consistency the old code broke: pricePerPerson × payingPax === sellingPrice.
    expect(r.pricePerPerson * 2).toBeCloseTo(r.sellingPrice, 10)
    expect(r.sellingPrice / r.totalCost).toBeCloseTo(1.25, 10)
  })

  it('markup invariant holds across margins and mixes', () => {
    for (const margin of [0, 10, 22, 25, 40]) {
      for (const pax of [adults(2), { numAdults: 2, numChildren: 2, numInfants: 1 }]) {
        const r = composeAgeBasedPricing(paxRow(), pax, margin, false)
        expect(r.sellingPrice / r.totalCost).toBeCloseTo(1 + margin / 100, 10)
      }
    }
  })
})

describe('calculateAgeBasedPricing — contract (expects a PRE-margin cost)', () => {
  it('applies margin once to the cost it is given', () => {
    // €1000 pre-margin adult cost, 2 adults, 25% → €2500 selling.
    const r = calculateAgeBasedPricing(1000, adults(2), 25, 0)
    expect(r.totalCost).toBe(2000)
    expect(r.sellingPrice).toBe(2500)
    expect(r.marginAmount).toBe(500)
  })
})
