// Two-factor login, enforced where every page and API request passes: the
// middleware (lib/auth/two-factor.ts). Runs the real middleware with the
// Supabase session and the service-role reads stubbed.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const S = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; factors?: Array<{ id: string; status: string }> },
  aal: 'aal1' as string,
  role: 'manager' as string | null,
  requires: false,
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: S.user } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: S.aal, nextLevel: 'aal2' } }) },
    },
  }),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const rows = table === 'organization_members'
        ? (S.role ? [{ org_id: 'org-1', role: S.role, created_at: '2026-01-01' }] : [])
        : table === 'organizations' ? [{ require_two_factor: S.requires }]
          : table === 'user_profiles' ? [{ is_active: true }] : []
      const q: any = {
        select: () => q, eq: () => q, order: () => q, in: () => q,
        single: async () => ({ data: rows[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (r: any) => r({ data: rows, error: null }),
      }
      return q
    },
  }),
}))
vi.mock('@/lib/activity-log', () => ({ recordActivity: async () => {} }))
vi.mock('@/lib/auth/verified-user-header', () => ({ VERIFIED_USER_HEADER: 'x-verified-user', signVerifiedUserHeader: async () => null }))

import { middleware } from '@/middleware'

const run = (path: string, method = 'GET') =>
  middleware(new NextRequest(new URL(path, 'https://autoura.net'), { method }), { waitUntil: () => {} } as never)
const withDevice = { id: 'u1', email: 'm@ats.jp', factors: [{ id: 'f1', status: 'verified' }] }
const noDevice = { id: 'u1', email: 'm@ats.jp', factors: [] }

beforeEach(() => { S.user = null; S.aal = 'aal1'; S.role = 'manager'; S.requires = false })

describe('someone with an authenticator', () => {
  it('after the password only (aal1): pages go to the code screen, keeping where they were going', async () => {
    S.user = withDevice
    const res = await run('/bookings?tab=open')
    expect(res.status).toBe(307)
    const to = new URL(res.headers.get('location')!)
    expect(to.pathname).toBe('/two-factor')
    expect(to.searchParams.get('next')).toBe('/bookings?tab=open')
  })

  it('…and every API refuses with two_factor_required — any role, the company switch off', async () => {
    S.user = withDevice; S.role = 'agent'
    const res = await run('/api/clients')
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'two_factor_required' })
  })

  it('after the code (aal2) everything answers', async () => {
    S.user = withDevice; S.aal = 'aal2'
    expect((await run('/bookings')).status).toBe(200)
    expect((await run('/api/clients')).status).toBe(200)
  })

  it('the two-factor screens themselves, public pages and self-authenticating APIs stay open', async () => {
    S.user = withDevice
    expect((await run('/two-factor')).status).toBe(200)
    expect((await run('/two-factor/setup')).status).toBe(200)
    expect((await run('/guide')).status).toBe(200)
    expect((await run('/api/version')).status).toBe(200)
  })
})

describe('the company requires two-factor', () => {
  it('a manager with no authenticator is sent to set one up; their API calls are refused', async () => {
    S.user = noDevice; S.requires = true
    const page = await run('/dashboard')
    expect(new URL(page.headers.get('location')!).pathname).toBe('/two-factor/setup')
    const api = await run('/api/clients')
    expect(api.status).toBe(403)
    expect(await api.json()).toMatchObject({ code: 'two_factor_setup_required' })
  })

  it('owners and administrators too; agents and viewers are not asked', async () => {
    S.user = noDevice; S.requires = true
    for (const role of ['owner', 'admin']) {
      S.role = role
      expect((await run('/dashboard')).headers.get('location')).toContain('/two-factor/setup')
    }
    for (const role of ['agent', 'viewer']) {
      S.role = role
      expect((await run('/dashboard')).status).toBe(200)
    }
  })

  it('switch off: no authenticator, no question', async () => {
    S.user = noDevice
    expect((await run('/dashboard')).status).toBe(200)
  })
})

describe('signed out', () => {
  it('the code screen sends you to log in like any other page', async () => {
    const res = await run('/two-factor')
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
  })
})
