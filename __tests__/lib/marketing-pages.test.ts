// MARKETING_PAGES=off: a company's own install sends Autoura's home and product
// pages to /login (lib/http/marketing-pages), and keeps every page the
// company's own staff and customers use.
import { describe, it, expect, vi } from 'vitest'
import { marketingPageRedirect, marketingPagesOff } from '@/lib/http/marketing-pages'

describe('marketingPageRedirect', () => {
  it('unset or anything but off: nothing is hidden (autoura.net)', () => {
    for (const setting of [undefined, '', 'on', 'false']) {
      expect(marketingPageRedirect('/', setting)).toBeNull()
      expect(marketingPageRedirect('/about', setting)).toBeNull()
    }
  })
  it('off: the home page and each product page go to /login', () => {
    for (const p of ['/', '/about', '/integrations', '/blog', '/blog/some-post', '/contact', '/signup', '/terms', '/privacy']) {
      expect(marketingPageRedirect(p, 'off')).toBe('/login')
    }
    expect(marketingPagesOff(' OFF ')).toBe(true)
  })
  it('off: the company\'s own pages keep working', () => {
    for (const p of ['/login', '/dashboard', '/order', '/portal/tok', '/share/tok', '/survey/tok', '/staff/tok', '/guide/ja.html', '/docs', '/api/version', '/blogs', '/about-us']) {
      expect(marketingPageRedirect(p, 'off')).toBeNull()
    }
  })
})

describe('the middleware hides them before touching Supabase', () => {
  it('the home page on an install is a 307 to /login', async () => {
    vi.resetModules()
    const supabaseCalled = vi.fn()
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => { supabaseCalled(); return {} } }))
    vi.doMock('@/lib/activity-log', () => ({ recordActivity: async () => {} }))
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
    vi.stubEnv('MARKETING_PAGES', 'off')
    const { middleware } = await import('@/middleware')
    const { NextRequest } = await import('next/server')
    const res = await middleware(new NextRequest('https://system.ats-hj.com/'), { waitUntil: () => {} } as never)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://system.ats-hj.com/login')
    expect(supabaseCalled).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
