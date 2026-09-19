// A ticket leg runs FROM the previous day's city TO this day's city. That is
// right for a domestic hop and useless for the flight the customers arrive on:
// day 1 has no day before it, so an international arrival has no origin to
// infer and the leg is never collected at all.
//
// Migration 20261023 made it possible to PRICE Tokyo→Cairo. 20261024 makes it
// possible to SELL it — to put that flight on a real trip rather than only in
// a tour template or a calculator scratchpad.
import { vi, describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { collectTicketLegs } from '@/lib/auto-pricing-service'
import { airportCities, airportsFrom } from '@/lib/rates/airports'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('a day that names its own route', () => {
  it('collects the arrival leg that could not be inferred', () => {
    // Day 1 is the arrival. Without leg_from there is no previous city, so
    // this leg simply did not exist.
    const legs = collectTicketLegs([
      { day: 1, city: 'Cairo', transport_type: 'flight', leg_from: 'Tokyo', leg_to: 'Cairo' },
      { day: 2, city: 'Cairo' },
    ] as any)
    expect(legs).toEqual([
      { day: 1, mode: 'flight', from: 'Tokyo', to: 'Cairo', rateId: undefined },
    ])
  })

  it('still infers when the day says nothing', () => {
    const legs = collectTicketLegs([
      { day: 1, city: 'Cairo' },
      { day: 2, city: 'Luxor', transport_type: 'flight' },
    ] as any)
    expect(legs).toEqual([{ day: 2, mode: 'flight', from: 'Cairo', to: 'Luxor', rateId: undefined }])
  })
})

describe('the cities a leg may name', () => {
  const airports = airportsFrom([
    { key: 'nrt', label: 'Tokyo Narita', meta: { iata: 'NRT', city: 'Tokyo', country_code: 'JP' }, is_active: true },
    { key: 'hnd', label: 'Tokyo Haneda', meta: { iata: 'HND', city: 'Tokyo', country_code: 'JP' }, is_active: true },
    { key: 'cai', label: 'Cairo', meta: { iata: 'CAI', city: 'Cairo', country_code: 'EG' }, is_active: true },
    { key: 'lxr', label: 'Luxor', meta: { iata: 'LXR', city: 'Luxor', country_code: 'EG' }, is_active: true },
  ])

  it('is one entry per city, however many airports it has', () => {
    // Narita and Haneda are one Tokyo to a trip's days.
    expect(airportCities(airports).map(c => c.city)).toEqual(['Cairo', 'Luxor', 'Tokyo'])
  })

  it('builds itself from the vocabulary', () => {
    // Add an airport and its city becomes a place a trip can start. There is
    // no second list to maintain, which is the point.
    expect(airportCities(airports).find(c => c.city === 'Tokyo')?.countryCode).toBe('JP')
  })

  it('is empty when no airport has been entered', () => {
    expect(airportCities([])).toEqual([])
  })
})

describe('the editor and the pricing path agree', () => {
  it('the itinerary editor offers the route only on a flight day', () => {
    const src = read('app/itineraries/[id]/edit/page.tsx')
    expect(src).toContain("day.transport_type === 'flight' && (")
    expect(src).toContain('<LegCityOptions airports={airports}')
  })

  it('a blank route saves as null, not an empty string', () => {
    // Blank means "infer from the days either side" — which is what the
    // engine did before these columns existed.
    const src = read('app/itineraries/[id]/edit/page.tsx')
    expect(src).toMatch(/leg_from: day\.transport_type === 'flight' \? \(day\.leg_from \|\| null\) : null/)
  })

  it('a template built from an itinerary keeps the day’s travel', () => {
    // Without this the template forgets the day flew at all, and an
    // international arrival is not collected as a leg.
    const src = read('app/api/b2b/create-template-from-itinerary/route.ts')
    for (const field of ['transport_type:', 'transport_rate_id:', 'leg_from:', 'leg_to:', 'leg_assist:']) {
      expect(src).toContain(field)
    }
  })

  it('the columns exist in the migration and in the generated types', () => {
    const sql = read('migrations/20261024_itinerary_day_legs.sql')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS leg_from TEXT')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS leg_to TEXT')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS leg_assist JSONB')

    const types = read('types/database.types.ts')
    const days = types.slice(types.indexOf('itinerary_days: {'))
    expect(days.slice(0, 4000)).toContain('leg_from')
  })
})
