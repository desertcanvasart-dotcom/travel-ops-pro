// The site's own security headers (next.config.ts). The microphone is allowed
// for this site only, for voice notes: microphone=() blocked recording on every
// page (autoura-saas #840). Camera and location stay off.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')

describe('Permissions-Policy', () => {
  it('lets this site, and only this site, use the microphone', () => {
    expect(config).toContain("value: 'camera=(), microphone=(self), geolocation=()'")
    expect(config).not.toMatch(/microphone=\(\)/)
    expect(config).not.toMatch(/microphone=\*/)
  })
})
