import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalRedirectOrigin } from '@/lib/http/canonical-host'

describe('www goes to the app’s own address', () => {
  const app = 'https://autoura.net'
  it('redirects only www.<app host>', () => {
    expect(canonicalRedirectOrigin('www.autoura.net', app)).toBe('https://autoura.net')
    expect(canonicalRedirectOrigin('WWW.Autoura.net', app)).toBe('https://autoura.net')
    expect(canonicalRedirectOrigin('www.autoura.net, proxy.internal', app)).toBe('https://autoura.net')
    expect(canonicalRedirectOrigin('autoura.net', app)).toBeNull()
    expect(canonicalRedirectOrigin('travel-ops.up.railway.app', app)).toBeNull()
    expect(canonicalRedirectOrigin('localhost:3000', app)).toBeNull()
    expect(canonicalRedirectOrigin('www.autoura.net', undefined)).toBeNull()
    // An app that lives on www is never redirected away from it.
    expect(canonicalRedirectOrigin('www.autoura.net', 'https://www.autoura.net')).toBeNull()
  })
  it('the middleware applies it first, with a method-preserving 308', () => {
    const mw = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8')
    const start = mw.indexOf('export async function middleware')
    expect(mw.slice(start, start + 1200)).toContain('canonicalRedirectOrigin(')
    expect(mw).toContain(', canonical), 308)')
  })
})
