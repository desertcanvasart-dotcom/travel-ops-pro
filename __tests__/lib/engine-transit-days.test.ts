import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

// A programme that starts with an overnight flight from Japan and ends on
// its departure day: the party sleeps nowhere on either, arrives on day 2,
// and nothing is bought on the day in the air. NMS803-CR-ABS was sold a
// Cairo hotel night, an airport pickup, a check-in and a transfer on the
// flight day, and a second Cairo night on departure day (2026-09-03).

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing } from '@/lib/auto-pricing-service'

const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'Japanese', marginPercent: 0, numPax: 2 }

function withFlightDay() {
  const t = fullRateTables() as any
  const days = t.tour_templates[0].itinerary
  const flight = {
    day: 1, title: 'Overnight flight', city: null, overnight_city: null, overnight_kind: 'flight',
    // the importer's default — the kind above must win over it
    accommodation_type: 'hotel', attractions: [], meals: { breakfast: 'none', lunch: 'none', dinner: 'none' },
    services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false },
  }
  t.tour_templates[0].itinerary = [flight, ...days.map((d: any, i: number) => ({ ...d, day: i + 2 }))]
  t.tour_templates[0].duration_days = days.length + 1
  return t
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

describe('days in transit', () => {
  it('sells nothing on the overnight-flight day and arrives on day 2', async () => {
    setMockTables(withFlightDay())
    const r = await calculateAutoPricing(BASE)
    expect(r.success).toBe(true)
    const day1 = (r.services ?? []).filter((s: any) => s.dayNumber === 1)
    expect(day1).toEqual([])
    const day2 = (r.services ?? []).filter((s: any) => s.dayNumber === 2).map((s: any) => s.id)
    expect(day2).toContain('day2-hotel')
    expect(day2.some((id: string) => /airport|meet/i.test(id))).toBe(true)
  })

  it('never books a bed on the last day, whatever the import said', async () => {
    const t = fullRateTables() as any
    t.tour_templates[0].itinerary[1].accommodation_type = 'hotel'
    setMockTables(t)
    const r = await calculateAutoPricing(BASE)
    expect((r.services ?? []).find((s: any) => s.id === 'day2-hotel')).toBeUndefined()
    expect((r.services ?? []).find((s: any) => s.id === 'day1-hotel')).toBeDefined()
  })

  it('warns when a hotel has dated periods and none covers the night', async () => {
    const t = fullRateTables() as any
    for (const row of t.accommodation_rates) {
      row.seasons = [{ name: 'Summer', from: '2026-05-01', to: '2026-10-31', rates: { pp_double_eur: 999, pp_double_non_eur: 999 } }]
    }
    setMockTables(t)
    const r = await calculateAutoPricing({ ...BASE, travelDate: '2026-11-03' })
    expect(r.warnings.some((w: string) => /No rate period on .* covers 2026-11-03/.test(w))).toBe(true)
    // …and the base rate, not the summer one, priced the night
    expect((r.services ?? []).find((s: any) => s.id === 'day1-hotel')?.unitCost).toBe(95)
  })
})
