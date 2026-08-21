// The fallback this replaces read `SERVICE_ROLE_KEY || ANON_KEY`, so a missing
// service key silently downgraded eight routes to the anonymous identity —
// invisible for as long as anon could read everything.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServiceClient, resetServiceClientForTests } from '@/lib/supabase/service-client'

const ORIGINAL = { ...process.env }

beforeEach(() => {
  resetServiceClientForTests()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  resetServiceClientForTests()
})

describe('createServiceClient', () => {
  it('throws instead of falling back to the anon key', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    // The anon key is present and would have been used by the old code.
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-key')
    expect(() => createServiceClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY is not set/)
  })

  it('says what the caller needs to know, including that there is no fallback', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => createServiceClient()).toThrow(/will not fall back to the anonymous key/)
  })

  it('throws on a missing URL too', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(() => createServiceClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL is not set/)
  })

  it('returns a client when the key is present, and memoises it', () => {
    const a = createServiceClient()
    const b = createServiceClient()
    expect(a).toBeDefined()
    expect(b).toBe(a)
  })

  it('does not read the environment at import time', async () => {
    // Module-scope validation would break `next build`, which evaluates route
    // modules during prerender with placeholder credentials.
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    await expect(import('@/lib/supabase/service-client')).resolves.toBeDefined()
  })
})
