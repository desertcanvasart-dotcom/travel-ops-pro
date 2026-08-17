import { describe, it, expect } from 'vitest'
import {
  normalizeVerifyAnswer,
  verifyAnswerMatches,
  portalVerifyCookieValue,
  isPortalVerified,
} from '@/lib/booking-portal'

// The confirmation gate: one fact the traveller knows unlocks the page. These
// pin the matching rules — width/case/space insensitivity, the family-name
// token of a full client name, and that near-empty answers never match.

describe('normalizeVerifyAnswer', () => {
  it('folds width, case and whitespace', () => {
    expect(normalizeVerifyAnswer('ＢＫＧ－２０２６')).toBe('bkg-2026')
    expect(normalizeVerifyAnswer('  Yamada  ')).toBe('yamada')
    expect(normalizeVerifyAnswer('山田　太郎')).toBe('山田太郎')
  })
})

describe('verifyAnswerMatches', () => {
  const facts = {
    booking_code: 'BKG-2026-0001',
    client_name: '山田 太郎',
    lead_names: ['Yamada', '山田', 'ヤマダ'],
  }

  it('accepts the booking number in any width or case', () => {
    expect(verifyAnswerMatches('bkg-2026-0001', facts)).toBe(true)
    expect(verifyAnswerMatches('ＢＫＧ－２０２６－０００１', facts)).toBe(true)
  })

  it('accepts the family name in every script', () => {
    expect(verifyAnswerMatches('山田', facts)).toBe(true)
    expect(verifyAnswerMatches('ヤマダ', facts)).toBe(true)
    expect(verifyAnswerMatches('YAMADA', facts)).toBe(true)
  })

  it('accepts the family-name token of the client name when no lead exists', () => {
    expect(verifyAnswerMatches('山田', { client_name: '山田 太郎' })).toBe(true)
    // Romanised order: family name last.
    expect(verifyAnswerMatches('sato', { client_name: 'Hanako Sato' })).toBe(true)
  })

  it('rejects wrong, empty, and too-short answers', () => {
    expect(verifyAnswerMatches('suzuki', facts)).toBe(false)
    expect(verifyAnswerMatches('', facts)).toBe(false)
    expect(verifyAnswerMatches('山', facts)).toBe(false)
    // A single kanji surname would be a legitimate miss — the traveller can
    // always fall back to the booking number.
  })

  it('never matches when the booking has no usable facts', () => {
    expect(verifyAnswerMatches('anything', {})).toBe(false)
  })
})

describe('the cookie', () => {
  it('is stable per token and not derivable from another token', () => {
    const a = portalVerifyCookieValue('token-a-token-a-token-a-token-a-')
    const b = portalVerifyCookieValue('token-b-token-b-token-b-token-b-')
    expect(a).toBe(portalVerifyCookieValue('token-a-token-a-token-a-token-a-'))
    expect(a).not.toBe(b)
    expect(isPortalVerified('token-a-token-a-token-a-token-a-', a)).toBe(true)
    expect(isPortalVerified('token-a-token-a-token-a-token-a-', b)).toBe(false)
    expect(isPortalVerified('token-a-token-a-token-a-token-a-', undefined)).toBe(false)
  })
})
