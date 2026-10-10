import { describe, it, expect } from 'vitest'
import { vehicleInUseWarning } from '@/lib/vocabulary'

describe('vehicleInUseWarning', () => {
  it('is null when nothing is filed under the vehicle', () => {
    expect(vehicleInUseWarning('Minivan', { transport_rates: 0, transport_packages: 0 })).toBeNull()
  })

  it('counts the rates and packages that would be left without a vehicle', () => {
    expect(vehicleInUseWarning('Minivan', { transport_rates: 1, transport_packages: 0 })).toContain('"Minivan" is still used by 1 transport rate.')
    const both = vehicleInUseWarning('Minivan', { transport_rates: 72, transport_packages: 2 })
    expect(both).toContain('72 transport rates and 2 B2B transport packages')
    expect(both).toContain('Rename the vehicle or hide it instead')
  })
})
