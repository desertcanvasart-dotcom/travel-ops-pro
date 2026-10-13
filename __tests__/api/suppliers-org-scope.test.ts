// suppliers and supplier_properties carry org_id since migration 20261205 (as
// do the guides / airport_staff / hotel_staff views over suppliers). These
// routes run on the service role — RLS does not apply — and listed, edited,
// exported and deleted every company's suppliers; /api/supplier-rates read the
// rates of any supplier id. Two companies' fixtures: company A must never
// list, read, change, export or delete company B's suppliers, properties or
// staff, must not link B's supplier to its own records, and everything A
// writes is stamped A.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null }))

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient(), supabaseServer: createMockClient() }))
vi.mock('@/lib/supabase-actor', () => ({ createActorAdminClient: () => createMockClient() }))
vi.mock('@/lib/supabase/service-client', () => ({ createServiceClient: () => createMockClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => 'u1',
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/vocabulary-server', () => ({
  supplierTypesForCurrentOrg: async () => [
    { key: 'hotel', label: 'Hotel', label_ja: null, behavior: 'hotel', is_active: true },
    { key: 'guide', label: 'Guide', label_ja: null, behavior: 'guide', is_active: true },
    { key: 'transport', label: 'Transport', label_ja: null, behavior: 'transport', is_active: true },
  ],
}))
vi.mock('@/lib/i18n/server-messages', () => ({ tServer: async (key: string) => key }))

import * as suppliers from '@/app/api/suppliers/route'
import * as supplierById from '@/app/api/suppliers/[id]/route'
import * as properties from '@/app/api/suppliers/[id]/properties/route'
import * as propertyById from '@/app/api/suppliers/[id]/properties/[propertyId]/route'
import * as exportRoute from '@/app/api/suppliers/export/route'
import * as importRoute from '@/app/api/suppliers/import/route'
import * as guides from '@/app/api/guides/route'
import * as guideById from '@/app/api/guides/[id]/route'
import * as airportStaff from '@/app/api/resources/airport-staff/route'
import * as airportStaffById from '@/app/api/resources/airport-staff/[id]/route'
import * as hotelStaff from '@/app/api/resources/hotel-staff/route'
import * as hotelStaffById from '@/app/api/resources/hotel-staff/[id]/route'
import * as vehicles from '@/app/api/resources/vehicles/route'
import * as supplierRates from '@/app/api/supplier-rates/route'
import * as expenses from '@/app/api/expenses/route'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { createMockClient as db } from '../_mock-supabase'

const json = (body: unknown) => ({ json: async () => body }) as never
const req = (url: string, body?: unknown) =>
  new NextRequest(url, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) })
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })
const rows = async (table: string) => ((await (db().from(table) as any).select('*')).data ?? []) as Record<string, any>[]

beforeEach(() => {
  ctx.orgId = 'org-a'
  setMockTables({
    suppliers: [
      { id: 'sa-hotel', org_id: 'org-a', name: 'Nile Palace', type: 'hotel', types: ['hotel'], status: 'active', supplier_code: 'SUP-0001' },
      { id: 'sa-guide', org_id: 'org-a', name: 'Sam', type: 'guide', types: ['guide'], status: 'active', supplier_code: 'SUP-0002' },
      { id: 'sa-van', org_id: 'org-a', name: 'A Vans', type: 'transport', types: ['transport'], status: 'active', supplier_code: 'SUP-0003' },
      // Company B holds SUP-0001 too: codes are unique per company.
      { id: 'sb-hotel', org_id: 'org-b', name: 'Other Palace', type: 'hotel', types: ['hotel'], status: 'active', supplier_code: 'SUP-0001', bank_details: 'B IBAN' },
      { id: 'sb-guide', org_id: 'org-b', name: 'Bob', type: 'guide', types: ['guide'], status: 'active', supplier_code: 'SUP-0002' },
      { id: 'sb-van', org_id: 'org-b', name: 'B Vans', type: 'transport', types: ['transport'], status: 'active', supplier_code: 'SUP-0003' },
    ],
    supplier_properties: [
      { id: 'pa', org_id: 'org-a', supplier_id: 'sa-hotel', property_type: 'hotel', name: 'Palace Luxor', is_active: true },
      { id: 'pb', org_id: 'org-b', supplier_id: 'sb-hotel', property_type: 'hotel', name: 'Other Luxor', is_active: true },
    ],
    guides: [
      { id: 'sa-guide', org_id: 'org-a', name: 'Sam', is_active: true, languages: ['english'] },
      { id: 'sb-guide', org_id: 'org-b', name: 'Bob', is_active: true, languages: ['english'] },
    ],
    airport_staff: [
      { id: 'as-a', org_id: 'org-a', name: 'Meet A', is_active: true },
      { id: 'as-b', org_id: 'org-b', name: 'Meet B', is_active: true },
    ],
    hotel_staff: [
      { id: 'hs-a', org_id: 'org-a', name: 'Desk A', is_active: true },
      { id: 'hs-b', org_id: 'org-b', name: 'Desk B', is_active: true },
    ],
    guide_rates: [
      { id: 'gr-b', supplier_id: 'sb-guide', created_at: '2026-01-01', base_rate_eur: 100 },
    ],
    itineraries: [], transportation_rates: [], expenses: [],
  })
})

describe('the suppliers screen', () => {
  it("lists only the caller's company's suppliers (by role and by city too)", async () => {
    const all = await (await suppliers.GET(req('http://x/api/suppliers'))).json()
    expect(all.data.map((s: any) => s.id).sort()).toEqual(['sa-guide', 'sa-hotel', 'sa-van'])
    const hotels = await (await suppliers.GET(req('http://x/api/suppliers?type=hotel'))).json()
    expect(hotels.data.map((s: any) => s.id)).toEqual(['sa-hotel'])
  })

  it('a new supplier is stamped with the company', async () => {
    const res = await suppliers.POST(json({ name: 'New Hotel', types: ['hotel'], org_id: 'org-b' }))
    expect(res.status).toBe(201)
    expect((await rows('suppliers')).find(s => s.name === 'New Hotel')?.org_id).toBe('org-a')
  })

  it("another company's supplier is a 404: read, edit, delete", async () => {
    expect((await supplierById.GET(req('http://x'), params({ id: 'sb-hotel' }))).status).toBe(404)
    expect((await supplierById.PUT(json({ name: 'Mine now' }), params({ id: 'sb-hotel' }))).status).toBe(404)
    expect((await supplierById.DELETE(req('http://x'), params({ id: 'sb-hotel' }))).status).toBe(404)
    const b = (await rows('suppliers')).find(s => s.id === 'sb-hotel')
    expect(b?.name).toBe('Other Palace')
    // Its own still work.
    expect((await supplierById.GET(req('http://x'), params({ id: 'sa-hotel' }))).status).toBe(200)
    expect((await supplierById.PUT(json({ name: 'Nile Palace 2' }), params({ id: 'sa-hotel' }))).status).toBe(200)
  })

  it("properties: none of another company's listed, added, edited or deleted", async () => {
    const list = await (await properties.GET(req('http://x'), params({ id: 'sb-hotel' }))).json()
    expect(list.data).toEqual([])
    expect((await properties.POST(json({ name: 'Annex', property_type: 'hotel' }), params({ id: 'sb-hotel' }))).status).toBe(404)
    expect((await propertyById.PUT(json({ name: 'x' }), params({ id: 'sb-hotel', propertyId: 'pb' }))).status).toBe(404)
    expect((await propertyById.DELETE(req('http://x'), params({ id: 'sb-hotel', propertyId: 'pb' }))).status).toBe(404)
    expect((await rows('supplier_properties')).map(p => p.id).sort()).toEqual(['pa', 'pb'])
    const res = await properties.POST(json({ name: 'Palace Aswan', property_type: 'hotel' }), params({ id: 'sa-hotel' }))
    expect(res.status).toBe(201)
    expect((await rows('supplier_properties')).find(p => p.name === 'Palace Aswan')?.org_id).toBe('org-a')
  })

  it("the CSV export carries none of another company's suppliers", async () => {
    const csv = await (await exportRoute.POST(json({ ids: ['sa-hotel', 'sb-hotel'] }))).text()
    expect(csv).toContain('Nile Palace')
    expect(csv).not.toContain('Other Palace')
  })

  it("the CSV import stamps the company; another company's supplier of the same name is not on file here", async () => {
    // A row matching this company's supplier UPDATES it (lib/suppliers/
    // import-csv); one matching only the other company's is added here.
    const csvData = 'name,type\nOther Palace,hotel\nNile Palace,hotel\n'
    const out = await (await importRoute.POST(json({ csvData }))).json()
    expect(out.updates.map((r: any) => r.name)).toEqual(['Nile Palace'])
    expect(out.inserted).toBe(1)
    const mine = (await rows('suppliers')).filter(s => s.name === 'Other Palace')
    expect(mine.map(s => s.org_id).sort()).toEqual(['org-a', 'org-b'])
    // Company B's supplier was not touched by A's update.
    expect((await rows('suppliers')).find(s => s.id === 'sb-hotel')).toMatchObject({ name: 'Other Palace', org_id: 'org-b' })
  })
})

describe('guides, airport and hotel staff', () => {
  it("each list shows only the company's own", async () => {
    const g = await (await guides.GET(req('http://x/api/guides'))).json()
    expect(g.map((x: any) => x.id)).toEqual(['sa-guide'])
    const a = await (await airportStaff.GET(req('http://x/api/resources/airport-staff'))).json()
    expect(a.data.map((x: any) => x.id)).toEqual(['as-a'])
    const h = await (await hotelStaff.GET(req('http://x/api/resources/hotel-staff'))).json()
    expect(h.data.map((x: any) => x.id)).toEqual(['hs-a'])
    const v = await (await vehicles.GET(req('http://x/api/resources/vehicles'))).json()
    expect((v.data ?? v).map((x: any) => x.id)).toEqual(['sa-van'])
  })

  it("another company's guide or staff member is a 404", async () => {
    expect((await guideById.GET(req('http://x'), params({ id: 'sb-guide' }))).status).toBe(404)
    expect((await guideById.PUT(json({ name: 'x' }), params({ id: 'sb-guide' }))).status).toBe(404)
    expect((await guideById.DELETE(req('http://x'), params({ id: 'sb-guide' }))).status).toBe(404)
    expect((await airportStaffById.GET(req('http://x'), params({ id: 'as-b' }))).status).toBe(404)
    expect((await airportStaffById.PUT(json({ name: 'x' }), params({ id: 'as-b' }))).status).toBe(404)
    expect((await airportStaffById.DELETE(req('http://x'), params({ id: 'as-b' }))).status).toBe(404)
    expect((await hotelStaffById.GET(req('http://x'), params({ id: 'hs-b' }))).status).toBe(404)
    expect((await hotelStaffById.PUT(json({ name: 'x' }), params({ id: 'hs-b' }))).status).toBe(404)
    expect((await hotelStaffById.DELETE(req('http://x'), params({ id: 'hs-b' }))).status).toBe(404)
    expect((await rows('airport_staff')).map(r => r.id).sort()).toEqual(['as-a', 'as-b'])
    expect((await rows('hotel_staff')).find(r => r.id === 'hs-b')?.name).toBe('Desk B')
  })

  it('new guides and staff are stamped with the company', async () => {
    expect((await guides.POST(json({ name: 'New Guide' }))).status).toBe(201)
    expect((await rows('suppliers')).find(s => s.name === 'New Guide')?.org_id).toBe('org-a')
    expect((await airportStaff.POST(json({ name: 'Meet C', airport_location: 'CAI', phone: '+20' }))).status).toBe(201)
    expect((await rows('airport_staff')).find(s => s.name === 'Meet C')?.org_id).toBe('org-a')
    expect((await hotelStaff.POST(json({ name: 'Desk C', phone: '+20' }))).status).toBe(201)
    expect((await rows('hotel_staff')).find(s => s.name === 'Desk C')?.org_id).toBe('org-a')
  })
})

describe('linking a supplier', () => {
  it("/api/supplier-rates refuses another company's supplier", async () => {
    expect((await supplierRates.GET(req('http://x/api/supplier-rates?supplier_id=sb-guide'))).status).toBe(404)
  })

  it("a rate form cannot name another company's supplier, by id or by name", async () => {
    const byId = await validateAndResolveSupplierFields({ supplier_id: 'sb-guide' }, db() as never, 'org-a')
    expect(byId.ok).toBe(false)
    const byName = await validateAndResolveSupplierFields({ supplier_name: 'Bob' }, db() as never, 'org-a')
    expect(byName.ok).toBe(false)
    const mine = await validateAndResolveSupplierFields({ supplier_id: 'sa-guide' }, db() as never, 'org-a')
    expect(mine).toMatchObject({ ok: true, supplier_id: 'sa-guide' })
  })

  it("an expense cannot name another company's supplier", async () => {
    const res = await expenses.POST(json({ category: 'guide', amount: 10, expense_date: '2026-10-01', supplier_id: 'sb-guide' }))
    expect(res.status).toBe(404)
    expect(await rows('expenses')).toEqual([])
  })

  it('with no company, every route refuses', async () => {
    ctx.orgId = null
    expect((await suppliers.GET(req('http://x/api/suppliers'))).status).toBe(403)
    expect((await supplierById.GET(req('http://x'), params({ id: 'sa-hotel' }))).status).toBe(403)
    expect((await guides.GET(req('http://x/api/guides'))).status).toBe(403)
    expect((await supplierRates.GET(req('http://x/api/supplier-rates?supplier_id=sa-guide'))).status).toBe(403)
  })
})
