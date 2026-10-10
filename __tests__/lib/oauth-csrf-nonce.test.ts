import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { newNonce, nonceMatches, OAUTH_NONCE_COOKIE } from '@/lib/oauth/csrf-nonce'
import type { NextRequest } from 'next/server'

// Minimal request stub exposing only what nonceMatches reads.
function req(cookieValue?: string): NextRequest {
  return {
    cookies: { get: (name: string) => (name === OAUTH_NONCE_COOKIE && cookieValue ? { value: cookieValue } : undefined) },
  } as unknown as NextRequest
}

describe('oauth csrf nonce', () => {
  it('mints distinct nonces', () => {
    expect(newNonce()).not.toBe(newNonce())
  })

  it('matches only when the state nonce equals the cookie', () => {
    const n = newNonce()
    expect(nonceMatches(req(n), n)).toBe(true)
    expect(nonceMatches(req(n), newNonce())).toBe(false)
  })

  it('fails closed when the cookie is absent (attacker cannot set the victim cookie)', () => {
    const n = newNonce()
    expect(nonceMatches(req(undefined), n)).toBe(false)
  })

  it('fails closed when the state carries no nonce', () => {
    expect(nonceMatches(req('cookie-nonce'), undefined)).toBe(false)
    expect(nonceMatches(req('cookie-nonce'), '')).toBe(false)
  })
})

describe('connect + callback routes are wired to the nonce', () => {
  const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

  it('both connect routes set the nonce cookie and embed it in the state', () => {
    for (const f of ['app/api/gmail/connect/route.ts', 'app/api/auth/accounting/connect/route.ts']) {
      const s = src(f)
      expect(s, `${f} does not set the nonce cookie`).toContain('setNonceCookie(')
      expect(s, `${f} does not embed the nonce in the state`).toMatch(/newNonce\(\)/)
    }
  })

  it('both callbacks verify the nonce against the cookie', () => {
    for (const f of ['app/api/auth/google/callback/route.ts', 'app/api/auth/accounting/callback/route.ts']) {
      const s = src(f)
      expect(s, `${f} does not verify the nonce`).toContain('nonceMatches(request')
    }
  })
})

describe('Gmail connect from the wrong address', () => {
  it('names the address Google returns to when the page is elsewhere', async () => {
    const { wrongAddressFor } = await import('@/lib/oauth/redirect-address')
    const back = 'https://autoura.net/api/auth/google/callback'
    expect(wrongAddressFor('https://www.autoura.net', back)).toBe('https://autoura.net')
    expect(wrongAddressFor('https://travel-ops.up.railway.app', back)).toBe('https://autoura.net')
    expect(wrongAddressFor('https://AUTOURA.net', back)).toBeNull()
    expect(wrongAddressFor(null, back)).toBeNull()
    expect(wrongAddressFor('https://autoura.net', undefined)).toBeNull()
  })
})
