// Settings audit (2026-10-14), finding 6 and the currency check: saving
// Preferences wrote the company's margin back as the person's own (GET shows
// the company's figure to someone with none), so changing only the currency
// froze today's company margin onto them. And any currency string was stored.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { marginToStore } from '@/lib/settings/preferences'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, userId: 'u1' as string | null }))
function client() {
  return {
    ...createMockClient(),
    auth: { getUser: async () => ({ data: { user: ctx.userId ? { id: ctx.userId } : null }, error: null }) },
  }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => client() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }), headers: async () => new Headers() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})

import { GET, PUT } from '@/app/api/user-preferences/route'

let T: Record<string, Record<string, unknown>[]>
const put = (body: unknown) => PUT(new NextRequest('http://x/api/user-preferences', { method: 'PUT', body: JSON.stringify(body) }))
const get = async () => (await (await GET(new NextRequest('http://x/api/user-preferences'))).json()).data

beforeEach(() => {
  ctx.orgId = 'org-a'
  T = {
    organizations: [{ id: 'org-a', default_currency: 'JPY', default_margin_percent: 20 }],
    user_preferences: [{ id: 'p1', user_id: 'u1', org_id: 'org-a', default_tier: 'standard', default_margin_percent: null, default_currency: 'JPY' }],
  }
  setMockTables(T)
})

describe('what a save does to the margin', () => {
  it('follow the company → null; a margin sent → that margin; neither → not written', () => {
    expect(marginToStore({ margin_follows_company: true, default_margin_percent: 20 })).toEqual({ write: true, value: null })
    expect(marginToStore({ margin_follows_company: false, default_margin_percent: 30 })).toEqual({ write: true, value: 30 })
    expect(marginToStore({ default_margin_percent: 250 })).toEqual({ write: true, value: null })
    expect(marginToStore({ default_currency: 'EUR' })).toEqual({ write: false })
  })
})

describe('Preferences save (PUT /api/user-preferences)', () => {
  it('GET says the margin shown is the company\'s', async () => {
    expect(await get()).toMatchObject({ default_margin_percent: 20, margin_follows_company: true })
  })

  it('saving only a new currency, as the page does, leaves the margin null — the company\'s changes keep reaching them', async () => {
    const shown = await get()
    // The page sends back what GET gave it, with the new currency.
    expect((await put({ ...shown, default_currency: 'EUR' })).status).toBe(200)
    const row = T.user_preferences.find(r => r.id === 'p1')!
    expect(row.default_margin_percent).toBeNull()
    expect(row.default_currency).toBe('EUR')
    // The company raises its margin: the person sees the new figure.
    T.organizations[0].default_margin_percent = 28
    expect(await get()).toMatchObject({ default_margin_percent: 28, margin_follows_company: true })
  })

  it('moving the slider stores a margin of their own', async () => {
    await put({ default_margin_percent: 35, margin_follows_company: false, default_currency: 'JPY' })
    expect(T.user_preferences.find(r => r.id === 'p1')!.default_margin_percent).toBe(35)
    expect(await get()).toMatchObject({ default_margin_percent: 35, margin_follows_company: false })
  })

  it('a currency that is not one of the five is refused', async () => {
    const res = await put({ default_currency: 'XYZ' })
    expect(res.status).toBe(400)
    expect(T.user_preferences.find(r => r.id === 'p1')!.default_currency).toBe('JPY')
  })
})
