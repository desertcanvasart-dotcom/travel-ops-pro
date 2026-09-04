import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'

// The tour detail's day list. Imported programmes keep their days on
// tour_templates.itinerary; a variation created for pricing has NO rows in
// variation_daily_itinerary — and the variation path used to show those
// tours with an empty itinerary (NMS803, 2026-09-05). A variation with day
// rows of its own still wins.

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => createMockClient() }))

import { GET } from '@/app/api/tours/[code]/route'

const TPL = '00000000-0000-4000-8000-00000000aaa1'
const VAR = '00000000-0000-4000-8000-00000000bbb1'

const templateDays = [
  { day: 1, title: 'Arrival', city: 'Cairo', overnight_city: 'Cairo', meals: ['lunch'], is_cruise_day: false },
  { day: 2, title: 'Departure', city: 'Cairo', overnight_city: 'Cairo', meals: [], is_cruise_day: false },
]

const base = () => ({
  tour_templates: [{
    id: TPL, template_code: 'NMS-TEST', template_name: 'Test', is_active: true,
    duration_days: 2, duration_nights: 1, cities_covered: ['Cairo'], itinerary: templateDays,
  }],
  tour_variations: [{
    id: VAR, template_id: TPL, variation_code: 'NMS-TEST-DELUXE', variation_name: 'Deluxe',
    tier: 'deluxe', group_type: 'private', min_pax: 1, max_pax: 15, is_active: true,
    // The mock returns rows verbatim (no embed resolution), so the row
    // carries the embedded template the way PostgREST would hand it back.
    tour_templates: {
      id: TPL, template_code: 'NMS-TEST', template_name: 'Test',
      short_description: null, long_description: null, highlights: [], main_attractions: [],
      duration_days: 2, duration_nights: 1, cities_covered: ['Cairo'],
      itinerary: templateDays, tour_categories: null,
    },
  }],
  tour_variation_services: [],
  variation_services: [],
  variation_daily_itinerary: [] as Record<string, unknown>[],
})

const get = async (code: string) => {
  const res = await GET({} as never, { params: Promise.resolve({ code }) } as never)
  return res.json()
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

beforeEach(() => setMockTables(base() as never))

describe('tour detail day list', () => {
  it("a variation with no day rows shows the TEMPLATE's days, not an empty itinerary", async () => {
    const json = await get(TPL) // template UUID → variation path
    expect(json.success).toBe(true)
    expect(json.data.variation_id).toBe(VAR)
    expect(json.data.daily_itinerary.map((d: any) => d.day_title)).toEqual(['Arrival', 'Departure'])
    expect(json.data.daily_itinerary[0]).toMatchObject({ day_number: 1, city: 'Cairo', lunch_included: true })
  })

  it('a variation with its own day rows still wins', async () => {
    const t = base()
    t.variation_daily_itinerary = [{ id: 'd1', variation_id: VAR, day_number: 1, day_title: 'Own Day', city: 'Luxor', breakfast_included: false, lunch_included: false, dinner_included: false }]
    setMockTables(t as never)
    const json = await get(TPL)
    expect(json.data.daily_itinerary.map((d: any) => d.day_title)).toEqual(['Own Day'])
  })
})
