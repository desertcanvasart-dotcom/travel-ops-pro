// ============================================
// The agency's own vehicle bands
// ============================================
// Capacity is not a fact about cars, it is a decision about how this operator
// carries people. One that retired its sedans puts a couple in a minivan, and
// the rate row has to be able to say so — otherwise the engine keeps looking
// for a 1-2 pax vehicle that nobody owns.

import { describe, it, expect } from 'vitest'
import { getTransportRateForPax } from '@/lib/transport-rate-utils'

// A route priced the conventional way.
const CONVENTIONAL = {
  sedan_rate_eur: 24, sedan_rate_non_eur: 24,
  minivan_rate_eur: 28, minivan_rate_non_eur: 28,
  minibus_rate_eur: 49, minibus_rate_non_eur: 49,
  bus_rate_eur: 79, bus_rate_non_eur: 79,
  van_rate_eur: null, van_rate_non_eur: null,
}

// The same route at an agency that stopped running sedans and carries 1–5 pax
// in a minivan.
const NO_SEDAN = {
  ...CONVENTIONAL,
  sedan_rate_eur: null, sedan_rate_non_eur: null,
  minivan_capacity_min: 1, minivan_capacity_max: 5,
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
    // The van covers 8-12 by default and is exactly the right size for 10 —
    // but it has no price, so it cannot be sold.
    const r = getTransportRateForPax(CONVENTIONAL, 10)
    expect(r?.vehicleType).not.toBe('Van')
    expect(r?.vehicleType).toBe('Minibus')
  })

  it('falls back to the conventional band when the row does not say', () => {
    const r = getTransportRateForPax(CONVENTIONAL, 4)
    expect(r?.vehicleType).toBe('Minivan')
    expect(r?.capacityMin).toBe(3)
    expect(r?.capacityMax).toBe(7)
  })

  it('returns nothing when the route has no priced vehicle at all', () => {
    expect(getTransportRateForPax({ sedan_rate_eur: null, minivan_rate_eur: null }, 2)).toBeNull()
  })

  it('takes the largest vehicle they run when the group exceeds every band', () => {
    // 60 people, biggest is a 45-seat bus. Today's rule prices ONE bus, which
    // is wrong — recorded here so the behaviour is visible rather than assumed.
    const r = getTransportRateForPax(CONVENTIONAL, 60)
    expect(r?.vehicleType).toBe('Bus')
    expect(r?.capacityMax).toBe(45)
  })
})
