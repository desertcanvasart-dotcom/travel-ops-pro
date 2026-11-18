// A duplicate transport rate is refused with a message that NAMES the rate
// that exists, and an edit may not turn one rate into a copy of another
// (lib/rates/transport-natural-key.ts). Ported from autoura-saas #837.
import { describe, it, expect } from 'vitest'
import { duplicateTransportRateMessage, editMakesDuplicate } from '@/lib/rates/transport-natural-key'

describe('duplicateTransportRateMessage', () => {
  it('names the code, the route, the supplier and the validity', () => {
    expect(duplicateTransportRateMessage({
      service_code: 'LXR-DAY', route_name: 'West Bank day tour', supplier_name: 'Nile Cars',
      rate_valid_from: '2026-11-01T00:00:00Z', rate_valid_to: '2027-10-31',
    })).toMatch(/^This rate already exists: LXR-DAY · West Bank day tour, from Nile Cars, valid 2026-11-01 to 2027-10-31\. Edit that rate instead/)
  })
  it('a road rate with no name reads from → to; no supplier is direct booking; no dates, no validity', () => {
    expect(duplicateTransportRateMessage({ service_code: 'CAI-ALX', origin_city: 'Cairo', destination_city: 'Alexandria' }))
      .toMatch(/^This rate already exists: CAI-ALX · Cairo → Alexandria, from no supplier \(direct booking\)\. /)
  })
  it('falls back to the city', () => {
    expect(duplicateTransportRateMessage({ city: 'Aswan' })).toMatch(/^This rate already exists: Aswan, from /)
  })
})

describe('editMakesDuplicate', () => {
  const base = { service_type: 'day_tour', city: 'Luxor', supplier_id: 's1', rate_valid_from: '2026-01-01', rate_valid_to: '2099-12-31' }
  const other = { id: 'b', ...base, supplier_id: 's2' }
  it('an edit onto another rate is a duplicate', () => {
    expect(editMakesDuplicate({ id: 'a', ...base }, { id: 'a', ...base, supplier_id: 's2' }, [other])).toBe(other)
  })
  it('an edit that keeps the identity never is, even beside an existing copy', () => {
    const copy = { id: 'c', ...base }
    expect(editMakesDuplicate({ id: 'a', ...base }, { id: 'a', ...base, notes: 'new price' }, [copy])).toBeNull()
  })
  it('the rate is not its own duplicate', () => {
    expect(editMakesDuplicate({ id: 'a', ...base }, { id: 'a', ...base, city: 'Aswan' }, [{ id: 'a', ...base, city: 'Aswan' }])).toBeNull()
  })
})
