// Rates › Extras: a change (PUT) is checked like a new extra (POST). PUT
// checked nothing: a bad unit came back as a bare 500 from the database's
// CHECK, and a negative or non-numeric cost or price was saved.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return { getCurrentOrgId: async () => 'org-1', noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }) }
})

import { PUT } from '@/app/api/extras-catalogue/[id]/route'
import { POST } from '@/app/api/extras-catalogue/route'
import { extraInputError } from '@/app/api/extras-catalogue/validate'

const put = (body: Record<string, unknown>) =>
  PUT(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'x1' }) })
const row = async () => ((await createMockClient().from('extras_catalogue').select('*')).data as any[])[0]

beforeEach(() => setMockTables({
  extras_catalogue: [{ id: 'x1', org_id: 'org-1', name: 'Fast track', unit: 'per_person', supplier_cost: 10, selling_price: 15, is_active: true }],
}))

describe('PUT /api/extras-catalogue/[id]', () => {
  it('refuses an unknown unit with a plain message, and changes nothing', async () => {
    const res = await put({ unit: 'per_day' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Unit must be per_person or per_booking')
    expect((await row()).unit).toBe('per_person')
  })

  it('refuses a negative or non-numeric cost or price', async () => {
    expect((await put({ supplier_cost: -5 })).status).toBe(400)
    expect((await put({ selling_price: 'abc' })).status).toBe(400)
    expect((await row()).supplier_cost).toBe(10)
  })

  it('a blank price is "no price", not an error; a valid change saves', async () => {
    const res = await put({ selling_price: '', unit: 'per_booking' })
    expect(res.status).toBe(200)
    expect(await row()).toMatchObject({ selling_price: null, unit: 'per_booking' })
  })
})

describe('POST /api/extras-catalogue', () => {
  it('applies the same checks', async () => {
    const res = await POST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ name: 'Porter', selling_price: -1 }) }))
    expect(res.status).toBe(400)
    expect(extraInputError({ rate_currency: 'XYZ' })).toMatch(/Currency/)
    expect(extraInputError({ rate_currency: '' })).toBeNull()
  })
})
