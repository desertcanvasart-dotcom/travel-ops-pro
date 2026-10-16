// Rates › Costs: a clash on a per-company unique key is a 409 that names it.
// Tipping: a blank Service Code generated the same TIP-ROLE-CONTEXT for two
// cities, and the second save hit UNIQUE(org_id, service_code) — "Internal
// server error" in production. Fixed costs: a second "Water Bottle" (any case)
// hit UNIQUE(org_id, cost_type) the same way.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@/lib/supabase-server', () => {
  // The duplicate check finds nothing; the insert meets the unique index.
  const chain: any = {
    select: () => chain, eq: () => chain, is: () => chain,
    limit: async () => ({ data: [], error: null }),
    insert: () => chain,
    single: async () => ({ data: null, error: { code: '23505', details: 'Key (org_id, service_code)=(org-1, TIP-GUIDE-DAY-TOUR) already exists.' } }),
  }
  return { createServerClient: () => ({ from: () => chain }) }
})
vi.mock('@/lib/supabase-actor', () => ({ createActorAdminClient: () => createMockClient() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return { getCurrentOrgId: async () => 'org-1', noOrgResponse: () => NextResponse.json({}, { status: 403 }) }
})
vi.mock('@/lib/fixed-costs', () => ({ clearFixedCostsCache: () => {} }))

import { POST as postTip } from '@/app/api/rates/tipping/route'
import { POST as postCost } from '@/app/api/rates/fixed-costs/route'

const req = (body: unknown) => ({ json: async () => body }) as never

beforeEach(() => {
  setMockTables({ fixed_daily_costs: [{ id: 'w1', org_id: 'org-1', cost_type: 'Water Bottle', cost_per_person_per_day: 2, is_active: true }] })
})

describe('tipping', () => {
  it('a service code clash is a 409 naming the code', async () => {
    const res = await postTip(req({ service_code: 'TIP-GUIDE-DAY-TOUR', role_type: 'guide', context: 'day_tour', rate_unit: 'per_day', rate_eur: 10, city: 'Aswan' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('TIP-GUIDE-DAY-TOUR')
  })
})

describe('fixed costs', () => {
  it('a second Water Bottle, in any case, is a 409', async () => {
    const res = await postCost(req({ cost_type: 'water bottle', cost_per_person_per_day: 3 }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('"Water Bottle" already exists')
  })

  it('another cost type is added', async () => {
    const res = await postCost(req({ cost_type: 'Snacks', cost_per_person_per_day: 3 }))
    expect(res.status).toBe(200)
  })
})
