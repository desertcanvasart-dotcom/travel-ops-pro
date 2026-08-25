import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { encryptToken, decryptToken, isEncrypted, resetTokenKeyForTests } from '@/lib/crypto/token-cipher'
import { encryptTokenFields, decryptTokenFields } from '@/lib/oauth/token-store'

beforeAll(() => {
  // A deterministic 32-byte key for the suite (base64 of 32 'A' bytes region).
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  resetTokenKeyForTests()
})

describe('token-cipher', () => {
  it('round-trips a token', () => {
    const t = 'ya29.a0-secret-refresh-token'
    const enc = encryptToken(t)!
    expect(isEncrypted(enc)).toBe(true)
    expect(decryptToken(enc)).toBe(t)
  })

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'))
  })

  it('passes legacy plaintext through unchanged (no migration needed)', () => {
    expect(decryptToken('legacy-plaintext-token')).toBe('legacy-plaintext-token')
    expect(isEncrypted('legacy-plaintext-token')).toBe(false)
  })

  it('handles null / empty', () => {
    expect(encryptToken(null)).toBeNull()
    expect(decryptToken(null)).toBeNull()
    expect(encryptToken('')).toBe('')
  })

  it('throws on a tampered envelope', () => {
    const enc = encryptToken('x')!
    const tampered = enc.slice(0, -4) + 'AAAA'
    expect(() => decryptToken(tampered)).toThrow()
  })
})

describe('token-store field helpers', () => {
  it('encrypts then decrypts the token fields of a row, leaving metadata alone', () => {
    const row = { access_token: 'AT', refresh_token: 'RT', email: 'a@b.com', provider: 'xero' }
    const enc = encryptTokenFields(row)
    expect(isEncrypted(enc.access_token)).toBe(true)
    expect(isEncrypted(enc.refresh_token)).toBe(true)
    expect(enc.email).toBe('a@b.com')
    expect(enc.provider).toBe('xero')
    const dec = decryptTokenFields(enc)!
    expect(dec.access_token).toBe('AT')
    expect(dec.refresh_token).toBe('RT')
  })

  it('decryptTokenFields tolerates a null row', () => {
    expect(decryptTokenFields(null)).toBeNull()
  })
})

describe('the OAuth callbacks and readers go through the cipher', () => {
  const files = [
    'app/api/auth/google/callback/route.ts',
    'app/api/auth/accounting/callback/route.ts',
    'lib/gmail.ts',
    'app/api/gmail/labels/route.ts',
    'app/api/gmail/attachments/route.ts',
    'lib/accounting/sync-service.ts',
  ]
  it.each(files)('%s imports the token cipher', file => {
    const src = readFileSync(join(process.cwd(), file), 'utf8')
    expect(src).toMatch(/from '@\/lib\/crypto\/token-cipher'/)
  })

  it('the callbacks never write a raw token column', () => {
    for (const f of ['app/api/auth/google/callback/route.ts', 'app/api/auth/accounting/callback/route.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, `${f} writes access_token without encryptToken`).not.toMatch(/access_token:\s*tokens\.access_token\b/)
      expect(src).toMatch(/access_token:\s*encryptToken\(/)
    }
  })
})
