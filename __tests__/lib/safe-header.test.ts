import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { headerSafe, safeEmailAddress } from '@/lib/http/safe-header'

const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)

describe('headerSafe / safeEmailAddress', () => {
  it('strips CR/LF so a value cannot inject a second header', () => {
    const out = headerSafe(`Hello${CR}${LF}Bcc: attacker@evil.com`)
    expect(out).not.toContain(CR)
    expect(out).not.toContain(LF)
  })

  it('strips other control characters', () => {
    const withControls = `a${String.fromCharCode(9)}b${String.fromCharCode(0)}c`
    const out = headerSafe(withControls)
    expect(out).not.toMatch(/[\x00-\x1F\x7F]/)
  })

  it('leaves an ordinary subject untouched', () => {
    expect(headerSafe('Your quote is ready')).toBe('Your quote is ready')
  })

  it('a header-injection email payload cannot smuggle a newline', () => {
    const out = safeEmailAddress(`ok@x.com${CR}${LF}Bcc: e@evil.com`)
    expect(out).not.toContain(CR)
    expect(out).not.toContain(LF)
  })

  it('rejects a non-address to an empty string', () => {
    expect(safeEmailAddress('not-an-address')).toBe('')
    expect(safeEmailAddress(null)).toBe('')
  })
})

describe('gmail.ts uses no shared mutable OAuth client', () => {
  const src = readFileSync(join(process.cwd(), 'lib/gmail.ts'), 'utf8')

  it('constructs a fresh client per call instead of a module singleton', () => {
    // The module-level singleton every function reconfigured is gone.
    expect(src).not.toMatch(/^const oauth2Client\s*=/m)
    expect(src).toContain('function newOAuthClient()')
    // No call sets credentials on a shared module-scope client.
    expect(src).not.toMatch(/oauth2Client\.setCredentials/)
  })
})
