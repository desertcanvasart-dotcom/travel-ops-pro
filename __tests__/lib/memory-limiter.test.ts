import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rateLimit, resetRateLimiterForTests } from '@/lib/rate-limit/memory-limiter'

beforeEach(() => resetRateLimiterForTests())

describe('rateLimit (fixed window)', () => {
  it('allows up to the limit, then blocks', () => {
    const t0 = 1_000_000
    for (let i = 0; i < 3; i++) {
      expect(rateLimit('u1', 3, 60_000, t0).allowed).toBe(true)
    }
    const blocked = rateLimit('u1', 3, 60_000, t0)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('resets after the window passes', () => {
    const t0 = 2_000_000
    rateLimit('u2', 1, 60_000, t0)
    expect(rateLimit('u2', 1, 60_000, t0).allowed).toBe(false)
    // window elapsed
    expect(rateLimit('u2', 1, 60_000, t0 + 60_001).allowed).toBe(true)
  })

  it('tracks keys independently', () => {
    const t0 = 3_000_000
    rateLimit('a', 1, 60_000, t0)
    expect(rateLimit('a', 1, 60_000, t0).allowed).toBe(false)
    expect(rateLimit('b', 1, 60_000, t0).allowed).toBe(true)
  })

  it('reports remaining correctly', () => {
    const t0 = 4_000_000
    expect(rateLimit('c', 5, 60_000, t0).remaining).toBe(4)
    expect(rateLimit('c', 5, 60_000, t0).remaining).toBe(3)
  })
})

describe('the AI endpoints are rate-limited', () => {
  const files = [
    'app/api/ai/suggest-reply/route.ts',
    'app/api/ai/suggest-reply/[draftId]/route.ts',
    'app/api/ai/suggest-email-reply/route.ts',
  ]
  it.each(files)('%s guards with guardAiRate before doing work', file => {
    const src = readFileSync(join(process.cwd(), file), 'utf8')
    expect(src).toContain('guardAiRate()')
    // guard must be near the top of the handler, before generateReplyOptions.
    expect(src.indexOf('guardAiRate()')).toBeLessThan(src.indexOf('await generateReplyOptions('))
  })
})
