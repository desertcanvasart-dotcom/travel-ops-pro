// The staff tap-link page renders ONLY what toStaffView returns — the holder
// of a link is "anyone with the URL", so the projection is the security
// boundary. These pin that it exposes the assignment and nothing else, and
// that the token guard and event allowlist hold.
import { describe, it, expect } from 'vitest'
import { toStaffView, isValidStaffToken, STAFF_EVENT_KINDS } from '@/lib/staff-link'

describe('toStaffView', () => {
  const org = { name: 'A.T.S', company_name: 'ignored' }
  const itinerary = {
    trip_name: 'Cairo & Luxor', start_date: '2026-11-03', end_date: '2026-11-10',
    // fields that must NEVER cross the boundary:
    total_cost: 9999, supplier_cost: 5000, client_email: 'x@y.z', notes: 'internal',
  }
  const resource = {
    resource_name: 'Ahmed', start_date: '2026-11-03', end_date: '2026-11-05',
    cost_eur: 123, notes: 'pay cash',
  }
  const events = [
    { event_kind: 'arrived', occurred_at: '2026-11-03T09:00:00Z' },
    { event_kind: 'departed', occurred_at: '2026-11-03T08:00:00Z' },
    { event_kind: 'note', occurred_at: '2026-11-03T10:00:00Z' },     // office-internal → dropped
    { event_kind: 'teleported', occurred_at: '2026-11-03T11:00:00Z' }, // bogus → dropped
    { event_kind: 'picked_up', occurred_at: null },                    // no time → dropped
  ]

  it('exposes only the allowlisted fields', () => {
    const v = toStaffView(org, itinerary, resource, events)
    expect(v.operatorName).toBe('A.T.S')
    expect(v.tripTitle).toBe('Cairo & Luxor')
    expect(v.memberName).toBe('Ahmed')
    expect(v.assignmentStart).toBe('2026-11-03')
    // nothing sensitive leaks:
    const json = JSON.stringify(v)
    for (const leak of ['9999', '5000', 'x@y.z', 'internal', '123', 'pay cash']) {
      expect(json).not.toContain(leak)
    }
  })

  it('keeps only valid staff event kinds, newest first', () => {
    const v = toStaffView(org, itinerary, resource, events)
    expect(v.events.map(e => e.kind)).toEqual(['arrived', 'departed'])
  })

  it('falls back gracefully when fields are missing', () => {
    const v = toStaffView({}, {}, {}, [])
    expect(v.operatorName).toBe('Your agency')
    expect(v.tripTitle).toBe('Trip')
    expect(v.memberName).toBe('Team member')
    expect(v.events).toEqual([])
  })
})

describe('isValidStaffToken', () => {
  it('accepts a well-formed share token and rejects junk', () => {
    expect(isValidStaffToken('a'.repeat(32))).toBe(true)
    expect(isValidStaffToken('')).toBe(false)
    expect(isValidStaffToken('short')).toBe(false)
    expect(isValidStaffToken('has spaces and !@#')).toBe(false)
    expect(isValidStaffToken(null)).toBe(false)
  })
})

describe('STAFF_EVENT_KINDS', () => {
  it("excludes the office-internal 'note' kind", () => {
    expect(STAFF_EVENT_KINDS).not.toContain('note')
    expect(STAFF_EVENT_KINDS).toContain('picked_up')
    expect(STAFF_EVENT_KINDS.length).toBe(9)
  })
})
