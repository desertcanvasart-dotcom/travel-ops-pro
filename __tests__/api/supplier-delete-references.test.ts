// Deleting a supplier that something still points at is refused — 409, with
// the counts by kind — and the screen offers to deactivate instead.
//
// The guard used to check money and records only. A hotel group's delete
// CASCADED its hotels (and every rate's property_id went NULL), its rates
// were left bought from nobody, and a guide assigned to next week's trips was
// silently unassigned (or left as an id pointing at nothing).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => 'org-a',
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/vocabulary-server', () => ({ supplierTypesForCurrentOrg: async () => [] }))

import { DELETE, PUT } from '@/app/api/suppliers/[id]/route'
import { POST } from '@/app/api/suppliers/route'
import { commissionDirectionOf, commissionFieldError } from '@/lib/suppliers/fields'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const del = async (id: string) => {
  const res = await DELETE(new NextRequest('http://x'), params(id))
  return { status: res.status, body: await res.json() }
}
const supplier = (id: string) => ({ id, org_id: 'org-a', name: id, type: 'hotel', types: ['hotel'], status: 'active' })
const stillThere = async (id: string) =>
  (((await (createMockClient().from('suppliers') as any).select('*')).data ?? []) as any[]).some(s => s.id === id)

beforeEach(() => {
  setMockTables({ suppliers: [supplier('s1')] })
})

describe('DELETE /api/suppliers/[id]: what blocks it', () => {
  it('a supplier with a property is refused, and the property survives', async () => {
    setMockTables({ suppliers: [supplier('s1')], supplier_properties: [{ id: 'p1', supplier_id: 's1', org_id: 'org-a', name: 'Palace Luxor' }] })
    const out = await del('s1')
    expect(out.status).toBe(409)
    expect(out.body.error).toBe('Supplier is referenced by 1 properties — deactivate it instead')
    expect(out.body.references).toEqual([{ label: 'properties', count: 1 }])
    expect(await stillThere('s1')).toBe(true)
  })

  it('a guide assigned to a trip is refused', async () => {
    setMockTables({ suppliers: [supplier('g1')], itineraries: [{ id: 'i1', assigned_guide_id: 'g1' }], itinerary_resources: [{ id: 'r1', resource_id: 'g1' }] })
    const out = await del('g1')
    expect(out.status).toBe(409)
    expect(out.body.error).toContain('2 trip assignments')
  })

  it('rates in several tables are counted together as "rates"', async () => {
    setMockTables({
      suppliers: [supplier('s1')],
      guide_rates: [{ id: 'gr', supplier_id: 's1' }],
      transportation_rates: [{ id: 'tr', supplier_id: 's1' }],
      supplier_documents: [{ id: 'v1', supplier_id: 's1' }],
      bookings: [{ id: 'b1', assigned_guide_id: 's1' }],
    })
    const out = await del('s1')
    expect(out.status).toBe(409)
    expect(out.body.error).toBe('Supplier is referenced by 2 rates, 1 bookings, 1 vouchers and documents — deactivate it instead')
  })

  it('a supplier nothing points at is deleted', async () => {
    const out = await del('s1')
    expect(out.status).toBe(200)
    expect(await stillThere('s1')).toBe(false)
  })
})

describe('supplier writes', () => {
  it('a commission rate outside 0–100 is refused on edit and on create', async () => {
    const put = await PUT(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ default_commission_rate: 500 }) }), params('s1'))
    expect(put.status).toBe(400)
    const post = await POST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ name: 'X', types: ['hotel'], default_commission_rate: -50 }) }))
    expect(post.status).toBe(400)
    expect(commissionFieldError({ default_commission_rate: 12.5, commission_type: 'payable' })).toBeNull()
    expect(commissionFieldError({ default_commission_rate: null })).toBeNull()
    expect(commissionFieldError({ commission_type: 'sideways' })).toMatch(/direction/)
  })

  it('a 0% commission is no commission', () => {
    expect(commissionDirectionOf({ default_commission_rate: 0, commission_type: 'receivable' })).toBeNull()
    expect(commissionDirectionOf({ default_commission_rate: '10', commission_type: null })).toBe('receivable')
    expect(commissionDirectionOf({ default_commission_rate: 10, commission_type: 'payable' })).toBe('payable')
  })
})
