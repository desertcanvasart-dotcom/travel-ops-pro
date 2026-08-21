// `state` carries the user id through an OAuth round trip. Before it was
// signed, an attacker could complete a flow carrying a victim's id and have
// tokens written to that account. The signature is the only thing preventing
// that — so an empty signing key, which the module used to fall back to,
// silently restores the original vulnerability: HMAC with a key anyone can
// guess is a signature anyone can produce.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { signState, verifyState, resetStateSecretForTests } from '@/lib/oauth-state'
import crypto from 'crypto'

const ORIGINAL = { ...process.env }

beforeEach(() => {
  resetStateSecretForTests()
  process.env.OAUTH_STATE_SECRET = 'a-real-secret-with-entropy'
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  resetStateSecretForTests()
})

describe('oauth state signing', () => {
  it('round-trips a payload', () => {
    const state = signState('user-123')
    expect(verifyState(state)).toBe('user-123')
  })

  it('rejects a tampered user id', () => {
    const state = signState('user-123')
    const forged = state.replace('user-123', 'victim-456')
    expect(verifyState(forged)).toBeNull()
  })

  it('rejects a signature made with a different key', () => {
    const payload = 'user-123'
    const sig = crypto.createHmac('sha256', 'attacker-key').update(payload).digest('base64url')
    expect(verifyState(`${payload}.${sig}`)).toBeNull()
  })

  it('falls back to the service-role key when no dedicated secret is set', () => {
    delete process.env.OAUTH_STATE_SECRET
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-with-entropy'
    resetStateSecretForTests()
    expect(verifyState(signState('user-123'))).toBe('user-123')
  })

  it('REFUSES to sign when no secret is configured', () => {
    delete process.env.OAUTH_STATE_SECRET
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    resetStateSecretForTests()
    expect(() => signState('user-123')).toThrow(/Refusing to sign with an empty key/)
  })

  it('would have accepted a forgery under the old empty-key fallback', () => {
    // The regression this fixes, stated as an attack: with HMAC('') the
    // attacker computes a valid signature for any payload they like.
    delete process.env.OAUTH_STATE_SECRET
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    resetStateSecretForTests()
    const forgedSig = crypto.createHmac('sha256', '').update('victim-456').digest('base64url')
    expect(verifyState(`victim-456.${forgedSig}`)).toBeNull()
  })

  it('verification fails closed on a missing secret rather than throwing', () => {
    // A callback should read as "invalid state", not 500 with config details.
    delete process.env.OAUTH_STATE_SECRET
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    resetStateSecretForTests()
    expect(() => verifyState('anything.signed')).not.toThrow()
    expect(verifyState('anything.signed')).toBeNull()
  })

  it('does not read the environment at import time', async () => {
    delete process.env.OAUTH_STATE_SECRET
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    await expect(import('@/lib/oauth-state')).resolves.toBeDefined()
  })
})
