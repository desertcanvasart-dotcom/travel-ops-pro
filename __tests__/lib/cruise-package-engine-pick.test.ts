// Tours audit, 2026-10 (#2, #9): the engine priced a sailing with whichever
// active package of the right length Postgres returned first — a 5-day
// Multi-Day Tour, or a package for the other direction — and its hole
// message sent the operator to "Rates → Transport Packages", a menu that
// does not exist. Exercised through calculateAutoPricing on the shared
// fixtures, as cruise-package-days does.
import { vi, describe, it, expect, beforeAll } from 'vitest'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

const BASE = { orgId: 'org-1', templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'Japanese', marginPercent: 0, numPax: 2 }
const cruiseDay = (day: number, city: string) => ({ day, title: city, city, accommodation_type: 'cruise', is_cruise_day: true, attractions: [], meals: {}, services: {} })
const pkg = (id: string, van: number, over: Record<string, unknown> = {}) => ({
  id, org_id: 'org-1', package_code: id, package_name: id, package_type: 'cruise_sightseeing', duration_days: 5,
  origin_city: 'Luxor', destination_city: 'Aswan', created_at: '2026-01-01T00:00:00Z',
  sedan_rate: van, sedan_capacity: 3, minivan_rate: van, minivan_capacity: 7, van_rate: van, van_capacity: 12,
  minibus_rate: null, minibus_capacity: null, bus_rate: null, bus_capacity: null, includes: '', notes: null, is_active: true,
  ...over,
})

// Board in Luxor, four nights, leave the ship in Aswan: a 5-day cruise.
function tables(packages: unknown[]) {
  const t = fullRateTables() as any
  t.tour_templates[0].itinerary = [
    { day: 1, title: 'Luxor', city: 'Luxor', accommodation_type: 'hotel', attractions: [], meals: {}, services: {} },
    cruiseDay(2, 'Luxor'), cruiseDay(3, 'Edfu'), cruiseDay(4, 'Kom Ombo'), cruiseDay(5, 'Aswan'),
    { day: 6, title: 'Aswan', city: 'Aswan', accommodation_type: 'none', attractions: [], meals: {}, services: {} },
  ]
  t.tour_templates[0].duration_days = 6
  t.b2b_transport_packages = packages
  return t
}
const packageLine = async (packages: unknown[]) => {
  setMockTables(tables(packages))
  const r = await calculateAutoPricing(BASE) as any
  return r.services.find((s: any) => s.id === 'cruise-transport-package')
}

describe('which package prices the sailing', () => {
  it('the Cruise Sightseeing package, never a Multi-Day Tour of the same length — in either row order', async () => {
    const multi = pkg('Multi-Day Cairo→Alexandria', 900, { package_type: 'multi_day', origin_city: 'Cairo', destination_city: 'Alexandria', created_at: '2025-01-01T00:00:00Z' })
    const cruise = pkg('Cruise Sightseeing Luxor→Aswan', 400)
    expect(await packageLine([multi, cruise])).toMatchObject({ unitCost: 400, serviceName: '🚢 Cruise Sightseeing Luxor→Aswan' })
    expect(await packageLine([cruise, multi])).toMatchObject({ unitCost: 400 })
  })

  it('a package for the other direction does not price this sailing', async () => {
    const upstream = pkg('Aswan→Luxor', 300, { origin_city: 'Aswan', destination_city: 'Luxor', created_at: '2025-01-01T00:00:00Z' })
    expect(await packageLine([upstream, pkg('Luxor→Aswan', 400)])).toMatchObject({ unitCost: 400 })
    const line = await packageLine([upstream])
    expect(line).toMatchObject({ unpriced: true, lineTotal: 0 })
  })

  it('two packages that both fit: the first one created, whatever order they arrive in', async () => {
    const older = pkg('older', 400, { created_at: '2026-01-01T00:00:00Z' })
    const newer = pkg('newer', 500, { created_at: '2026-05-01T00:00:00Z' })
    expect((await packageLine([newer, older])).unitCost).toBe(400)
    expect((await packageLine([older, newer])).unitCost).toBe(400)
  })

  it('the No-rate message points at Tours › Transport Packages', async () => {
    const line = await packageLine([])
    expect(line.issue).toContain('No 5D cruise transport package (4 nights aboard)')
    expect(line.issue).toContain('Tours › Transport Packages')
    expect(line.issue).not.toContain('Rates →')
  })
})
