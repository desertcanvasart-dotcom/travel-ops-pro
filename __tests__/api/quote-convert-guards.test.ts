// ============================================
// Converting a B2B quote: accepted only, by the signed-in user, at its price
// ============================================
// Sell audit (2026-10-13) #4 and #10. A 0% margin quote's lines came out 25%
// dearer (`margin_percent || 25`) and without the season premium, so the
// trip's lines and its header disagreed; a draft converted by API; and the
// itinerary's author was whatever the body said.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1',
  getCurrentUserId: async () => 'user-1',
  noOrgResponse: () => new Response(JSON.stringify({ error: 'no org' }), { status: 403 }),
}))
vi.mock('@/lib/itineraries/reassert-client', () => ({ reassertClientId: async () => {} }))
vi.mock('@/lib/rates/fx-source', () => ({ fetchRunExchangeRates: async () => null }))

import { POST } from '@/app/api/b2b/quotes/[id]/convert/route'

const rows = async (t: string) => (await (createMockClient().from(t) as any).select('*')).data as any[]
const convert = async (id: string, body: unknown = {}) => {
  const res = await POST(new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })
  return { status: res.status, json: await res.json() }
}

const quote = (over: Record<string, unknown>) => ({
  id: 'q-1', org_id: 'org-1', quote_number: 'QT-2026-00009', status: 'accepted', travel_date: '2027-05-01',
  num_adults: 2, num_children: 0, currency: 'EUR', margin_percent: 0, total_cost: 1000, margin_amount: 0,
  season_uplift_amount: 150, selling_price: 1150, converted_to_itinerary_id: null, itinerary_id: null, partner_id: null,
  services_snapshot: [
    { service_id: 'h', service_name: 'Hotel', service_category: 'accommodation', quantity_mode: 'fixed', quantity: 1, line_total: 600, day_number: 1 },
    { service_id: 'g', service_name: 'Guide', service_category: 'guide', quantity_mode: 'fixed', quantity: 1, line_total: 400, day_number: 2 },
  ],
  tour_variations: { id: 'v', tour_templates: { id: 't', template_name: 'Nile', duration_days: 2, itinerary: null } },
  b2b_partners: null,
  ...over,
})

beforeEach(() => {
  setMockTables({
    organizations: [{ id: 'org-1' }],
    tour_quotes: [quote({}), quote({ id: 'q-draft', status: 'draft' })],
    itineraries: [], itinerary_days: [], itinerary_services: [], clients: [],
  })
})

describe('convert', () => {
  it('refuses a quote that is not accepted (#10)', async () => {
    const { status, json } = await convert('q-draft', { user_id: 'someone' })
    expect(status).toBe(409)
    expect(json.error).toMatch(/accepted/)
    expect(await rows('itineraries')).toEqual([])
  })

  it('a 0% quote converts at its price: lines + premium = selling price, author from the session (#4, #10)', async () => {
    const { status } = await convert('q-1', { user_id: 'someone-else' })
    expect(status).toBe(200)
    const [trip] = await rows('itineraries')
    expect(trip).toMatchObject({ total_cost: 1150, season_uplift_amount: 150, margin_percent: 0, user_id: 'user-1' })
    const lines = await rows('itinerary_services')
    expect(lines.map((l) => l.client_price)).toEqual([600, 400])
    const sum = lines.reduce((a, l) => a + l.client_price, 0)
    expect(sum + trip.season_uplift_amount).toBe(trip.total_cost)
  })
})
