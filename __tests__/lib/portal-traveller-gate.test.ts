// A friends-mode link unlocks ONE traveller's passport, so its gate demands
// that person's family name AND date of birth — both. A forwarded link is
// useless without the DOB. Pins verifyTravellerAnswer + normalizeDob.
import { describe, it, expect } from 'vitest'
import { verifyTravellerAnswer, normalizeDob, verifyAnswerMatches } from '@/lib/booking-portal'

const PAX = { names: ['Tanaka', '田中', 'たなか'], date_of_birth: '1990-04-05' }

describe('verifyTravellerAnswer (name + DOB)', () => {
  it('passes with the right family name and DOB', () => {
    expect(verifyTravellerAnswer('Tanaka', '1990-04-05', PAX)).toBe(true)
    expect(verifyTravellerAnswer('田中', '1990-04-05', PAX)).toBe(true)
  })
  it('fails with the right name but wrong DOB — the whole point', () => {
    expect(verifyTravellerAnswer('Tanaka', '1990-04-06', PAX)).toBe(false)
  })
  it('fails with the right DOB but wrong name', () => {
    expect(verifyTravellerAnswer('Yamada', '1990-04-05', PAX)).toBe(false)
  })
  it('fails closed when the traveller has no DOB on file', () => {
    expect(verifyTravellerAnswer('Tanaka', '1990-04-05', { ...PAX, date_of_birth: null })).toBe(false)
  })
  it('requires a DOB answer — name alone never passes a private link', () => {
    expect(verifyTravellerAnswer('Tanaka', '', PAX)).toBe(false)
  })
  it('normalizes width/case/space like the booking gate', () => {
    expect(verifyTravellerAnswer('  ＴＡＮＡＫＡ ', '1990-04-05', PAX)).toBe(true)
  })
})

describe('normalizeDob', () => {
  it('accepts the date-input format', () => { expect(normalizeDob('1990-04-05')).toBe('1990-04-05') })
  it('accepts slash and dot forms, zero-padding', () => {
    expect(normalizeDob('1990/4/5')).toBe('1990-04-05')
    expect(normalizeDob('1990.04.05')).toBe('1990-04-05')
  })
  it('rejects junk', () => { expect(normalizeDob('yesterday')).toBe(''); expect(normalizeDob('')).toBe('') })
})

describe('booking-level gate unchanged', () => {
  it('still accepts the lead family name or booking code', () => {
    expect(verifyAnswerMatches('山田', { lead_names: ['山田'] })).toBe(true)
    expect(verifyAnswerMatches('BKG-2026-0001', { booking_code: 'BKG-2026-0001' })).toBe(true)
  })
})
