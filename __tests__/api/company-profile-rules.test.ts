// Settings audit (2026-10-14): Company Profile (PUT/POST /api/organization/branding).
//   - finding 9: the billing and rate currencies stored any string, and the
//     billing currency is what colleagues without a preference inherit;
//   - an SVG logo went into the PUBLIC documents bucket, where an SVG opened
//     by its URL runs script — refused now;
//   - finding 13: renaming is the owner's on the Organization page, but any
//     admin could rename through this form. A CHANGED name now needs the owner.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseProfileCurrency, renameNeedsOwner, LOGO_TYPES } from '@/lib/settings/company-profile'

const h = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  uploads: [] as string[],
  role: 'admin',
}))

const client = vi.hoisted(() => {
  function chain() {
    let mode: 'select' | 'update' = 'select'
    let payload: Record<string, unknown> = {}
    const result = () => {
      if (mode === 'update') { h.updates.push(payload); return { data: null, error: null } }
      return { data: { name: 'ATS' }, error: null }
    }
    const b: Record<string, unknown> = {
      select: () => b,
      update: (p: Record<string, unknown>) => { mode = 'update'; payload = p; return b },
      eq: () => b,
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (r: (v: unknown) => void) => r(result()),
    }
    return b
  }
  return {
    from: () => chain(),
    storage: {
      from: () => ({
        upload: async (path: string) => { h.uploads.push(path); return { error: null } },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }),
      }),
    },
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => client }))
vi.mock('@/lib/auth/org-auth', () => ({ orgAuth: async () => ({ error: null, status: 200, org_id: 'org-A' }) }))
vi.mock('@/lib/auth/current-org', () => ({
  requireRole: async (allowed: string[]) =>
    h.role === 'owner' || allowed.includes(h.role) ? null : new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
  getCurrentUserRole: async () => h.role,
}))

import { PUT, POST } from '@/app/api/organization/branding/route'

const put = (body: unknown) => PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }) as never)
const upload = (type: string) => {
  const form = new FormData()
  form.append('logo', new File(['<svg onload="alert(1)"/>'], 'logo', { type }))
  return POST(new Request('http://x', { method: 'POST', body: form }) as never)
}

beforeEach(() => {
  h.updates.length = 0
  h.uploads.length = 0
  h.role = 'admin'
})

describe('profile currencies', () => {
  it('one of the five codes, upper-cased; blank clears; anything else is refused', () => {
    expect(parseProfileCurrency('jpy')).toEqual({ ok: true, value: 'JPY' })
    expect(parseProfileCurrency('')).toEqual({ ok: true, value: null })
    expect(parseProfileCurrency(null)).toEqual({ ok: true, value: null })
    expect(parseProfileCurrency('XYZ')).toEqual({ ok: false })
    expect(parseProfileCurrency(12)).toEqual({ ok: false })
  })

  it('PUT {default_currency: "XYZ"} or {rate_currency: "BTC"} is 400 and nothing is stored', async () => {
    expect((await put({ default_currency: 'XYZ' })).status).toBe(400)
    expect((await put({ rate_currency: 'BTC' })).status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it('a valid pair is stored normalised', async () => {
    expect((await put({ default_currency: 'jpy', rate_currency: 'USD' })).status).toBe(200)
    expect(h.updates.at(-1)).toMatchObject({ default_currency: 'JPY', rate_currency: 'USD' })
  })
})

describe('the company name', () => {
  it('only a changed name needs the owner', () => {
    expect(renameNeedsOwner('ATS', 'ATS')).toBe(false)
    expect(renameNeedsOwner('ATS', ' ATS ')).toBe(false)
    expect(renameNeedsOwner('ATS', 'A.T.S')).toBe(true)
    expect(renameNeedsOwner('ATS', '')).toBe(false)
  })

  it('an admin saving the profile with the same name is fine; renaming is refused', async () => {
    expect((await put({ name: 'ATS', tagline: 'Hello' })).status).toBe(200)
    expect((await put({ name: 'Renamed Co' })).status).toBe(403)
    expect(h.updates).toHaveLength(1)
  })

  it('the owner renames', async () => {
    h.role = 'owner'
    expect((await put({ name: 'Renamed Co' })).status).toBe(200)
    expect(h.updates.at(-1)).toMatchObject({ name: 'Renamed Co' })
  })

  it('a manager saves nothing', async () => {
    h.role = 'manager'
    expect((await put({ tagline: 'x' })).status).toBe(403)
  })
})

describe('the logo', () => {
  it('SVG is refused; PNG, JPEG and WebP are accepted', async () => {
    expect(Object.keys(LOGO_TYPES)).not.toContain('image/svg+xml')
    const svg = await upload('image/svg+xml')
    expect(svg.status).toBe(400)
    expect(h.uploads).toHaveLength(0)
    expect((await upload('image/png')).status).toBe(200)
    expect(h.uploads).toEqual(['org-logos/org-A.png'])
  })
})
