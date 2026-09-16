import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

// A programme day sold with a supplement — a view, a meal plan, a deck from
// the agency's own vocabulary — is priced at the property's per-person-
// per-night price for that night and INCLUDED in the price (operator
// decision 2026-09-13). A property with no price for it is a hole: the
// customer asked for it, so it is never quietly dropped or quietly free.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing } from '@/lib/auto-pricing-service'

const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'Japanese', marginPercent: 0, numPax: 2 }
const SUPP = 20

type Tables = ReturnType<typeof fullRateTables>

function withSupplements(opts: { carried: boolean; priced: boolean; asked: string[] }): Tables {
  const t = fullRateTables()
  for (const row of t.accommodation_rates as Record<string, unknown>[]) {
    row.supplements = opts.carried ? [{ key: 'view_nile', name: 'Nile View' }] : []
    row.seasons = [{
      name: 'All year', from: '2026-01-01', to: '2026-12-31',
      rates: {
        pp_double_eur: 95, pp_double_non_eur: 95,
        ...(opts.priced ? { 'supp:view_nile:eur': SUPP, 'supp:view_nile:non_eur': SUPP } : {}),
      },
    }]
  }
  const tpl = (t.tour_templates as Array<{ itinerary: Array<Record<string, unknown>> }>)[0]
  tpl.itinerary = tpl.itinerary.map(d => (d.accommodation_type === 'hotel' ? { ...d, supplements: opts.asked } : d))
  return t
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('engine — hotel supplements', () => {
  it('a night sold with a supplement the hotel prices adds one per-person line at that price, included in the total', async () => {
    setMockTables(withSupplements({ carried: true, priced: true, asked: [] }))
    const plain = await calculateAutoPricing(BASE)
    setMockTables(withSupplements({ carried: true, priced: true, asked: ['view_nile'] }))
    const withView = await calculateAutoPricing(BASE)
    expect(plain.success && withView.success).toBe(true)

    const lines = withView.services.filter(s => s.id.includes('-hotel-supp-view_nile'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ serviceType: 'accommodation', unitCost: SUPP, isPerPax: true, isOptional: false })
    expect(lines[0].serviceName).toContain('Nile View')
    // Two travellers, one night: the total moves by exactly two supplements.
    expect(withView.totalCost).toBeCloseTo(plain.totalCost + SUPP * BASE.numPax, 2)
    expect((withView.holes ?? []).some(h => h.lookupAttempted.includes('supplement='))).toBe(false)
  })

  it('a supplement the hotel carries but has not priced is an UNPRICED hole, never free', async () => {
    setMockTables(withSupplements({ carried: true, priced: false, asked: ['view_nile'] }))
    const r = await calculateAutoPricing(BASE)
    // Listed on the night at 0 — never charged, never silently dropped.
    const supp = r.services.filter(s => s.id.includes('-hotel-supp-'))
    expect(supp).toHaveLength(1)
    expect(supp[0]).toMatchObject({ unpriced: true, unitCost: 0, lineTotal: 0 })
    const hole = (r.holes ?? []).find(h => h.lookupAttempted.includes('supplement=view_nile'))
    expect(hole).toBeTruthy()
    expect(hole!.reason).toBe('unpriced')
    expect(hole!.message).toContain('Nile View')
  })

  it('a supplement the hotel does not carry at all is a MISSING hole', async () => {
    setMockTables(withSupplements({ carried: false, priced: false, asked: ['view_nile'] }))
    const r = await calculateAutoPricing(BASE)
    const hole = (r.holes ?? []).find(h => h.lookupAttempted.includes('supplement=view_nile'))
    expect(hole?.reason).toBe('missing')
  })
})
