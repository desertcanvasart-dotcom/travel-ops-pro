import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { signVerifiedUserHeader, verifyVerifiedUserHeader } from '@/lib/auth/verified-user-header'

const USER_ID = 'a1b2c3d4-0000-0000-0000-000000000000'

describe('verified-user-header — HMAC-signed internal identity header', () => {
  let savedSecret: string | undefined

  beforeEach(() => {
    savedSecret = process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-for-hmac'
  })

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedSecret
  })

  it('round-trips: verify(sign(userId)) returns the userId', async () => {
    const signed = await signVerifiedUserHeader(USER_ID)
    expect(signed).toBeTruthy()
    expect(await verifyVerifiedUserHeader(signed)).toBe(USER_ID)
  })

  it('rejects a tampered user id (spoofed identity, real signature)', async () => {
    const signed = await signVerifiedUserHeader(USER_ID)
    const sig = signed!.slice(signed!.lastIndexOf('.') + 1)
    expect(await verifyVerifiedUserHeader(`someone-else.${sig}`)).toBeNull()
  })

  it('rejects a tampered signature', async () => {
    const signed = await signVerifiedUserHeader(USER_ID)
    const flipped = signed!.slice(0, -1) + (signed!.endsWith('0') ? '1' : '0')
    expect(await verifyVerifiedUserHeader(flipped)).toBeNull()
  })

  it('rejects unsigned/malformed values a client might send', async () => {
    expect(await verifyVerifiedUserHeader(USER_ID)).toBeNull()
    expect(await verifyVerifiedUserHeader('')).toBeNull()
    expect(await verifyVerifiedUserHeader(null)).toBeNull()
    expect(await verifyVerifiedUserHeader(undefined)).toBeNull()
    expect(await verifyVerifiedUserHeader('.abcdef')).toBeNull()
  })

  it('signs differently under a different secret (no cross-env reuse)', async () => {
    const signed = await signVerifiedUserHeader(USER_ID)
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'a-different-secret'
    expect(await verifyVerifiedUserHeader(signed)).toBeNull()
  })

  it('refuses to sign or verify without the secret configured', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(await signVerifiedUserHeader(USER_ID)).toBeNull()
    expect(await verifyVerifiedUserHeader(`${USER_ID}.deadbeef`)).toBeNull()
  })
})
