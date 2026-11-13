// /api/suppliers/[id]/cities — the cities a guide works in (supplier_cities,
// migration 20270118). One company never reads or writes another's guide;
// a save replaces the list (cleaned, de-duplicated) and is stamped with the
// caller's company.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null }))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})

import { GET, PUT } from '@/app/api/suppliers/[id]/cities/route'

const req = (body?: unknown) =>
  new NextRequest('http://localhost/api/suppliers/x/cities', body === undefined ? { method: 'GET' } : { method: 'PUT', body: JSON.stringify(body) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const rows = async () => ((await (createMockClient().from('supplier_cities') as any).select('*')).data ?? []) as any[]

beforeEach(() => {
  ctx.orgId = 'org-a'
  setMockTables({
    suppliers: [{ id: 'g-a', org_id: 'org-a' }, { id: 'g-b', org_id: 'org-b' }],
    supplier_cities: [
      { id: 'c1', org_id: 'org-a', supplier_id: 'g-a', city: 'Cairo' },
      { id: 'c2', org_id: 'org-a', supplier_id: 'g-a', city: 'Luxor' },
      { id: 'c3', org_id: 'org-b', supplier_id: 'g-b', city: 'Aswan' },
    ],
  } as any)
})

describe('/api/suppliers/[id]/cities', () => {
  it("reads the guide's cities; another company's guide is a 404", async () => {
    expect((await (await GET(req(), params('g-a'))).json()).data).toEqual(['Cairo', 'Luxor'])
    expect((await GET(req(), params('g-b'))).status).toBe(404)
  })

  it('a save replaces the list: removes, keeps, adds — cleaned and stamped', async () => {
    const res = await PUT(req({ cities: ['Cairo', ' alexandria ', 'cairo', ''] }), params('g-a'))
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual(['Cairo', 'alexandria'])
    const mine = (await rows()).filter(r => r.supplier_id === 'g-a')
    expect(mine.map(r => r.city).sort()).toEqual(['Cairo', 'alexandria'])
    expect(mine.find(r => r.city === 'Cairo').id).toBe('c1') // kept, not re-created
    expect(mine.every(r => r.org_id === 'org-a')).toBe(true)
  })

  it('an empty list = every city; another company is never touched', async () => {
    expect((await PUT(req({ cities: [] }), params('g-a'))).status).toBe(200)
    expect((await rows()).map(r => r.id)).toEqual(['c3'])
    expect((await PUT(req({ cities: ['Cairo'] }), params('g-b'))).status).toBe(404)
    expect((await PUT(req({ cities: 'Cairo' }), params('g-a'))).status).toBe(400)
  })
})
