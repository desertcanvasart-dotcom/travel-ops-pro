// Template auto-price never told the engine which currency the rate tables are
// in, so a USD-rated agency's rates were normalised as EUR (sweep H13). The
// departures grid passes it; these routes must too.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const calculateAutoPricing = vi.fn(async () => ({ success: true, services: [], warnings: [] }))
const calculateMultiTierPricing = vi.fn(async () => new Map())
vi.mock('@/lib/auto-pricing-service', () => ({
  calculateAutoPricing: (...a: unknown[]) => calculateAutoPricing(...(a as [])),
  calculateMultiTierPricing: (...a: unknown[]) => calculateMultiTierPricing(...(a as [])),
  getTemplatePriceRange: vi.fn(),
}))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrgId: async () => 'org-1' }))
vi.mock('@/lib/org-default-margin', () => ({ getOrgDefaultMargin: async () => 30, resolveMarginPercent: () => 30 }))
vi.mock('@/lib/org-rate-currency', () => ({ getOrgRateCurrency: async () => 'USD' }))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => ({}) }))
vi.mock('@/lib/vocabulary-server', () => ({ tierLadderForCurrentOrg: async () => ['standard', 'deluxe'] }))

import { GET, POST } from '@/app/api/tours/templates/[id]/auto-price/route'

const params = { params: Promise.resolve({ id: 't1' }) }
const post = (body: unknown) =>
  POST(new NextRequest('http://x/api/tours/templates/t1/auto-price', { method: 'POST', body: JSON.stringify(body) }), params)

beforeEach(() => {
  calculateAutoPricing.mockClear()
  calculateMultiTierPricing.mockClear()
})

describe('template auto-price passes the org rate currency', () => {
  it('single tier (POST)', async () => {
    await post({ tier: 'standard' })
    expect(calculateAutoPricing).toHaveBeenCalledWith(expect.objectContaining({ rateCurrency: 'USD', orgId: 'org-1' }))
  })
  it('all tiers (POST)', async () => {
    await post({ all_tiers: true })
    const options = (calculateMultiTierPricing.mock.calls[0] as unknown[])[4]
    expect(options).toMatchObject({ rateCurrency: 'USD', orgId: 'org-1' })
  })
  it('quick price (GET)', async () => {
    await GET(new NextRequest('http://x/api/tours/templates/t1/auto-price'), params)
    expect(calculateAutoPricing).toHaveBeenCalledWith(expect.objectContaining({ rateCurrency: 'USD' }))
  })
})
