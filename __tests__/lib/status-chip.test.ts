import { describe, it, expect } from 'vitest'
import { statusChip, BOOKING_STATUS_CONFIG, PAYMENT_STATUS_CONFIG } from '@/types/bookings'

describe('statusChip', () => {
  it('returns the configured chip for a known status', () => {
    expect(statusChip('pending', BOOKING_STATUS_CONFIG)).toBe(BOOKING_STATUS_CONFIG.pending)
  })

  it('shows an unfamiliar status rather than throwing', () => {
    // Reading .bgColor off undefined is what white-screened the bookings list
    // the first time a row said 'confirmed'.
    const chip = statusChip('confirmed', BOOKING_STATUS_CONFIG)
    expect(chip.label).toBe('confirmed')
    expect(chip.bgColor).toBeTruthy()
    expect(chip.color).toBeTruthy()
  })

  it('falls back to "Unknown" when there is no status at all', () => {
    for (const value of [null, undefined, '']) {
      expect(statusChip(value, BOOKING_STATUS_CONFIG).label).toBe('Unknown')
    }
  })

  it('works the same way for payment statuses', () => {
    expect(statusChip('paid', PAYMENT_STATUS_CONFIG)).toBe(PAYMENT_STATUS_CONFIG.paid)
    expect(statusChip('refunded-ish', PAYMENT_STATUS_CONFIG).label).toBe('refunded-ish')
  })

  it('never returns a partial chip — every field a badge needs is present', () => {
    for (const chip of [statusChip('nonsense', BOOKING_STATUS_CONFIG), statusChip('ready', BOOKING_STATUS_CONFIG)]) {
      expect(Object.keys(chip)).toEqual(expect.arrayContaining(['label', 'color', 'bgColor']))
    }
  })
})
