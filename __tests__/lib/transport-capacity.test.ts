// ============================================
// The agency's own vehicle bands
// ============================================
// Capacity is not a fact about cars, it is a decision about how this operator
// carries people. One that retired its sedans puts a couple in a minivan, and
// the rate row has to be able to say so — otherwise the engine keeps looking
// for a 1-2 pax vehicle that nobody owns.

import { describe, it, expect } from 'vitest'
import { getTransportRateForPax } from '@/lib/transport-rate-utils'

const v = (key: string, rate: number, min: number, max: number) => ({ key, rate_eur: rate, rate_non_eur: rate, capacity_min: min, capacity_max: max })

// A route priced the conventional way (no van).
const CONVENTIONAL = {
  vehicles: [v('sedan', 24, 1, 2), v('minivan', 28, 3, 7), v('minibus', 49, 13, 20), v('bus', 79, 21, 45)],
}

// The same route at an agency that stopped running sedans and carries 1–5 pax
// in a minivan.
const NO_SEDAN = {
  vehicles: [v('minivan', 28, 1, 5), v('minibus', 49, 13, 20), v('bus', 79, 21, 45)],
}

describe('getTransportRateForPax — vehicles the agency actually runs', () => {
  it('uses the sedan for a couple when the sedan is priced', () => {
    const r = getTransportRateForPax(CONVENTIONAL, 2)
    expect(r?.vehicleType).toBe('Sedan')
    expect(r?.rateEur).toBe(24)
  })

  it('puts a couple in the minivan when the agency prices no sedan', () => {
    const r = getTransportRateForPax(NO_SEDAN, 2)
    expect(r?.vehicleType).toBe('Minivan')
    expect(r?.rateEur).toBe(28)
  })

  it('honours a band the operator widened — 5 pax is still the minivan', () => {
    const r = getTransportRateForPax(NO_SEDAN, 5)
    expect(r?.vehicleType).toBe('Minivan')
    expect(r?.capacityMin).toBe(1)
    expect(r?.capacityMax).toBe(5)
  })

  it('moves up at the edge of that band — 6 pax leaves the minivan', () => {
    // The van is unpriced here, so the next vehicle they actually run takes it.
    const r = getTransportRateForPax(NO_SEDAN, 6)
    expect(r?.vehicleType).toBe('Minibus')
  })

  it('never books a vehicle with no rate, whatever its capacity says', () => {
    // A van would be exactly the right size for 10 — but the row prices
    // none, so it cannot be sold.
    const r = getTransportRateForPax(CONVENTIONAL, 10)
    expect(r?.vehicleType).not.toBe('Van')
    expect(r?.vehicleType).toBe('Minibus')
  })

  it('keeps the conventional band when the row carries it', () => {
    const r = getTransportRateForPax(CONVENTIONAL, 4)
    expect(r?.vehicleType).toBe('Minivan')
    expect(r?.capacityMin).toBe(3)
    expect(r?.capacityMax).toBe(7)
  })

  it('returns nothing when the route has no priced vehicle at all', () => {
    expect(getTransportRateForPax({ vehicles: [] }, 2)).toBeNull()
    expect(getTransportRateForPax({}, 2)).toBeNull()
  })

  it('takes the largest vehicle they run when the group exceeds every band', () => {
    // 60 people, biggest is a 45-seat bus. Today's rule prices ONE bus, which
    // is wrong — recorded here so the behaviour is visible rather than assumed.
    const r = getTransportRateForPax(CONVENTIONAL, 60)
    expect(r?.vehicleType).toBe('Bus')
    expect(r?.capacityMax).toBe(45)
  })
})
