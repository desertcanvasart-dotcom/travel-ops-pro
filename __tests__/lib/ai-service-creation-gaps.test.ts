// The AI itinerary generator's guesses (lib/ai/service-creation.ts), owner
// 2026-11-19: a missing price is a gap, never a guess.
//
//   OLD: transport took the first row the database returned (.limit(1)); a
//        day in a city with no rate used the MAIN city's vehicle; a missing
//        rate was a silent €0; a guide came from the old guides list down to
//        ANY guide; a meal fell back to any tier, then to the average of every
//        restaurant of every city.
//   NEW: transport by the engine's rule (starred, else one company's cheapest
//        for the group; several companies and none starred is none); no
//        other city's rate; a €0 transport line says so on the line and in
//        the warnings; guides and meals by the engine's picks only.
import { vi, describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { chooseCityTransportRow } from '@/lib/ai/service-creation'

const v = (rate: number) => [{ key: 'sedan', rate_eur: rate, rate_non_eur: null, capacity_min: 1, capacity_max: 2 }]
const row = (id: string, rate: number, over: Record<string, unknown> = {}) => ({
  id, route_name: id, service_type: 'day_tour', city: 'Luxor', vehicles: v(rate), is_active: true,
  rate_valid_from: '2020-01-01', rate_valid_to: '2099-12-31', supplier_id: 'sup-a', supplier_name: 'A Cars', ...over,
})

describe('chooseCityTransportRow', () => {
  it('one company: the cheapest for the group, not the first row', () => {
    expect(chooseCityTransportRow([row('dear', 60), row('cheap', 45)], 2)?.id).toBe('cheap')
  })
  it('the starred one wins', () => {
    expect(chooseCityTransportRow([row('cheap', 45), row('star', 60, { is_preferred: true })], 2)?.id).toBe('star')
  })
  it('several companies and none starred: none (a gap)', () => {
    expect(chooseCityTransportRow([row('a', 45), row('b', 50, { supplier_id: 'sup-b', supplier_name: 'B Cars' })], 2)).toBeNull()
  })
  it('no rows: none', () => {
    expect(chooseCityTransportRow([], 2)).toBeNull()
    expect(chooseCityTransportRow(null, 2)).toBeNull()
  })
  it('an expired rate is not a candidate', () => {
    expect(chooseCityTransportRow([row('old', 30, { rate_valid_to: '2021-01-01' })], 2)).toBeNull()
  })
})

describe('the generator no longer guesses', () => {
  const src = readFileSync(join(process.cwd(), 'lib/ai/service-creation.ts'), 'utf8')
  it('no first-row transport, no main-city fallback for another city', () => {
    expect(src).not.toMatch(/from\('transportation_rates'\)[^;]*?\.ilike\('city'[^;]*?\.limit\(1\)/)
    expect(src).not.toContain('using ${effectiveCity} rate')
    expect(src).not.toContain(': primaryRates.vehiclePerDay')
  })
  it('a €0 transport line is flagged on the line and in the warnings, before it is saved', () => {
    expect(src.match(/flagUnpricedTransport\((services|departureServices), dayNumber, warnings\)/g)).toHaveLength(2)
  })
  it('guides and meals by the engine picks only: no old guides list, no average, no any-tier', () => {
    expect(src).not.toContain("from('guides')")
    expect(src).toContain("pickGuideRate(guideRates ?? []")
    expect(src).toContain('pickMealRate(allMeals.filter(r => (r.tier')
    expect(src).not.toContain('using generic rate')
  })
})
