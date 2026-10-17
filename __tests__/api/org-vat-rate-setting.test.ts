// The company's VAT rate (migration 20261214): set in Settings › Company
// Profile through PUT /api/organization/branding, which is admin-only. A rate
// that is not a percentage is refused; blank goes back to 14.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  selects: [] as string[],
  forbidden: false,
}))

const client = vi.hoisted(() => {
  function chain() {
    let mode: 'select' | 'update' = 'select'
    let payload: Record<string, unknown> = {}
    const result = () => {
      if (mode === 'update') { h.updates.push(payload); return { data: null, error: null } }
      return { data: { name: 'ATS', vat_rate: 14 }, error: null }
    }
    const b: Record<string, unknown> = {
      select: (c: string) => { h.selects.push(c); return b },
      update: (p: Record<string, unknown>) => { mode = 'update'; payload = p; return b },
      eq: () => b,
      single: async () => result(),
      then: (r: (v: unknown) => void) => r(result()),
    }
    return b
  }
  return { from: () => chain() }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => client }))
vi.mock('@/lib/auth/org-auth', () => ({ orgAuth: async () => ({ error: null, status: 200, org_id: 'org-A' }) }))
vi.mock('@/lib/auth/current-org', () => ({
  requireRole: async () => (h.forbidden ? new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403 }) : null),
}))

import { GET, PUT } from '@/app/api/organization/branding/route'

const put = (body: unknown) => PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }) as never)

beforeEach(() => {
  h.updates.length = 0
  h.selects.length = 0
  h.forbidden = false
})

describe('the company VAT rate', () => {
  it('is read with the profile', async () => {
    expect((await GET()).status).toBe(200)
    expect(h.selects[0]).toContain('vat_rate')
  })

  it('an admin sets it', async () => {
    expect((await put({ vat_rate: '10' })).status).toBe(200)
    expect(h.updates.at(-1)).toMatchObject({ vat_rate: 10 })
  })

  it('blank goes back to 14; not a percentage is refused', async () => {
    await put({ vat_rate: '' })
    expect(h.updates.at(-1)).toMatchObject({ vat_rate: 14 })
    expect((await put({ vat_rate: 140 })).status).toBe(400)
    expect((await put({ vat_rate: 'abc' })).status).toBe(400)
  })

  it('is not anyone else\'s to change', async () => {
    h.forbidden = true
    expect((await put({ vat_rate: 0 })).status).toBe(403)
    expect(h.updates).toHaveLength(0)
  })
})
