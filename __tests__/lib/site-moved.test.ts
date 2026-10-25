// SITE_MOVED_TO: an install that moved forwards every request to the same
// path on the new origin (lib/http/site-moved), before the middleware does
// anything else.
import { describe, it, expect, vi } from 'vitest'
import { siteMovedRedirect } from '@/lib/http/site-moved'

describe('siteMovedRedirect', () => {
  const to = 'https://system.ats-hj.com'
  it('same path and query on the new origin', () => {
    expect(siteMovedRedirect('/portal/abc123', '?lang=ja', to)).toBe('https://system.ats-hj.com/portal/abc123?lang=ja')
    expect(siteMovedRedirect('/api/whatsapp/webhook', '', to)).toBe('https://system.ats-hj.com/api/whatsapp/webhook')
  })
  it('not moved, /api/version, or a value that is not an http(s) origin: nothing', () => {
    expect(siteMovedRedirect('/dashboard', '', undefined)).toBeNull()
    expect(siteMovedRedirect('/dashboard', '', '')).toBeNull()
    expect(siteMovedRedirect('/api/version', '', to)).toBeNull()
    expect(siteMovedRedirect('/x', '', 'not a url')).toBeNull()
    expect(siteMovedRedirect('/x', '', 'javascript:alert(1)')).toBeNull()
  })
  it('ignores any path on the configured value — origin only', () => {
    expect(siteMovedRedirect('/a', '', 'https://system.ats-hj.com/somewhere/')).toBe('https://system.ats-hj.com/a')
  })
})

describe('the middleware forwards before anything else', () => {
  it('a portal link on the old address is a 308 to the new one, without touching Supabase', async () => {
    vi.resetModules()
    const supabaseCalled = vi.fn()
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => { supabaseCalled(); return {} } }))
    vi.doMock('@/lib/activity-log', () => ({ recordActivity: async () => {} }))
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
    vi.stubEnv('SITE_MOVED_TO', 'https://system.ats-hj.com')
    const { middleware } = await import('@/middleware')
    const { NextRequest } = await import('next/server')
    const res = await middleware(new NextRequest('https://autoura.net/portal/tok?x=1', { method: 'POST' }), { waitUntil: () => {} } as never)
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('https://system.ats-hj.com/portal/tok?x=1')
    expect(supabaseCalled).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
