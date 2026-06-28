import { describe, it, expect } from 'vitest'
import { determineCapacityResult, type CapacityDayDetail } from '@/lib/capacity-availability'

const day = (over: Partial<CapacityDayDetail>): CapacityDayDetail => ({
  date: '2026-07-01',
  status: 'available',
  available_slots: 3,
  ...over,
})

describe('determineCapacityResult', () => {
  it('all available → available', () => {
    const r = determineCapacityResult([day({}), day({ date: '2026-07-02' })], 2)
    expect(r.available).toBe(true)
    expect(r.status).toBe('available')
  })

  it('any blackout → unavailable (blackout wins, includes reason)', () => {
    const r = determineCapacityResult(
      [day({}), day({ date: '2026-07-02', status: 'blackout', available_slots: 0, reason: 'national holiday' })],
      2
    )
    expect(r.available).toBe(false)
    expect(r.status).toBe('blackout')
    expect(r.message).toContain('national holiday')
  })

  it('busy with not enough slots for the group → unavailable', () => {
    const r = determineCapacityResult([day({ status: 'busy', available_slots: 1 })], 3)
    expect(r.available).toBe(false)
    expect(r.status).toBe('busy')
  })

  it('busy but enough slots for the group → not blocked by busy', () => {
    const r = determineCapacityResult([day({ status: 'busy', available_slots: 5 })], 2)
    expect(r.available).toBe(true)
    expect(r.status).not.toBe('busy')
  })

  it('limited (no blackout/busy) → available but flagged limited', () => {
    const r = determineCapacityResult([day({ status: 'limited', available_slots: 1 })], 1)
    expect(r.available).toBe(true)
    expect(r.status).toBe('limited')
  })

  it('blackout takes precedence over limited', () => {
    const r = determineCapacityResult(
      [day({ status: 'limited' }), day({ date: '2026-07-02', status: 'blackout', available_slots: 0 })],
      1
    )
    expect(r.status).toBe('blackout')
  })
})
