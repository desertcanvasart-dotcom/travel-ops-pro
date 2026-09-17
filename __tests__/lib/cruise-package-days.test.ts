import { vi, describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { setMockTables } from '../_mock-supabase'
import { TEMPLATE_ID, fullRateTables } from '../fixtures/sample-templates'
import { cruiseSailings, packageForDuration } from '@/lib/pricing/cruise-package'
import { groupLinesByDay, isTripWideLine } from '@/lib/pricing/group-by-day'

// Operator, 2026-09-17: NMS803 sails 4 nights — a 5-day cruise — and was sold
// the 4D sightseeing transport package, a different price. And the cruise
// days showed no transport at all, so the package read as forgotten.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateAutoPricing } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})

const aboard = (day: number) => ({ day, is_cruise_day: true })
const ashore = (day: number) => ({ day, is_cruise_day: false })

describe('a sailing\'s length in days', () => {
  it('4 nights aboard is a 5-day cruise, left on the day after the last night', () => {
    expect(cruiseSailings([ashore(1), aboard(2), aboard(3), aboard(4), aboard(5), ashore(6)])).toEqual([
      { nights: 4, durationDays: 5, nightDays: [2, 3, 4, 5], disembarkDay: 6 },
    ])
  })

  it('two sailings are two packages; a programme ending aboard has no disembark day', () => {
    const s = cruiseSailings([aboard(1), aboard(2), ashore(3), aboard(4)])
    expect(s.map(x => [x.durationDays, x.disembarkDay])).toEqual([[3, 3], [2, null]])
  })

  it('a package matches its exact length only — never the closest', () => {
    const pkgs = [{ id: '4d', duration_days: 4 }, { id: '5d', duration_days: 5 }]
    expect(packageForDuration(pkgs, 5)?.id).toBe('5d')
    expect(packageForDuration(pkgs, 6)).toBeNull()
  })
})

const BASE = { templateId: TEMPLATE_ID, tier: 'standard' as const, isEurPassport: false, language: 'Japanese', marginPercent: 0, numPax: 2 }
const cruiseDay = (day: number) => ({ day, title: 'Nile Cruise', city: 'Nile Cruise', overnight_city: 'Nile Cruise', accommodation_type: 'cruise', is_cruise_day: true, attractions: [], meals: {}, services: {} })
const pkg = (id: string, days: number, van: number) => ({
  id, package_code: id, package_name: `${days}D Cruise Sightseeing Transport`, package_type: 'cruise_sightseeing', duration_days: days,
  sedan_rate: van, sedan_capacity: 3, minivan_rate: van, minivan_capacity: 7, van_rate: van, van_capacity: 12,
  minibus_rate: null, minibus_capacity: null, bus_rate: null, bus_capacity: null, includes: '', notes: null, is_active: true,
})

function tables(packages: unknown[]) {
  const t = fullRateTables() as any
  t.tour_templates[0].itinerary = [
    { day: 1, title: 'Luxor', city: 'Luxor', accommodation_type: 'hotel', attractions: [], meals: {}, services: {} },
    cruiseDay(2), cruiseDay(3), cruiseDay(4), cruiseDay(5),
    { day: 6, title: 'Aswan', city: 'Aswan', accommodation_type: 'none', attractions: [], meals: {}, services: {} },
  ]
  t.tour_templates[0].duration_days = 6
  t.b2b_transport_packages = packages
  return t
}

describe('the engine picks the package by the sailing\'s days', () => {
  it('a 4-night cruise is priced with the 5D package, listed once for the whole trip', async () => {
    setMockTables(tables([pkg('p4', 4, 100), pkg('p5', 5, 150)]))
    const r = await calculateAutoPricing(BASE) as any
    const line = r.services.find((s: any) => s.id === 'cruise-transport-package')
    expect(line).toMatchObject({ serviceName: '🚢 5D Cruise Sightseeing Transport', unitCost: 150, dayNumber: 2 })
    expect(isTripWideLine(line.id)).toBe(true)
  })

  it('every day the package covers reads as included in it, at 0', async () => {
    setMockTables(tables([pkg('p5', 5, 150)]))
    const r = await calculateAutoPricing(BASE) as any
    const included = r.services.filter((s: any) => /-cruise-transport-included$/.test(s.id))
    expect(included.map((s: any) => [s.dayNumber, s.serviceName, s.lineTotal, s.included])).toEqual([
      [2, 'Sightseeing transport', 0, true],
      [3, 'Sightseeing transport', 0, true],
      [4, 'Sightseeing transport', 0, true],
      [5, 'Sightseeing transport', 0, true],
      [6, 'Transfer off the ship', 0, true],
    ])
    expect(included[0].issue).toBe('Included in 5D Cruise Sightseeing Transport')
    // They stay on their own days, not under Whole trip.
    const days = groupLinesByDay(r.services as any[], (s: any) => ({ id: s.id, category: s.serviceType, dayNumber: s.dayNumber }))
    expect(days.find(g => g.day === 3)?.lines.map((s: any) => s.id)).toContain('day3-cruise-transport-included')
  })

  it('only a 4D package on file: the 5-day cruise is No rate, not the 4D price', async () => {
    setMockTables(tables([pkg('p4', 4, 100)]))
    const r = await calculateAutoPricing(BASE) as any
    const line = r.services.find((s: any) => s.id === 'cruise-transport-package')
    expect(line).toMatchObject({ unpriced: true, lineTotal: 0 })
    expect(line.issue).toContain('No 5D cruise transport package (4 nights aboard)')
  })
})

describe('the tour page shows what the calculator shows', () => {
  it('marks No rate and Included lines, and asks for a guide language that has a rate', () => {
    const src = readFileSync('app/tours/[code]/page.tsx', 'utf8')
    expect(src).toContain("t('detail.noRate')")
    expect(src).toContain("t('detail.included')")
    expect(src).toContain('language: guideLanguage')
  })

  it('a saved quote marks Included lines too', () => {
    expect(readFileSync('app/b2b/quotes/[id]/page.tsx', 'utf8')).toContain('service.included')
  })
})
