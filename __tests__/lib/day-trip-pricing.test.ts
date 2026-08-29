// ============================================
// A day tour prices as a day trip, not a package
// ============================================
// The operator added their first real one-day template ("Memphis, Sakkara &
// Dahshur Day Trip", tour_type 'day_tour') and asked whether it would be
// priced as a package. Before the tour_type→package mapping it would have
// been: the engine SELECTed tour_type and never read it, and a single-day
// template with no explicit services defaulted airport arrival AND departure
// AND hotel check-in AND check-out onto its one day.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

function dayTripTables() {
  const tables = fullRateTables()
  tables.tour_templates = [{
    ...tables.tour_templates[0],
    tour_type: 'day_tour',
    duration_days: 1,
    // A hand-authored day: NO services object — exactly the shape the
    // operator's template will have, and the shape that used to trigger the
    // full-package defaults.
    itinerary: [{
      day: 1,
      title: 'Memphis, Sakkara & Dahshur Day Trip',
      city: 'Cairo',
      meals: { breakfast: 'none', lunch: 'none', dinner: 'none' },
      attractions: ['Giza Plateau'],
    }],
  }]
  return tables
}

describe('day-tour template pricing', () => {
  beforeEach(() => setMockTables(dayTripTables()))

  it("tour_type 'day_tour' prices as a day trip: no airport, no hotel services", async () => {
    const r: any = await calculateDayBasedPricing({
      templateId: TEMPLATE_ID,
      tier: 'standard',
      isEurPassport: false,
    })
    expect(r.success).toBe(true)
    const names = (r.days ?? []).flatMap((d: any) => (d.services ?? []).map((s: any) => `${s.type ?? s.service_type}:${s.name ?? s.service_name}`))
    const flat = JSON.stringify(r).toLowerCase()
    expect(flat).not.toContain('airport')
    expect(flat).not.toContain('hotel_service')
    expect(flat).not.toContain('porterage')
  })

  it('an explicit packageType from the caller still wins over tour_type', async () => {
    const r: any = await calculateDayBasedPricing({
      templateId: TEMPLATE_ID,
      packageType: 'full-package',
      tier: 'standard',
      isEurPassport: false,
    })
    expect(r.success).toBe(true)
    // Single-day full package: airport arrival+departure ARE sold — but a
    // one-day trip still never defaults hotel check-in (no overnight).
    const flat = JSON.stringify(r).toLowerCase()
    expect(flat).toContain('airport')
    expect(flat).not.toContain('hotel_service')
  })
})
