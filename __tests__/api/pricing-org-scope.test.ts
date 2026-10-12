// Pricing read another company's catalogue rows, though the tables carry
// org_id: b2b_transport_packages (cruise transport), org_vocabularies
// kind='airport', and the B2B partner (with its margin override) named in the
// request body. A second company is live on the install, so each now reads
// only the caller's organisation's rows.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null }))
vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient(), supabaseServer: createMockClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => 'u1',
    getCurrentUserRole: async () => 'admin',
    requireRole: async () => null,
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})

import { fetchCruiseTransportPricingRules } from '@/lib/auto-pricing-service'
import { POST as calculatePrice } from '@/app/api/b2b/calculate-price/route'

const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/^\s*\/\/.*$/gm, '')

beforeEach(() => {
  ctx.orgId = 'org-a'
  setMockTables({
    b2b_transport_packages: [
      { id: 'pk-a', org_id: 'org-a', is_active: true, duration_days: 4 },
      { id: 'pk-b', org_id: 'org-b', is_active: true, duration_days: 4 },
    ],
    b2b_partners: [
      { id: 'p-a', org_id: 'org-a', default_margin_percent: 10 },
      { id: 'p-b', org_id: 'org-b', default_margin_percent: 2 },
    ],
  })
})

describe('cruise transport packages (fix 20)', () => {
  it("the engine reads only the org's packages — and none without an org", async () => {
    expect((await fetchCruiseTransportPricingRules('org-a')).map(p => p.id)).toEqual(['pk-a'])
    expect((await fetchCruiseTransportPricingRules('org-b')).map(p => p.id)).toEqual(['pk-b'])
    expect(await fetchCruiseTransportPricingRules(null)).toEqual([])
  })

  it('the wrappers hand the org to the day pricing — without it a trip prices with no packages and no airports', () => {
    expect(src('lib/auto-pricing-service.ts').match(/numPax: params\.numPax,\n\s*orgId: params\.orgId,/g)).toHaveLength(2)
    expect(src('app/api/pricing/coverage/route.ts')).toContain('calculateDayBasedPricing({ ...args, orgId: orgId ?? undefined })')
    expect(src('app/api/b2b/test-pricing/route.ts').match(/\(\{\n\s*orgId,\n\s*templateId,/g)).toHaveLength(2)
  })

  it('every caller passes the org', () => {
    expect(src('lib/auto-pricing-service.ts')).toContain('fetchCruiseTransportPricingRules(params.orgId, rateNormalizer)')
    expect(src('lib/ai/cruise-service-creation.ts')).toContain('fetchCruiseTransportPricingRules(orgId)')
    expect(src('lib/ai/service-creation.ts')).toContain('fetchCruiseTransportPricingRules(orgId)')
    expect(src('app/api/ai/generate-itinerary/route.ts')).toContain('fetchCruiseTransportPricingRules(orgId)')
    expect(src('app/api/ai/generate-itinerary/route.ts').match(/ItineraryServices\(supabase, \{\n\s*orgId,/g)).toHaveLength(2)
  })

  it('the B2B calculator and the pricing grid read the org packages; the package PUT is org-filtered', () => {
    expect(src('app/api/b2b/calculate-price/route.ts')).toMatch(/from\('b2b_transport_packages'\)\s*\n\s*\.select\('\*'\)\s*\n\s*\.eq\('org_id', orgId\)/)
    expect(src('app/api/pricing-grid/rates/route.ts')).toContain("from('b2b_transport_packages').select('*').eq('org_id', orgId)")
    expect(src('app/api/pricing-grid/parse/route.ts')).toContain("from('b2b_transport_packages').select('*').eq('org_id', orgId)")
    expect(src('app/api/b2b/transport-packages/[id]/route.ts')).toMatch(/\.update\([\s\S]*?\.eq\('id', id\)\s*\n\s*\.eq\('org_id', orgId\)/)
  })
})

describe('airports (fix 22)', () => {
  it("the engine and the pricing grid read the org's airports", () => {
    expect(src('lib/auto-pricing-service.ts')).toMatch(/from\('org_vocabularies'\)\s*\n\s*\.select\('key, label, meta, is_active'\)\s*\n\s*\.eq\('org_id', orgId\)\s*\n\s*\.eq\('kind', 'airport'\)/)
    expect(src('lib/auto-pricing-service.ts')).toContain('fetchAirports(params.orgId)')
    expect(src('app/api/pricing-grid/rates/route.ts')).toContain(".eq('org_id', orgId).eq('kind', 'airport')")
  })
})

describe('the B2B partner (fix 21)', () => {
  const run = (body: Record<string, unknown>) =>
    calculatePrice(new NextRequest('http://x/api/b2b/calculate-price', { method: 'POST', body: JSON.stringify(body) }))

  it("another company's partner — and its margin — is refused with 404", async () => {
    const r = await run({ partner_id: 'p-b', template_id: 't1', num_pax: 2 })
    expect(r.status).toBe(404)
    expect((await r.json()).error).toBe('Itinerary or partner not found')
  })

  it('the partner reads are org-filtered as well', () => {
    const code = src('app/api/b2b/calculate-price/route.ts')
    expect(code.match(/from\('b2b_partners'\)\s*\n\s*\.select\('default_margin_percent'\)\s*\n\s*\.eq\('id', partner_id\)\s*\n\s*\.eq\('org_id', orgId\)/g)).toHaveLength(2)
  })
})
