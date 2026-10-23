import { describe, it, expect } from 'vitest'
import { parseRecoveryLink } from '@/lib/auth/recovery-link'

const BASE = 'https://autoura.net/reset-password'

describe('parseRecoveryLink', () => {
  it('reads the token_hash a recovery email links with', () => {
    expect(parseRecoveryLink(`${BASE}?token_hash=abc123&type=recovery`)).toEqual({
      tokenHash: 'abc123',
      error: null,
    })
  })

  it('ignores a token_hash that is not for a recovery', () => {
    expect(parseRecoveryLink(`${BASE}?token_hash=abc123&type=signup`).tokenHash).toBeNull()
  })

  it('surfaces the reason Supabase gives in the hash', () => {
    const link = parseRecoveryLink(
      `${BASE}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
    )
    expect(link).toEqual({ tokenHash: null, error: 'Email link is invalid or has expired' })
  })

  it('falls back to the error code when there is no description', () => {
    expect(parseRecoveryLink(`${BASE}?error=access_denied&error_code=otp_expired`).error).toBe('otp_expired')
  })

  it('finds nothing on a bare visit', () => {
    expect(parseRecoveryLink(BASE)).toEqual({ tokenHash: null, error: null })
  })
})
